import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import type {
  NowPlaying,
  PlaybackMode,
  PlaybackState,
  RepeatMode,
  StreamInfo,
  StreamStatus,
} from "@/lib/types";
import { getSong } from "@/lib/db/songs";
import { resolveSongFilePath, songFileExists } from "@/lib/upload/resolve-song-path";
import {
  popNextFromQueue,
  getQueue,
  fillQueueFromPlaylist,
  advanceQueuePastSong,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  clearQueue,
} from "@/lib/db/queue";
import { clearActivePlaylist, getPlaylist } from "@/lib/db/playlists";
import { checkFfmpeg } from "@/lib/radio-engine/ffmpeg-check";
import { logIcecastTarget, isMountFree, icecastSourceGapMs } from "@/lib/radio-engine/icecast-mount";
import { addToHistory } from "@/lib/db/history";
import { getRadioSettings, updateRadioSettings, updateStreamStats } from "@/lib/db/settings";
import { getActiveShowNow } from "@/lib/db/shows";
import { getMatuClient } from "@/lib/db/matu";
import { createStreamOutput, type StreamOutput } from "@/lib/radio-engine/stream-factory";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "songs");

function parseRepeatMode(value?: string | null): RepeatMode {
  if (value === "one" || value === "all") return value;
  return "off";
}

function parsePlaybackMode(value?: string | null): PlaybackMode {
  if (value === "playlist" || value === "single") return value;
  return "manual";
}

export class RadioEngine extends EventEmitter {
  private pipeline: StreamOutput;
  private streamingTrackId: string | null = null;
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
  private playbackMode: PlaybackMode = "manual";
  private activePlaylistId: string | null = null;
  private ffmpegOk = false;
  private handlingTrackEnd = false;
  private engineLock: Promise<void> = Promise.resolve();

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
    this.pipeline = createStreamOutput(url, bitrate, { host, port, mount });
    this.pipeline.setTrackEndHandler(() => {
      this.onTrackEnded().catch((err) => console.error("[RadioEngine] onTrackEnded:", err));
    });
  }

  private runLocked<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.engineLock.then(() => fn());
    this.engineLock = next.then(
      () => {},
      () => {},
    );
    return next;
  }

  async init() {
    const ff = checkFfmpeg();
    this.ffmpegOk = ff.ok;
    if (ff.ok) {
      console.log(`[RadioEngine] FFmpeg OK: ${ff.version ?? ff.path}`);
    } else {
      console.error(`[RadioEngine] FFmpeg NO disponible (${ff.path}): ${ff.error}`);
    }

    const host = process.env.ICECAST_HOST ?? "127.0.0.1";
    const port = process.env.ICECAST_PORT ?? "8000";
    const mount = process.env.ICECAST_MOUNT ?? "/stream";
    logIcecastTarget({ host, port, mount });
    try {
      const free = await isMountFree({ host, port, mount });
      console.log(
        `[Icecast] Mount ${mount}: ${free ? "libre" : "ocupado (esperará al cambiar pista)"}`,
      );
    } catch {
      console.error(
        "[Icecast] No se pudo leer status-json — ¿icecast2 activo? systemctl status icecast2",
      );
    }
    console.log(`[Icecast] Pausa entre fuentes: ${icecastSourceGapMs()}ms`);

    const settings = await getRadioSettings();
    this.playbackState = settings.playback_state as PlaybackState;
    this.playbackMode = parsePlaybackMode(settings.playback_mode);
    this.activePlaylistId = settings.active_playlist_id ?? null;
    this.micEnabled = settings.mic_enabled;
    this.isLiveDj = settings.is_live_dj;
    this.repeatMode = parseRepeatMode(settings.repeat_mode);
    const storedVol = settings.music_volume;
    if (typeof storedVol === "number" && storedVol >= 0 && storedVol <= 100) {
      this.musicVolume = storedVol;
    }

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

    if (this.playbackState === "playing" && !this.nowPlaying) {
      this.playbackState = "paused";
      await updateRadioSettings({ playback_state: "paused", current_song_id: null });
    }

    this.broadcastEnabled = true;
    this.setStreamStatus("connecting");

    await this.runLocked(async () => {
      if (this.playbackState === "playing" && this.nowPlaying) {
        try {
          await advanceQueuePastSong(this.nowPlaying.id);
          await this.startMusicStream();
          this.startedAt = new Date(this.nowPlaying!.startedAt);
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
    });
  }

  /** Watchdog — remonta encoder si se cayó (sin matar mount en cada canción) */
  async ensureMountAlive() {
    if (!this.broadcastEnabled) return;
    if (this.pipeline.isConnected()) return;

    return this.runLocked(async () => {
      console.log("[RadioEngine] Watchdog: reconectando encoder...");
      this.setStreamStatus("connecting");
      if (this.playbackState === "playing" && this.nowPlaying) {
        await this.startMusicStream();
      } else {
        await this.startSilenceHolder();
      }
    });
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
    this.streamingTrackId = this.nowPlaying.id;
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
    return this.runLocked(() => this.playInternal());
  }

  private async playInternal() {
    if (this.playbackState === "playing") return;

    this.broadcastEnabled = true;

    const queue = await getQueue();
    if (queue.length === 0 && this.playbackMode === "playlist") {
      await this.ensureQueueFromActivePlaylist();
    }
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
    await updateRadioSettings({
      playback_state: "playing",
      current_song_id: this.nowPlaying.id,
      playback_mode: this.playbackMode,
      active_playlist_id: this.activePlaylistId,
    });
    this.emitState();
  }

  private async persistMode() {
    await updateRadioSettings({
      playback_mode: this.playbackMode,
      active_playlist_id: this.activePlaylistId,
    }).catch(() => {});
  }

  async pause() {
    return this.runLocked(async () => {
      this.playbackState = "paused";
      this.stopElapsedTimer();
      await this.startSilenceHolder();
      await updateRadioSettings({ playback_state: "paused" });
      this.emitState();
    });
  }

  async stop() {
    return this.runLocked(async () => {
      this.playbackState = "stopped";
      this.nowPlaying = null;
      this.streamingTrackId = null;
      this.stopElapsedTimer();
      await updateRadioSettings({ playback_state: "stopped", current_song_id: null });
      await this.pipeline.stopHard();
      this.setStreamStatus("online");
      this.emitState();
    });
  }

  async loadPlaylist(playlistId: string, autoPlay = false) {
    return this.runLocked(async () => {
      const { setActivePlaylist } = await import("@/lib/db/playlists");
      const pl = await setActivePlaylist(playlistId);
      await fillQueueFromPlaylist(playlistId, pl.shuffle);

      this.playbackMode = "playlist";
      this.activePlaylistId = playlistId;
      this.streamingTrackId = null;

      const queue = await getQueue();
      if (queue.length === 0) {
        throw new Error("La playlist no tiene canciones.");
      }

      if (autoPlay) {
        this.nowPlaying = null;
        await this.playInternal();
      } else {
        this.playbackState = "stopped";
        this.nowPlaying = null;
        this.stopElapsedTimer();
        await updateRadioSettings({
          playback_state: "stopped",
          current_song_id: null,
          playback_mode: "playlist",
          active_playlist_id: playlistId,
        });
        await this.pipeline.stopHard();
        this.setStreamStatus("online");
        this.emitState();
      }
    });
  }

  /** Cola manual: quitar modo playlist sin borrar canciones en cola. */
  async useManualMode() {
    return this.runLocked(async () => {
      await clearActivePlaylist();
      this.playbackMode = "manual";
      this.activePlaylistId = null;
      await this.persistMode();
      this.emitState();
    });
  }

  async playNow(songId: string) {
    return this.runLocked(async () => {
      const song = await getSong(songId);
      await clearActivePlaylist();
      await clearQueue();

      this.playbackMode = "single";
      this.activePlaylistId = null;
      this.broadcastEnabled = true;
      this.streamingTrackId = null;
      this.nowPlaying = {
        id: song.id,
        title: song.title,
        artist: song.artist,
        coverUrl: song.cover_url,
        duration: song.duration,
        elapsed: 0,
        startedAt: new Date().toISOString(),
      };

      await updateRadioSettings({
        current_song_id: song.id,
        playback_state: "playing",
        playback_mode: "single",
        active_playlist_id: null,
      });
      await this.startMusicStream();
      this.playbackState = "playing";
      this.startedAt = new Date();
      this.startElapsedTimer();
      this.emitState();
    });
  }

  async addToQueueItem(songId: string) {
    return this.runLocked(async () => {
      if (this.playbackMode === "playlist") {
        await clearActivePlaylist();
        this.activePlaylistId = null;
      }
      this.playbackMode = "manual";
      await addToQueue(songId, "manual");
      await this.persistMode();
      this.emitState();
    });
  }

  async removeQueueItem(queueItemId: string) {
    return this.runLocked(async () => {
      await removeFromQueue(queueItemId);
      this.playbackMode = "manual";
      this.activePlaylistId = null;
      await clearActivePlaylist();
      await this.persistMode();
      this.emitState();
    });
  }

  async reorderQueueItems(items: { id: string; position: number }[]) {
    return this.runLocked(async () => {
      await reorderQueue(items);
      this.emitState();
    });
  }

  async clearQueueAll() {
    return this.runLocked(async () => {
      await clearQueue();
      this.playbackMode = "manual";
      this.activePlaylistId = null;
      await clearActivePlaylist();
      this.streamingTrackId = null;
      this.playbackState = "stopped";
      this.nowPlaying = null;
      this.stopElapsedTimer();
      await updateRadioSettings({
        playback_state: "stopped",
        current_song_id: null,
        playback_mode: "manual",
        active_playlist_id: null,
      });
      await this.pipeline.stopHard();
      this.setStreamStatus("online");
      await this.persistMode();
      this.emitState();
    });
  }

  async setVolume(musicVolume: number, micVolume: number, ducking: boolean) {
    this.musicVolume = musicVolume;
    this.micVolume = micVolume;
    this.ducking = ducking;

    await updateRadioSettings({ music_volume: musicVolume }).catch(() => {});

    if (this.playbackState === "playing" && this.pipeline.getMode() === "music") {
      await this.runLocked(() =>
        this.pipeline.restartCurrentDecoder(musicVolume / 100),
      );
    }
  }

  private async ensureQueueFromActivePlaylist() {
    if (this.playbackMode !== "playlist") return;

    const playlistId = this.activePlaylistId;
    if (!playlistId) {
      try {
        const db = getMatuClient();
        const { data } = await db
          .from("playlists")
          .select("id, shuffle")
          .eq("is_active", true)
          .limit(1)
          .single();
        if (data?.id) {
          this.activePlaylistId = data.id as string;
          await fillQueueFromPlaylist(data.id as string, Boolean(data.shuffle));
          await this.persistMode();
        }
      } catch {
        /* no active playlist */
      }
      return;
    }

    try {
      const pl = await getPlaylist(playlistId);
      await fillQueueFromPlaylist(playlistId, pl.shuffle);
    } catch {
      /* playlist missing */
    }
  }

  async next() {
    return this.runLocked(async () => {
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
      this.streamingTrackId = null;
      if (this.playbackState === "playing" && this.nowPlaying) {
        this.startedAt = new Date();
        this.nowPlaying.startedAt = this.startedAt.toISOString();
        this.nowPlaying.elapsed = 0;
        await this.startMusicStream();
      }
      this.emitState();
    });
  }

  async replayCurrent() {
    return this.runLocked(async () => {
      if (!this.nowPlaying) return;
      this.streamingTrackId = null;
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
    });
  }

  private async onTrackEnded() {
    if (this.handlingTrackEnd) return;
    this.handlingTrackEnd = true;
    try {
      await this.runLocked(async () => {
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
      this.streamingTrackId = null;
      if (this.playbackState === "playing" && this.nowPlaying) {
        await new Promise((r) => setTimeout(r, icecastSourceGapMs()));
        this.startedAt = new Date();
        this.nowPlaying.startedAt = this.startedAt.toISOString();
        this.nowPlaying.elapsed = 0;
        await this.startMusicStream();
      } else if (this.broadcastEnabled) {
        await this.startSilenceHolder();
      }
      this.emitState();
      });
    } finally {
      this.handlingTrackEnd = false;
    }
  }

  async previous() {
    return this.runLocked(async () => {
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
    });
  }

  async toggleAutoDj() {
    const settings = await getRadioSettings();
    const autoDj = !settings.auto_dj;
    await updateRadioSettings({ auto_dj: autoDj });

    if (autoDj) {
      const activeShow = await getActiveShowNow();
      if (activeShow?.playlist_id) {
        const { setActivePlaylist } = await import("@/lib/db/playlists");
        await setActivePlaylist(activeShow.playlist_id);
        await fillQueueFromPlaylist(activeShow.playlist_id, settings.shuffle);
        this.playbackMode = "playlist";
        this.activePlaylistId = activeShow.playlist_id;
      } else if (this.activePlaylistId) {
        const pl = await getPlaylist(this.activePlaylistId);
        await fillQueueFromPlaylist(this.activePlaylistId, pl.shuffle);
      } else {
        const db = getMatuClient();
        const { data } = await db
          .from("playlists")
          .select("id, shuffle")
          .eq("is_active", true)
          .limit(1)
          .single();
        if (data?.id) {
          this.playbackMode = "playlist";
          this.activePlaylistId = data.id as string;
          await fillQueueFromPlaylist(data.id as string, Boolean(data.shuffle));
        }
      }
      await this.persistMode();
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

    if (!next && this.repeatMode === "all" && this.playbackMode === "playlist") {
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
      playbackMode: this.playbackMode,
      activePlaylistId: this.activePlaylistId,
      activePlaylistName: this.activePlaylistId
        ? await getPlaylist(this.activePlaylistId)
            .then((p) => p.name)
            .catch(() => null)
        : null,
      ffmpegOk: this.ffmpegOk,
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
