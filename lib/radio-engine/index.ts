import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import type { NowPlaying, PlaybackState, StreamInfo, StreamStatus } from "@/lib/types";
import { getSong } from "@/lib/db/songs";
import { popNextFromQueue, getQueue, fillQueueFromPlaylist } from "@/lib/db/queue";
import { addToHistory } from "@/lib/db/history";
import { getRadioSettings, updateRadioSettings, updateStreamStats } from "@/lib/db/settings";
import { getActiveShowNow } from "@/lib/db/shows";
import { getMatuClient } from "@/lib/db/matu";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "songs");

export class RadioEngine extends EventEmitter {
  private ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
  private playbackState: PlaybackState = "stopped";
  private nowPlaying: NowPlaying | null = null;
  private startedAt: Date | null = null;
  private elapsedTimer: NodeJS.Timeout | null = null;
  private activeListeners = 0;
  private streamStatus: StreamStatus = "offline";
  private streamStartTime: Date | null = null;
  private micEnabled = false;
  private isLiveDj = false;

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
  }

  getState() {
    const uptime = this.streamStartTime
      ? Math.floor((Date.now() - this.streamStartTime.getTime()) / 1000)
      : 0;

    const stream: StreamInfo = {
      status: this.streamStatus,
      listeners: this.activeListeners,
      peakListeners: this.activeListeners,
      bitrate: parseInt(process.env.ICECAST_BITRATE ?? "128", 10),
      format: "mp3",
      uptime,
      mountPoint: process.env.ICECAST_MOUNT ?? "/stream",
    };

    return {
      playback: this.playbackState,
      nowPlaying: this.nowPlaying,
      isLiveDj: this.isLiveDj,
      micEnabled: this.micEnabled,
      stream,
    };
  }

  async play() {
    if (this.playbackState === "playing") return;

    if (!this.nowPlaying) {
      await this.loadNextTrack();
    }

    if (!this.nowPlaying) {
      throw new Error("No hay canciones en la cola");
    }

    await this.startStream();
    this.playbackState = "playing";
    this.startedAt = new Date();
    this.startElapsedTimer();
    await updateRadioSettings({ playback_state: "playing" });
    this.emit("state-change", this.getState());
  }

  async pause() {
    this.stopStream();
    this.playbackState = "paused";
    this.stopElapsedTimer();
    await updateRadioSettings({ playback_state: "paused" });
    this.emit("state-change", this.getState());
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
    if (this.playbackState === "playing") {
      await this.startStream();
    }
    this.emit("state-change", this.getState());
    this.emit("queue-change");
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
      await this.startStream();
    }
    this.emit("state-change", this.getState());
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

    this.emit("queue-change");
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
    if (hasActiveSource || this.playbackState === "playing") {
      this.setStreamStatus("online");
    } else if (this.playbackState === "stopped") {
      this.setStreamStatus("offline");
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
    this.emit("live-dj", { isLive: true, micEnabled: false });
  }

  async stopLive() {
    this.isLiveDj = false;
    this.micEnabled = false;
    await updateRadioSettings({
      is_live_dj: false,
      mic_enabled: false,
      current_dj_name: null,
    });
    this.emit("live-dj", { isLive: false, micEnabled: false });
  }

  async toggleMic() {
    this.micEnabled = !this.micEnabled;
    await updateRadioSettings({ mic_enabled: this.micEnabled });
    this.emit("live-dj", { isLive: this.isLiveDj, micEnabled: this.micEnabled });
    return this.micEnabled;
  }

  private async loadNextTrack() {
    const next = await popNextFromQueue();
    if (!next) {
      this.nowPlaying = null;
      this.stopStream();
      this.playbackState = "stopped";
      await updateRadioSettings({ playback_state: "stopped", current_song_id: null });
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

    await updateRadioSettings({
      current_song_id: next.song_id,
    });
  }

  private resolveFilePath(filePath: string) {
    if (filePath.startsWith("http")) return filePath;
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(process.cwd(), filePath);
  }

  private async startStream() {
    if (!this.nowPlaying) return;

    this.stopStream();

    const song = await getSong(this.nowPlaying.id);
    const inputFile = this.resolveFilePath(song.file_path);

    const icecastHost = process.env.ICECAST_HOST ?? "localhost";
    const icecastPort = process.env.ICECAST_PORT ?? "8000";
    const icecastPassword = process.env.ICECAST_PASSWORD ?? "hackme";
    const icecastMount = process.env.ICECAST_MOUNT ?? "/stream";
    const bitrate = process.env.ICECAST_BITRATE ?? "128";

    const outputUrl = `icecast://source:${icecastPassword}@${icecastHost}:${icecastPort}${icecastMount}`;

    const args = [
      "-re",
      "-i", inputFile,
      "-acodec", "libmp3lame",
      "-ab", `${bitrate}k`,
      "-ar", "44100",
      "-ac", "2",
      "-f", "mp3",
      outputUrl,
    ];

    this.streamStatus = "connecting";
    this.emit("stream-status", this.getState().stream);

    this.ffmpegProcess = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });

    this.ffmpegProcess.stderr.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("Connection refused")) {
        this.setStreamStatus("error");
      } else if (msg.includes("size=")) {
        this.setStreamStatus("online");
      }
    });

    this.ffmpegProcess.on("close", async (code) => {
      if (code === 0 && this.playbackState === "playing") {
        await this.next();
      } else {
        this.setStreamStatus("offline");
      }
    });

    this.ffmpegProcess.on("error", () => {
      this.setStreamStatus("error");
    });
  }

  private stopStream() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill("SIGTERM");
      this.ffmpegProcess = null;
    }
    this.stopElapsedTimer();
  }

  private startElapsedTimer() {
    this.stopElapsedTimer();
    this.elapsedTimer = setInterval(() => {
      if (this.nowPlaying && this.startedAt) {
        this.nowPlaying.elapsed = Math.floor(
          (Date.now() - this.startedAt.getTime()) / 1000,
        );
        this.emit("now-playing", this.nowPlaying);
      }
    }, 1000);
  }

  private stopElapsedTimer() {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
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

    const stream: StreamInfo = streamStats
      ? {
          status: streamStats.status as StreamInfo["status"],
          listeners: streamStats.listeners,
          peakListeners: streamStats.peak_listeners,
          bitrate: streamStats.bitrate,
          format: "mp3",
          uptime: streamStats.uptime_seconds,
          mountPoint: process.env.ICECAST_MOUNT ?? "/stream",
        }
      : base.stream;

    return {
      ...base,
      playback: settings.playback_state as PlaybackState,
      isLiveDj: settings.is_live_dj,
      micEnabled: settings.mic_enabled,
      stream,
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
  if (!engine) {
    engine = new RadioEngine();
  }
  return engine;
}
