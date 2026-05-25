import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import type { NowPlaying, PlaybackState, RepeatMode, StreamInfo, StreamStatus } from "@/lib/types";
import { getSong } from "@/lib/db/songs";
import { resolveSongFilePath, songFileExists } from "@/lib/upload/resolve-song-path";
import { popNextFromQueue, getQueue, fillQueueFromPlaylist } from "@/lib/db/queue";
import { addToHistory } from "@/lib/db/history";
import { getRadioSettings, updateRadioSettings, updateStreamStats } from "@/lib/db/settings";
import { getActiveShowNow } from "@/lib/db/shows";
import { getMatuClient } from "@/lib/db/matu";
import { IcecastPipeline } from "@/lib/radio-engine/icecast-pipeline";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "songs");

function parseRepeatMode(value?: string | null): RepeatMode {
  if (value === "one" || value === "all") return value;
  return "off";
}

export class RadioEngine extends EventEmitter {
  private pipeline: IcecastPipeline;
  private broadcastEnabled = false;
  private playbackState: PlaybackState = "stopped";
  private nowPlaying: NowPlaying | null = null;
  private startedAt: Date | null = null;
  private elapsedTimer: NodeJS.Timeout | null = null;
  private activeListeners = 0;
  private streamStatus: StreamStatus = "offline";
  private streamStartTime: Date | null = null;
  private micEnabled = false;
  private isLiveDj = false;
  private musicVolume = 85;
  private micVolume = 100;
  private ducking = true;
  private repeatMode: RepeatMode = "off";
  private handlingTrackEnd = false;

  constructor() {
    super();
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    const host = process.env.ICECAST_HOST ?? "127.0.0.1";
    const port = process.env.ICECAST_PORT ?? "8000";
    const password = process.env.ICECAST_PASSWORD ?? "hackme";
    const mount = process.env.ICECAST_MOUNT ?? "/stream";
    const bitrate = process.env.ICECAST_BITRATE ?? "128";
    const url = `icecast://source:${password}@${host}:${port}${mount}`;
    this.pipeline = new IcecastPipeline(url, bitrate);
    this.pipeline.setTrackEndHandler(() => {
      this.onTrackEnded().catch((err) => console.error("[RadioEngine] onTrackEnded:", err));
    });
  }

  async init() {
    const settings = await getRadioSettings();
    this.playbackState = settings.playback_state as PlaybackState;
    this.micEnabled = settings.mic_enabled;
    this.isLiveDj = settings.is_live_dj;
    this.repeatMode = parseRepeatMode(settings.repeat_mode);

    if (settings.current_song_id) {
      try {
        const song = await getSong(settings.current_song_id);
        this.nowPlaying = {
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          coverUrl: song.cover_url,
          duration: song.duration,
          elapsed: 0,
          startedAt: new Date().toISOString(),
        };
      } catch {
        /* song may have been deleted */
      }
    }

    this.broadcastEnabled = true;
    this.setStreamStatus("connecting");

    if (this.playbackState === "playing" && this.nowPlaying) {
      try {
        await this.startMusicStream();
        this.startedAt = new Date(this.nowPlaying.startedAt);
        this.startElapsedTimer();
      } catch (err) {
        console.error("[RadioEngine] init música falló:", err);
        await this.startSilenceHolder();
        this.playbackState = "paused";
        await updateRadioSettings({ playback_state: "paused" });
      }
    } else {
      await this.startSilenceHolder();
    }
  }

  /** Watchdog — remonta encoder si se cayó (sin matar mount en cada canción) */
  async ensureMountAlive() {
    if (!this.broadcastEnabled) return;
    if (this.pipeline.isConnected()) return;

    console.log("[RadioEngine] Watchdog: reconectando encoder...");
    this.setStreamStatus("connecting");
    if (this.playbackState === "playing" && this.nowPlaying) {
      await this.startMusicStream();
    } else {
      await this.startSilenceHolder();
    }
  }

  async ensureBroadcastOnline() {
    this.broadcastEnabled = true;
    if (!this.pipeline.isConnected()) {
      if (this.playbackState === "playing" && this.nowPlaying) {
        await this.startMusicStream();
      } else {
        await this.startSilenceHolder();
      }
    }
  }

  async startSilenceHolder() {
    await this.pipeline.playSilence();
    this.setStreamStatus("online");
  }

  async startMusicStream() {
    if (!this.nowPlaying) {
      await this.startSilenceHolder();
      return;
    }

    const song = await getSong(this.nowPlaying.id);
    const inputFile = resolveSongFilePath(song.file_path);

    if (!inputFile.startsWith("http") && !songFileExists(song.file_path)) {
      throw new Error(`Archivo MP3 no encontrado: ${path.basename(song.file_path)}`);
    }

    const artist = song.artist?.trim() || "LogsFM";
    await this.pipeline.playFile(
      inputFile,
      { title: song.title, artist },
      this.musicVolume / 100,
    );
    this.setStreamStatus("online");
  }

  getState() {
    const uptime = this.streamStartTime
      ? Math.floor((Date.now() - this.streamStartTime.getTime()) / 1000)
      : 0;

    return {
      playback: this.playbackState,
      nowPlaying: this.nowPlaying,
      isLiveDj: this.isLiveDj,
      micEnabled: this.micEnabled,
      broadcastEnabled: this.broadcastEnabled,
      streamMode: this.pipeline.getMode(),
      stream: {
        status: this.streamStatus,
        listeners: this.activeListeners,
        peakListeners: this.activeListeners,
        bitrate: parseInt(process.env.ICECAST_BITRATE ?? "128", 10),
        format: "mp3",
        uptime,
        mountPoint: process.env.ICECAST_MOUNT ?? "/stream",
      } as StreamInfo,
    };
  }

  async play() {
    if (this.playbackState === "playing") return;

    this.broadcastEnabled = true;

    const queue = await getQueue();
    if (queue.length === 0) await this.ensureQueueFromActivePlaylist();
    if (!this.nowPlaying) await this.loadNextTrack();

    if (!this.nowPlaying) {
      throw new Error("No hay canciones en la cola. Carga una playlist o agrega canciones.");
    }

    await this.startMusicStream();
    this.playbackState = "playing";
    this.startedAt = new Date();
    this.nowPlaying.startedAt = this.startedAt.toISOString();
    this.nowPlaying.elapsed = 0;
    this.startElapsedTimer();
    await updateRadioSettings({ playback_state: "playing" });
    this.emitState();
  }

  async pause() {
    this.playbackState = "paused";
    this.stopElapsedTimer();
    await this.startSilenceHolder();
    await updateRadioSettings({ playback_state: "paused" });
    this.emitState();
  }

  async stop() {
    this.playbackState = "stopped";
    this.nowPlaying = null;
    this.stopElapsedTimer();
    await updateRadioSettings({ playback_state: "stopped", current_song_id: null });
    await this.startSilenceHolder();
    this.emitState();
  }

  async loadPlaylist(playlistId: string, autoPlay = false) {
    const { setActivePlaylist } = await import("@/lib/db/playlists");
    const pl = await setActivePlaylist(playlistId);
    await fillQueueFromPlaylist(playlistId, pl.shuffle);
    this.nowPlaying = null;
    if (autoPlay) await this.play();
    else this.emitState();
  }

  async playNow(songId: string) {
    const song = await getSong(songId);
    const { clearQueue, addToQueue } = await import("@/lib/db/queue");
    await clearQueue();
    await addToQueue(songId);

    this.broadcastEnabled = true;
    this.nowPlaying = {
      id: song.id,
      title: song.title,
      artist: song.artist,
      coverUrl: song.cover_url,
      duration: song.duration,
      elapsed: 0,
      startedAt: new Date().toISOString(),
    };

    await updateRadioSettings({ current_song_id: song.id, playback_state: "playing" });
    await this.startMusicStream();
    this.playbackState = "playing";
    this.startedAt = new Date();
    this.startElapsedTimer();
    this.emitState();
  }

  setVolume(musicVolume: number, micVolume: number, ducking: boolean) {
    this.musicVolume = musicVolume;
    this.micVolume = micVolume;
    this.ducking = ducking;
  }

  private async ensureQueueFromActivePlaylist() {
    try {
      const db = getMatuClient();
      const { data } = await db
        .from("playlists")
        .select("id, shuffle")
        .eq("is_active", true)
        .limit(1)
        .single();
      if (data?.id) {
        await fillQueueFromPlaylist(data.id as string, Boolean(data.shuffle));
      }
    } catch {
      /* no active playlist */
    }
  }

  async next() {
    if (this.nowPlaying) {
      await addToHistory({
        song_id: this.nowPlaying.id,
        title: this.nowPlaying.title,
        artist: this.nowPlaying.artist,
        cover_url: this.nowPlaying.coverUrl,
        duration: this.nowPlaying.duration,
      });
    }

    await this.loadNextTrack();
    if (this.playbackState === "playing" && this.nowPlaying) {
      this.startedAt = new Date();
      this.nowPlaying.startedAt = this.startedAt.toISOString();
      this.nowPlaying.elapsed = 0;
      await this.startMusicStream();
    }
    this.emitState();
  }

  async replayCurrent() {
    if (!this.nowPlaying) return;
    this.startedAt = new Date();
    this.nowPlaying.startedAt = this.startedAt.toISOString();
    this.nowPlaying.elapsed = 0;
    if (this.playbackState !== "playing") {
      this.playbackState = "playing";
      await updateRadioSettings({ playback_state: "playing" });
      this.startElapsedTimer();
    }
    await this.startMusicStream();
    this.emitState();
  }

  private async onTrackEnded() {
    if (this.handlingTrackEnd) return;
    this.handlingTrackEnd = true;
    try {
      if (this.nowPlaying) {
        await addToHistory({
          song_id: this.nowPlaying.id,
          title: this.nowPlaying.title,
          artist: this.nowPlaying.artist,
          cover_url: this.nowPlaying.coverUrl,
          duration: this.nowPlaying.duration,
        });
      }

      if (this.repeatMode === "one" && this.nowPlaying) {
        const song = await getSong(this.nowPlaying.id);
        this.nowPlaying = {
          id: song.id,
          title: song.title,
          artist: song.artist,
          coverUrl: song.cover_url,
          duration: song.duration,
          elapsed: 0,
          startedAt: new Date().toISOString(),
        };
        this.startedAt = new Date();
        await updateRadioSettings({ current_song_id: song.id });
        await this.startMusicStream();
        this.emitState();
        return;
      }

      await this.loadNextTrack();
      if (this.playbackState === "playing" && this.nowPlaying) {
        this.startedAt = new Date();
        this.nowPlaying.startedAt = this.startedAt.toISOString();
        this.nowPlaying.elapsed = 0;
        await this.startMusicStream();
      } else if (this.broadcastEnabled) {
        await this.startSilenceHolder();
      }
      this.emitState();
    } finally {
      this.handlingTrackEnd = false;
    }
  }

  async previous() {
    const history = await import("@/lib/db/history").then((m) => m.getHistory(2));
    if (history.length < 2) return;

    const prev = history[1];
    this.nowPlaying = {
      id: prev.song_id,
      title: prev.title,
      artist: prev.artist,
      coverUrl: prev.cover_url,
      duration: prev.duration,
      elapsed: 0,
      startedAt: new Date().toISOString(),
    };

    if (this.playbackState === "playing") {
      this.startedAt = new Date();
      await this.startMusicStream();
    }
    this.emitState();
  }

  async toggleAutoDj() {
    const settings = await getRadioSettings();
    const autoDj = !settings.auto_dj;
    await updateRadioSettings({ auto_dj: autoDj });

    if (autoDj) {
      const activeShow = await getActiveShowNow();
      if (activeShow?.playlist_id) {
        await fillQueueFromPlaylist(activeShow.playlist_id);
      } else {
        const db = getMatuClient();
        const { data } = await db
          .from("playlists")
          .select("id")
          .eq("is_active", true)
          .limit(1)
          .single();
        if (data?.id) {
          await fillQueueFromPlaylist(data.id as string, settings.shuffle);
        }
      }
    }

    return autoDj;
  }

  async toggleShuffle() {
    const settings = await getRadioSettings();
    const shuffle = !settings.shuffle;
    await updateRadioSettings({ shuffle });
    return shuffle;
  }

  async toggleRepeat() {
    const cycle: RepeatMode[] = ["off", "all", "one"];
    const idx = cycle.indexOf(this.repeatMode);
    this.repeatMode = cycle[(idx + 1) % cycle.length];
    await updateRadioSettings({ repeat_mode: this.repeatMode }).catch(() => {});
    return this.repeatMode;
  }

  setListeners(count: number) {
    this.activeListeners = count;
    updateStreamStats({ listeners: count }).catch(() => {});
  }

  syncIcecastStatus(hasActiveSource: boolean, icecastReachable: boolean) {
    if (!icecastReachable) {
      this.setStreamStatus("error");
      return;
    }
    if (hasActiveSource || this.broadcastEnabled) {
      this.setStreamStatus("online");
    }
  }

  setStreamStatus(status: StreamStatus) {
    this.streamStatus = status;
    if (status === "online" && !this.streamStartTime) {
      this.streamStartTime = new Date();
    }
    const uptime = this.streamStartTime
      ? Math.floor((Date.now() - this.streamStartTime.getTime()) / 1000)
      : 0;
    updateStreamStats({ status, uptime_seconds: uptime }).catch(() => {});
  }

  async goLive(djName?: string) {
    this.isLiveDj = true;
    this.micEnabled = false;
    await updateRadioSettings({
      is_live_dj: true,
      mic_enabled: false,
      current_dj_name: djName ?? "DJ Live",
      show_started_at: new Date().toISOString(),
    });
  }

  async stopLive() {
    this.isLiveDj = false;
    this.micEnabled = false;
    await updateRadioSettings({ is_live_dj: false, mic_enabled: false, current_dj_name: null });
  }

  async toggleMic() {
    this.micEnabled = !this.micEnabled;
    await updateRadioSettings({ mic_enabled: this.micEnabled });
    return this.micEnabled;
  }

  private async loadNextTrack() {
    let next = await popNextFromQueue();

    if (!next && this.repeatMode === "all") {
      await this.ensureQueueFromActivePlaylist();
      next = await popNextFromQueue();
    }

    if (!next) {
      this.nowPlaying = null;
      this.playbackState = "paused";
      this.stopElapsedTimer();
      await updateRadioSettings({ playback_state: "paused", current_song_id: null });
      await this.startSilenceHolder();
      return;
    }

    this.nowPlaying = {
      id: next.song_id,
      title: next.title,
      artist: next.artist,
      coverUrl: next.cover_url,
      duration: next.duration,
      elapsed: 0,
      startedAt: new Date().toISOString(),
    };
    await updateRadioSettings({ current_song_id: next.song_id });
  }

  private startElapsedTimer() {
    this.stopElapsedTimer();
    this.elapsedTimer = setInterval(() => {
      if (this.nowPlaying && this.startedAt) {
        this.nowPlaying.elapsed = Math.floor(
          (Date.now() - this.startedAt.getTime()) / 1000,
        );
      }
    }, 1000);
  }

  private stopElapsedTimer() {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  private emitState() {
    this.emit("state-change", this.getState());
  }

  async getFullState() {
    const queue = await getQueue();
    const history = await import("@/lib/db/history").then((m) => m.getHistory(20));
    const settings = await getRadioSettings();
    const streamStats = await import("@/lib/db/settings").then((m) =>
      m.getStreamStats().catch(() => null),
    );
    const activeShow = await getActiveShowNow();
    const base = this.getState();

    const elapsed =
      this.nowPlaying && this.startedAt && this.playbackState === "playing"
        ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000)
        : (this.nowPlaying?.elapsed ?? 0);

    const nowPlaying = this.nowPlaying
      ? { ...this.nowPlaying, elapsed: Math.min(elapsed, this.nowPlaying.duration) }
      : null;

    const liveStatus = this.pipeline.isConnected() ? "online" : base.stream.status;

    return {
      ...base,
      nowPlaying,
      playback: this.playbackState,
      isLiveDj: settings.is_live_dj,
      micEnabled: settings.mic_enabled,
      stream: streamStats
        ? {
            status: liveStatus as StreamInfo["status"],
            listeners: streamStats.listeners,
            peakListeners: streamStats.peak_listeners,
            bitrate: streamStats.bitrate,
            format: "mp3",
            uptime: streamStats.uptime_seconds,
            mountPoint: process.env.ICECAST_MOUNT ?? "/stream",
          }
        : { ...base.stream, status: liveStatus as StreamInfo["status"] },
      autoDj: settings.auto_dj,
      shuffle: settings.shuffle,
      repeatMode: this.repeatMode,
      queue: queue.map((q, i) => ({
        id: q.id,
        songId: q.song_id,
        title: q.title,
        artist: q.artist,
        coverUrl: q.cover_url,
        duration: q.duration,
        position: i,
      })),
      history: history.map((h) => ({
        id: h.id,
        songId: h.song_id,
        title: h.title,
        artist: h.artist,
        coverUrl: h.cover_url,
        playedAt: h.played_at,
        duration: h.duration,
      })),
      currentShow: activeShow
        ? {
            id: activeShow.id,
            name: activeShow.name,
            djName: activeShow.dj_name,
            description: activeShow.description,
            startedAt: new Date().toISOString(),
            isLive: base.isLiveDj,
          }
        : settings.current_show_name
          ? {
              id: "manual",
              name: settings.current_show_name,
              djName: settings.current_dj_name,
              startedAt: settings.show_started_at ?? new Date().toISOString(),
              isLive: base.isLiveDj,
            }
          : null,
    };
  }
}

let engine: RadioEngine | null = null;

export function getRadioEngine() {
  if (!engine) engine = new RadioEngine();
  return engine;
}
