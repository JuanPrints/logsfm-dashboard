import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import type { NowPlaying, PlaybackState, StreamInfo, StreamStatus } from "@/lib/types";
import { getSong } from "@/lib/db/songs";
import { resolveSongFilePath, songFileExists } from "@/lib/upload/resolve-song-path";
import { popNextFromQueue, getQueue, fillQueueFromPlaylist } from "@/lib/db/queue";
import { addToHistory } from "@/lib/db/history";
import { getRadioSettings, updateRadioSettings, updateStreamStats } from "@/lib/db/settings";
import { getActiveShowNow } from "@/lib/db/shows";
import { getMatuClient } from "@/lib/db/matu";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "songs");

type StreamMode = "silence" | "music";

export class RadioEngine extends EventEmitter {
  private ffmpegProcess: ChildProcess | null = null;
  private streamMode: StreamMode | null = null;
  private ffmpegGeneration = 0;
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
  private startingFfmpeg = false;

  constructor() {
    super();
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  async init() {
    const settings = await getRadioSettings();
    this.playbackState = settings.playback_state as PlaybackState;
    this.micEnabled = settings.mic_enabled;
    this.isLiveDj = settings.is_live_dj;

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

  /** Watchdog — corrige desincronización silencio/música y remonta FFmpeg */
  async ensureMountAlive() {
    if (!this.broadcastEnabled || this.startingFfmpeg) return;

    if (
      this.playbackState === "playing" &&
      this.nowPlaying &&
      this.streamMode !== "music"
    ) {
      console.warn("[RadioEngine] Watchdog: playing pero mount en silencio → música");
      try {
        await this.startMusicStream();
      } catch (err) {
        console.error("[RadioEngine] Watchdog música falló:", err);
      }
      return;
    }

    if (!this.ffmpegProcess) {
      console.log("[RadioEngine] Watchdog: remontando FFmpeg...");
      if (this.playbackState === "playing" && this.nowPlaying) {
        try {
          await this.startMusicStream();
        } catch {
          await this.startSilenceHolder();
        }
      } else {
        await this.startSilenceHolder();
      }
    }
  }

  private icecastOutput() {
    const host = process.env.ICECAST_HOST ?? "127.0.0.1";
    const port = process.env.ICECAST_PORT ?? "8000";
    const password = process.env.ICECAST_PASSWORD ?? "hackme";
    const mount = process.env.ICECAST_MOUNT ?? "/stream";
    return `icecast://source:${password}@${host}:${port}${mount}`;
  }

  private icecastTail(opts?: { streamTitle?: string; streamDescription?: string }) {
    const bitrate = process.env.ICECAST_BITRATE ?? "128";
    const tail: string[] = [
      "-acodec", "libmp3lame",
      "-b:a", `${bitrate}k`,
      "-ar", "44100",
      "-ac", "2",
      "-write_xing", "0",
      "-content_type", "audio/mpeg",
      "-f", "mp3",
      "-ice_name", opts?.streamTitle ?? "LogsFM",
      "-legacy_icecast", "1",
    ];
    if (opts?.streamDescription) {
      tail.push("-ice_description", opts.streamDescription);
    }
    tail.push(this.icecastOutput());
    return tail;
  }

  private encodeArgs(extraInput: string[], meta?: { streamTitle?: string; streamDescription?: string }) {
    return [...extraInput, ...this.icecastTail(meta)];
  }

  private musicStreamArgs(inputFile: string) {
    const volume = (this.musicVolume / 100).toFixed(2);
    const title = this.nowPlaying?.title ?? "LogsFM";
    const artist = this.nowPlaying?.artist?.trim() || "LogsFM";
    const description = `${artist} - ${title}`;

    return this.encodeArgs(
      [
        "-hide_banner",
        "-loglevel", "warning",
        "-re",
        "-i", inputFile,
        "-map", "0:a:0",
        "-af", `volume=${volume}`,
        "-metadata", `title=${title}`,
        "-metadata", `artist=${artist}`,
      ],
      { streamTitle: title, streamDescription: description },
    );
  }

  private detachFfmpegHandlers(proc: ChildProcess) {
    proc.removeAllListeners("close");
    proc.removeAllListeners("error");
    proc.stderr?.removeAllListeners("data");
  }

  private async killFfmpeg() {
    const proc = this.ffmpegProcess;
    if (!proc) {
      this.streamMode = null;
      return;
    }

    this.detachFfmpegHandlers(proc);
    this.ffmpegProcess = null;
    this.streamMode = null;
    this.ffmpegGeneration += 1;

    proc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already dead */
    }
  }

  private attachFfmpegHandlers(proc: ChildProcess, mode: StreamMode, gen: number) {
    proc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("403") || msg.includes("401") || msg.includes("Connection refused")) {
        console.error("[FFmpeg]", msg.slice(0, 300));
        this.setStreamStatus("error");
      } else if (msg.includes("Error") || msg.includes("Invalid")) {
        console.error("[FFmpeg]", msg.slice(0, 300));
      } else if (msg.includes("size=") || msg.includes("bitrate=")) {
        this.setStreamStatus("online");
      }
    });

    proc.on("close", async (code) => {
      if (gen !== this.ffmpegGeneration) return;
      if (this.ffmpegProcess === proc) {
        this.ffmpegProcess = null;
        this.streamMode = null;
      }

      console.warn(`[FFmpeg] Cerrado mode=${mode} code=${code}`);

      if (mode === "music" && this.playbackState === "playing") {
        if (code === 0) {
          await this.next();
          return;
        }
        try {
          await this.startMusicStream();
          return;
        } catch (err) {
          console.error("[FFmpeg] Reintento música falló:", err);
          this.playbackState = "paused";
          await updateRadioSettings({ playback_state: "paused" });
          await this.startSilenceHolder();
          this.emitState();
          return;
        }
      }

      if (this.broadcastEnabled && !this.ffmpegProcess && !this.startingFfmpeg) {
        if (this.playbackState === "playing" && this.nowPlaying) {
          try {
            await this.startMusicStream();
          } catch {
            await this.startSilenceHolder();
          }
        } else {
          await this.startSilenceHolder();
        }
      }
    });

    proc.on("error", (err) => {
      if (gen !== this.ffmpegGeneration) return;
      console.error("[FFmpeg] error:", err);
      this.setStreamStatus("error");
    });
  }

  private async launchFfmpeg(args: string[], mode: StreamMode) {
    if (this.startingFfmpeg) return;
    this.startingFfmpeg = true;

    try {
      await this.killFfmpeg();
      const gen = this.ffmpegGeneration;
      this.streamMode = mode;
      this.setStreamStatus("connecting");

      console.log(`[FFmpeg] → ${mode}:`, args.filter((a) => !a.includes("source:")).join(" "));

      const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
      this.ffmpegProcess = proc;
      this.attachFfmpegHandlers(proc, mode, gen);

      if (mode === "music") {
        this.setStreamStatus("online");
      }
    } finally {
      this.startingFfmpeg = false;
    }
  }

  async ensureBroadcastOnline() {
    this.broadcastEnabled = true;
    if (!this.ffmpegProcess && !this.startingFfmpeg) {
      if (this.playbackState === "playing" && this.nowPlaying) {
        await this.startMusicStream();
      } else {
        await this.startSilenceHolder();
      }
    }
  }

  async startSilenceHolder() {
    if (this.playbackState === "playing" && this.nowPlaying) {
      return;
    }

    const args = this.encodeArgs(
      [
        "-hide_banner",
        "-loglevel", "warning",
        "-re",
        "-f", "lavfi",
        "-i", "anullsrc=r=44100:cl=stereo",
      ],
      { streamTitle: "LogsFM", streamDescription: "Radio en vivo" },
    );

    await this.launchFfmpeg(args, "silence");
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

    console.log(`[RadioEngine] Stream música: ${song.title} ← ${inputFile}`);
    const args = this.musicStreamArgs(inputFile);
    await this.launchFfmpeg(args, "music");
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
      streamMode: this.streamMode,
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
    await this.startSilenceHolder();
    await updateRadioSettings({ playback_state: "stopped", current_song_id: null });
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
    const next = await popNextFromQueue();
    if (!next) {
      this.nowPlaying = null;
      this.playbackState = "paused";
      this.stopElapsedTimer();
      await this.startSilenceHolder();
      await updateRadioSettings({ playback_state: "paused", current_song_id: null });
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

    const liveStatus = this.ffmpegProcess ? "online" : base.stream.status;

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
