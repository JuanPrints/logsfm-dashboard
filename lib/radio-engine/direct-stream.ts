import { spawn, type ChildProcess } from "child_process";
import { getFfmpegPath } from "@/lib/radio-engine/ffmpeg-check";

export type PipelineMode = "silence" | "music" | "offline";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Un solo FFmpeg conectado directamente a Icecast (archivo o silencio).
 * Más estable en producción: sin tubería PCM intermedia.
 */
export class DirectIcecastStream {
  private process: ChildProcess | null = null;
  private mode: PipelineMode = "offline";
  private switchQueue: Promise<void> = Promise.resolve();
  private onTrackEnd: (() => void) | null = null;
  private lastMusic: {
    filePath: string;
    meta: { title: string; artist: string };
    volume: number;
  } | null = null;
  private lastPlayKey = "";

  constructor(
    private icecastUrl: string,
    private bitrate = "128",
  ) {}

  setTrackEndHandler(fn: () => void) {
    this.onTrackEnd = fn;
  }

  getMode() {
    return this.mode;
  }

  isConnected() {
    return this.process !== null && this.process.exitCode === null && !this.process.killed;
  }

  private enqueue(fn: () => Promise<void>) {
    this.switchQueue = this.switchQueue.then(fn).catch((err) => {
      console.error("[DirectStream] error:", err);
    });
    return this.switchQueue;
  }

  private async killProcess() {
    const proc = this.process;
    if (!proc) return;
    this.process = null;
    this.mode = "offline";

    proc.removeAllListeners("close");
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ok */
    }
    await sleep(400);
    try {
      if (!proc.killed) proc.kill("SIGKILL");
    } catch {
      /* ok */
    }
    await sleep(300);
  }

  private attachProcess(proc: ChildProcess, mode: PipelineMode) {
    this.process = proc;
    this.mode = mode;

    proc.stderr?.on("data", (d: Buffer) => {
      const msg = d.toString();
      if (
        msg.includes("403") ||
        msg.includes("401") ||
        msg.includes("Connection refused") ||
        msg.includes("Error")
      ) {
        console.error("[DirectStream ffmpeg]", msg.slice(0, 300));
      }
    });

    proc.on("close", (code) => {
      if (this.process !== proc) return;
      this.process = null;
      this.mode = "offline";
      console.log(`[DirectStream] FFmpeg fin mode=${mode} code=${code}`);
      if (mode === "music" && code === 0) {
        this.onTrackEnd?.();
      }
    });
  }

  private spawnToIcecast(
    inputArgs: string[],
    meta: { title: string; description?: string },
    mode: PipelineMode,
  ) {
    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      ...inputArgs,
      "-acodec",
      "libmp3lame",
      "-b:a",
      `${this.bitrate}k`,
      "-f",
      "mp3",
      "-content_type",
      "audio/mpeg",
      "-ice_name",
      meta.title,
      "-legacy_icecast",
      "1",
      ...(meta.description ? ["-ice_description", meta.description] : []),
      this.icecastUrl,
    ];

    const proc = spawn(getFfmpegPath(), args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    this.attachProcess(proc, mode);
    return proc;
  }

  async playSilence() {
    return this.enqueue(async () => {
      await this.killProcess();
      this.lastMusic = null;
      this.lastPlayKey = "";

      this.spawnToIcecast(
        [
          "-re",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=44100:cl=stereo",
        ],
        { title: "LogsFM", description: "Radio en vivo" },
        "silence",
      );
      console.log("[DirectStream] → silencio continuo");
    });
  }

  async playFile(
    filePath: string,
    meta: { title: string; artist: string },
    volume = 0.85,
  ) {
    const playKey = `${filePath}:${volume}`;
    if (this.lastPlayKey === playKey && this.isConnected() && this.mode === "music") {
      return;
    }

    return this.enqueue(async () => {
      await this.killProcess();

      this.lastMusic = { filePath, meta, volume };
      this.lastPlayKey = playKey;
      const vol = volume.toFixed(2);
      const description = `${meta.artist} - ${meta.title}`;

      this.spawnToIcecast(
        [
          "-re",
          "-i",
          filePath,
          "-map",
          "0:a:0",
          "-af",
          `volume=${vol}`,
        ],
        { title: meta.title, description },
        "music",
      );
      console.log(`[DirectStream] → música: ${meta.title}`);
    });
  }

  async stopHard() {
    return this.enqueue(async () => {
      this.lastMusic = null;
      this.lastPlayKey = "";
      await this.killProcess();
      this.spawnToIcecast(
        ["-re", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"],
        { title: "LogsFM", description: "Radio en vivo" },
        "silence",
      );
      console.log("[DirectStream] → silencio (stop)");
    });
  }

  async restartCurrentDecoder(volume: number) {
    if (!this.lastMusic || this.mode !== "music") return;
    const { filePath, meta } = this.lastMusic;
    await this.playFile(filePath, meta, volume);
  }

  async shutdown() {
    return this.enqueue(async () => {
      this.lastMusic = null;
      this.lastPlayKey = "";
      await this.killProcess();
    });
  }
}
