import { spawn, type ChildProcess } from "child_process";

export type PipelineMode = "silence" | "music" | "offline";

/**
 * Un solo FFmpeg conectado a Icecast (encoder).
 * Las canciones se decodifican a PCM y entran por stdin — sin desconectar oyentes.
 */
export class IcecastPipeline {
  private encoder: ChildProcess | null = null;
  private decoder: ChildProcess | null = null;
  private mode: PipelineMode = "offline";
  private encoderUp = false;
  private switching = false;
  private switchQueue: Promise<void> = Promise.resolve();
  private onTrackEnd: (() => void) | null = null;

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
    return this.encoderUp && this.encoder !== null;
  }

  async ensureEncoder(meta?: { title?: string; description?: string }) {
    if (this.encoderUp && this.encoder) return;

    await this.stopDecoder();
    if (this.encoder) {
      this.encoder.kill("SIGKILL");
      this.encoder = null;
      await sleep(3000);
    }

    const title = meta?.title ?? "LogsFM";
    const args = [
      "-hide_banner",
      "-loglevel", "warning",
      "-f", "s16le",
      "-ar", "44100",
      "-ac", "2",
      "-i", "pipe:0",
      "-acodec", "libmp3lame",
      "-b:a", `${this.bitrate}k`,
      "-f", "mp3",
      "-content_type", "audio/mpeg",
      "-ice_name", title,
      "-legacy_icecast", "1",
      ...(meta?.description ? ["-ice_description", meta.description] : []),
      this.icecastUrl,
    ];

    console.log("[Pipeline] Conectando encoder → Icecast (permanente)");

    this.encoder = spawn("ffmpeg", args, {
      stdio: ["pipe", "ignore", "pipe"],
    });

    this.encoderUp = false;

    this.encoder.stderr?.on("data", (d: Buffer) => {
      const msg = d.toString();
      if (msg.includes("403") || msg.includes("401") || msg.includes("Connection refused")) {
        console.error("[Pipeline encoder]", msg.slice(0, 250));
      } else if (msg.includes("size=") || msg.includes("bitrate=")) {
        this.encoderUp = true;
      }
    });

    this.encoder.on("close", (code) => {
      console.warn(`[Pipeline] Encoder cerrado code=${code}`);
      this.encoder = null;
      this.encoderUp = false;
      this.mode = "offline";
    });

    await sleep(2500);
    this.encoderUp = true;
    this.mode = "silence";
  }

  private enqueueSwitch(fn: () => Promise<void>) {
    this.switchQueue = this.switchQueue.then(fn).catch((err) => {
      console.error("[Pipeline] switch error:", err);
    });
    return this.switchQueue;
  }

  async playSilence() {
    return this.enqueueSwitch(async () => {
      if (this.switching) return;
      this.switching = true;
      try {
        await this.ensureEncoder({ title: "LogsFM", description: "Radio en vivo" });
        await this.stopDecoder();

        const dec = spawn(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel", "error",
            "-re",
            "-f", "lavfi",
            "-i", "anullsrc=r=44100:cl=stereo",
            "-f", "s16le",
            "-ar", "44100",
            "-ac", "2",
            "pipe:1",
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );

        this.pipeDecoder(dec, "silence");
        console.log("[Pipeline] → silencio continuo");
      } finally {
        this.switching = false;
      }
    });
  }

  async playFile(
    filePath: string,
    meta: { title: string; artist: string },
    volume = 0.85,
  ) {
    return this.enqueueSwitch(async () => {
      if (this.switching) return;
      this.switching = true;
      try {
        const description = `${meta.artist} - ${meta.title}`;
        await this.ensureEncoder({ title: meta.title, description });
        await this.stopDecoder();

        const vol = volume.toFixed(2);
        const dec = spawn(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel", "error",
            "-re",
            "-i", filePath,
            "-map", "0:a:0",
            "-af", `volume=${vol}`,
            "-f", "s16le",
            "-ar", "44100",
            "-ac", "2",
            "pipe:1",
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );

        this.pipeDecoder(dec, "music");
        console.log(`[Pipeline] → música: ${meta.title}`);
      } finally {
        this.switching = false;
      }
    });
  }

  private pipeDecoder(dec: ChildProcess, mode: PipelineMode) {
    this.decoder = dec;
    this.mode = mode;

    if (!this.encoder?.stdin || !dec.stdout) {
      dec.kill("SIGKILL");
      return;
    }

    dec.stdout.pipe(this.encoder.stdin, { end: false });

    dec.stderr?.on("data", (d: Buffer) => {
      const msg = d.toString();
      if (msg.includes("Error") && !msg.includes("Estim")) {
        console.error("[Pipeline decoder]", msg.slice(0, 200));
      }
    });

    dec.on("close", (code) => {
      if (this.decoder !== dec) return;
      this.decoder = null;
      console.log(`[Pipeline] Decoder fin mode=${mode} code=${code}`);
      if (mode === "music" && code === 0) {
        this.onTrackEnd?.();
      }
    });
  }

  async stopDecoder() {
    const dec = this.decoder;
    if (!dec) return;
    this.decoder = null;
    if (dec.stdout && this.encoder?.stdin) {
      dec.stdout.unpipe(this.encoder.stdin);
    }
    dec.kill("SIGTERM");
    await sleep(400);
    try {
      dec.kill("SIGKILL");
    } catch {
      /* ok */
    }
  }

  async shutdown() {
    await this.stopDecoder();
    if (this.encoder) {
      this.encoder.stdin?.end();
      this.encoder.kill("SIGTERM");
      this.encoder = null;
    }
    this.encoderUp = false;
    this.mode = "offline";
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
