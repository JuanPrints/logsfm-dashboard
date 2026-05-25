import { spawn, type ChildProcess } from "child_process";
import type { Readable, Writable } from "stream";

export type PipelineMode = "silence" | "music" | "offline";

function isPipeError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EPIPE" || code === "ECONNRESET";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Encoder permanente + decoders PCM (modo avanzado).
 * Requiere RADIO_STREAM_MODE=pcm — por defecto se usa DirectIcecastStream.
 */
export class IcecastPipeline {
  private encoder: ChildProcess | null = null;
  private decoder: ChildProcess | null = null;
  private pipedStdout: Readable | null = null;
  private mode: PipelineMode = "offline";
  private encoderUp = false;
  private stdinBroken = false;
  private switchQueue: Promise<void> = Promise.resolve();
  private ensurePromise: Promise<void> | null = null;
  private reconnectAfter = 0;
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
    return this.encoderAlive();
  }

  private encoderAlive() {
    return (
      this.encoder !== null &&
      this.encoderUp &&
      !this.stdinBroken &&
      this.encoder.exitCode === null
    );
  }

  private enqueue(fn: () => Promise<void>) {
    this.switchQueue = this.switchQueue.then(fn).catch((err) => {
      console.error("[Pipeline] switch error:", err);
    });
    return this.switchQueue;
  }

  private async ensureEncoder(meta?: { title?: string; description?: string }) {
    if (this.encoderAlive() && this.decoder) return;
    if (this.encoderAlive()) return;

    if (this.ensurePromise) {
      await this.ensurePromise;
      if (this.encoderAlive()) return;
    }

    const waitMs = this.reconnectAfter - Date.now();
    if (waitMs > 0) {
      console.log(`[Pipeline] Esperando ${waitMs}ms antes de reconectar...`);
      await sleep(waitMs);
    }

    this.ensurePromise = this.connectEncoder(meta);
    try {
      await this.ensurePromise;
    } finally {
      this.ensurePromise = null;
    }
  }

  private async connectEncoder(meta?: { title?: string; description?: string }) {
    if (this.encoder) {
      try {
        this.encoder.stdin?.destroy();
        this.encoder.kill("SIGKILL");
      } catch {
        /* ok */
      }
      this.encoder = null;
      this.encoderUp = false;
      this.stdinBroken = false;
      await sleep(2000);
    }

    const title = meta?.title ?? "LogsFM";
    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-re",
      "-f",
      "s16le",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-i",
      "pipe:0",
      "-acodec",
      "libmp3lame",
      "-b:a",
      `${this.bitrate}k`,
      "-f",
      "mp3",
      "-content_type",
      "audio/mpeg",
      "-ice_name",
      title,
      "-legacy_icecast",
      "1",
      ...(meta?.description ? ["-ice_description", meta.description] : []),
      this.icecastUrl,
    ];

    console.log("[Pipeline] Conectando encoder → Icecast (permanente)");

    const enc = spawn("ffmpeg", args, {
      stdio: ["pipe", "ignore", "pipe"],
    });
    this.encoder = enc;
    this.encoderUp = false;
    this.stdinBroken = false;

    enc.stderr?.on("data", (d: Buffer) => {
      const msg = d.toString();
      if (
        msg.includes("403") ||
        msg.includes("401") ||
        msg.includes("Connection refused") ||
        msg.includes("Broken pipe")
      ) {
        console.error("[Pipeline encoder]", msg.slice(0, 300));
      } else if (msg.includes("size=") || msg.includes("bitrate=")) {
        this.encoderUp = true;
      }
    });

    enc.stdin?.on("error", (err) => {
      if (isPipeError(err)) {
        this.stdinBroken = true;
      }
    });

    enc.on("close", (code) => {
      console.warn(`[Pipeline] Encoder cerrado code=${code}`);
      this.encoder = null;
      this.encoderUp = false;
      this.stdinBroken = true;
      this.mode = "offline";
      this.reconnectAfter = Date.now() + 5000;
      void this.stopDecoderInternal();
    });

    const ready = await this.waitEncoderReady(12_000);
    if (!ready) {
      try {
        enc.kill("SIGKILL");
      } catch {
        /* ok */
      }
      this.encoder = null;
      this.reconnectAfter = Date.now() + 8000;
      throw new Error("No se pudo conectar el encoder a Icecast");
    }

    await this.attachSilenceDecoder();
    this.mode = "silence";
  }

  private waitEncoderReady(timeoutMs: number): Promise<boolean> {
    const enc = this.encoder;
    if (!enc) return Promise.resolve(false);

    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        enc.stderr?.off("data", onData);
        resolve(ok);
      };

      const onData = (d: Buffer) => {
        const msg = d.toString();
        if (msg.includes("size=") || msg.includes("bitrate=")) {
          this.encoderUp = true;
          done(true);
        }
      };

      const timer = setTimeout(() => {
        done(enc.exitCode === null && !enc.killed && this.encoderUp);
      }, timeoutMs);

      enc.stderr?.on("data", onData);
    });
  }

  private spawnSilenceDecoder() {
    return spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-re",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=stereo",
        "-f",
        "s16le",
        "-ar",
        "44100",
        "-ac",
        "2",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  }

  private spawnMusicDecoder(filePath: string, volume: number) {
    const vol = volume.toFixed(2);
    return spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-re",
        "-i",
        filePath,
        "-map",
        "0:a:0",
        "-af",
        `volume=${vol}`,
        "-f",
        "s16le",
        "-ar",
        "44100",
        "-ac",
        "2",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  }

  /** Engancha silencio sin dejar el stdin del encoder vacío. */
  private async attachSilenceDecoder() {
    const dec = this.spawnSilenceDecoder();
    await this.swapDecoder(dec, "silence", false);
  }

  /**
   * Conecta el decoder nuevo ANTES de cortar el anterior (sin hueco de PCM).
   */
  private async swapDecoder(
    newDec: ChildProcess,
    mode: PipelineMode,
    triggerTrackEnd: boolean,
  ) {
    const stdin = this.encoder?.stdin;
    const stdout = newDec.stdout;

    if (!stdin || !stdout || !this.encoderAlive()) {
      newDec.kill("SIGKILL");
      throw new Error("Encoder no listo para recibir audio");
    }

    const oldDec = this.decoder;
    const oldStdout = oldDec?.stdout;

    const onStdinError = (err: NodeJS.ErrnoException) => {
      if (isPipeError(err)) this.stdinBroken = true;
    };

    const onStdoutError = (err: NodeJS.ErrnoException) => {
      if (isPipeError(err)) {
        try {
          stdout.unpipe(stdin);
        } catch {
          /* ok */
        }
      }
    };

    stdin.on("error", onStdinError);
    stdout.on("error", onStdoutError);
    stdout.pipe(stdin, { end: false });

    if (oldStdout) {
      try {
        oldStdout.unpipe(stdin);
      } catch {
        /* ok */
      }
    }

    if (oldDec) {
      oldDec.removeAllListeners("close");
      oldDec.kill("SIGKILL");
    }

    this.decoder = newDec;
    this.pipedStdout = stdout;
    this.mode = mode;

    newDec.stderr?.on("data", (d: Buffer) => {
      const msg = d.toString();
      if (msg.includes("Error") && !msg.includes("Estim")) {
        console.error("[Pipeline decoder]", msg.slice(0, 200));
      }
    });

    newDec.on("close", (code) => {
      if (this.decoder !== newDec) return;
      try {
        stdout.unpipe(stdin);
      } catch {
        /* ok */
      }
      stdin.removeListener("error", onStdinError);
      stdout.removeListener("error", onStdoutError);
      if (this.pipedStdout === stdout) this.pipedStdout = null;
      this.decoder = null;

      console.log(`[Pipeline] Decoder fin mode=${mode} code=${code}`);
      if (mode === "music" && code === 0 && triggerTrackEnd) {
        this.onTrackEnd?.();
      }
    });
  }

  async playSilence() {
    return this.enqueue(async () => {
      this.lastMusic = null;
      this.lastPlayKey = "";
      await this.ensureEncoder({ title: "LogsFM", description: "Radio en vivo" });
      if (this.mode !== "silence" || !this.decoder) {
        await this.attachSilenceDecoder();
      }
      console.log("[Pipeline] → silencio continuo");
    });
  }

  async playFile(
    filePath: string,
    meta: { title: string; artist: string },
    volume = 0.85,
  ) {
    const playKey = `${filePath}:${volume}`;
    if (this.lastPlayKey === playKey && this.encoderAlive() && this.mode === "music") {
      return;
    }

    return this.enqueue(async () => {
      const description = `${meta.artist} - ${meta.title}`;
      await this.ensureEncoder({ title: meta.title, description });

      this.lastMusic = { filePath, meta, volume };
      this.lastPlayKey = playKey;

      const dec = this.spawnMusicDecoder(filePath, volume);
      await this.swapDecoder(dec, "music", true);
      console.log(`[Pipeline] → música: ${meta.title}`);
    });
  }

  async stopHard() {
    return this.enqueue(async () => {
      this.lastMusic = null;
      this.lastPlayKey = "";
      if (this.encoderAlive()) {
        await this.attachSilenceDecoder();
        console.log("[Pipeline] → silencio (stop)");
      } else {
        await this.ensureEncoder({ title: "LogsFM", description: "Radio en vivo" });
      }
    });
  }

  async restartCurrentDecoder(volume: number) {
    if (!this.lastMusic || this.mode !== "music") return;
    const { filePath, meta } = this.lastMusic;
    await this.playFile(filePath, meta, volume);
  }

  private async stopDecoderInternal() {
    const dec = this.decoder;
    if (!dec) return;
    this.decoder = null;

    const stdout = dec.stdout;
    const stdin = this.encoder?.stdin;

    if (stdout && stdin) {
      try {
        stdout.unpipe(stdin);
      } catch {
        /* ok */
      }
    }
    if (this.pipedStdout === stdout) this.pipedStdout = null;

    dec.removeAllListeners("close");
    dec.kill("SIGKILL");
    await sleep(200);
  }

  async shutdown() {
    return this.enqueue(async () => {
      this.lastMusic = null;
      this.lastPlayKey = "";
      await this.stopDecoderInternal();
      if (this.encoder) {
        try {
          this.encoder.stdin?.destroy();
          this.encoder.kill("SIGTERM");
        } catch {
          /* ok */
        }
        this.encoder = null;
      }
      this.encoderUp = false;
      this.stdinBroken = false;
      this.mode = "offline";
    });
  }
}
