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
 * Un solo FFmpeg conectado a Icecast (encoder).
 * Las canciones se decodifican a PCM y entran por stdin — sin desconectar oyentes.
 */
export class IcecastPipeline {
  private encoder: ChildProcess | null = null;
  private decoder: ChildProcess | null = null;
  private pipedStdout: Readable | null = null;
  private mode: PipelineMode = "offline";
  private encoderUp = false;
  private stdinBroken = false;
  private switchQueue: Promise<void> = Promise.resolve();
  private onTrackEnd: (() => void) | null = null;
  private lastMusic: {
    filePath: string;
    meta: { title: string; artist: string };
    volume: number;
  } | null = null;

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
    if (this.encoderAlive()) return;

    await this.stopDecoderInternal();

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
      await sleep(1500);
    }

    const title = meta?.title ?? "LogsFM";
    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
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
        msg.includes("Connection refused")
      ) {
        console.error("[Pipeline encoder]", msg.slice(0, 250));
      } else if (msg.includes("size=") || msg.includes("bitrate=")) {
        this.encoderUp = true;
      }
    });

    enc.stdin?.on("error", (err) => {
      if (isPipeError(err)) {
        console.warn("[Pipeline] encoder stdin error (ignorado):", (err as NodeJS.ErrnoException).code);
        this.stdinBroken = true;
      }
    });

    enc.on("close", (code) => {
      console.warn(`[Pipeline] Encoder cerrado code=${code}`);
      this.encoder = null;
      this.encoderUp = false;
      this.stdinBroken = true;
      this.mode = "offline";
      void this.stopDecoderInternal();
    });

    const ready = await this.waitEncoderReady(10_000);
    if (!ready) {
      console.error("[Pipeline] Encoder no conectó a Icecast a tiempo");
      try {
        enc.kill("SIGKILL");
      } catch {
        /* ok */
      }
      this.encoder = null;
      throw new Error("No se pudo conectar el encoder a Icecast");
    }
    this.mode = "silence";
  }

  private waitEncoderReady(timeoutMs: number): Promise<boolean> {
    const enc = this.encoder;
    if (!enc) return Promise.resolve(false);

    if (this.encoderUp) return Promise.resolve(true);

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
        const alive = enc.exitCode === null && !enc.killed;
        if (alive) this.encoderUp = true;
        done(alive);
      }, timeoutMs);

      enc.stderr?.on("data", onData);
    });
  }

  async playSilence() {
    return this.enqueue(async () => {
      await this.ensureEncoder({ title: "LogsFM", description: "Radio en vivo" });
      await this.stopDecoderInternal();
      this.lastMusic = null;

      const dec = spawn(
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

      this.pipeDecoder(dec, "silence");
      console.log("[Pipeline] → silencio continuo");
    });
  }

  async playFile(
    filePath: string,
    meta: { title: string; artist: string },
    volume = 0.85,
  ) {
    return this.enqueue(async () => {
      const description = `${meta.artist} - ${meta.title}`;
      await this.ensureEncoder({ title: meta.title, description });
      await this.stopDecoderInternal();

      this.lastMusic = { filePath, meta, volume };

      const vol = volume.toFixed(2);
      const dec = spawn(
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

      this.pipeDecoder(dec, "music");
      console.log(`[Pipeline] → música: ${meta.title}`);
    });
  }

  /** Corta música actual y pasa a silencio sin tumbar el encoder si sigue vivo. */
  async stopHard() {
    return this.enqueue(async () => {
      this.lastMusic = null;
      await this.stopDecoderInternal();
      if (!this.encoderAlive()) {
        await this.ensureEncoder({ title: "LogsFM", description: "Radio en vivo" });
      }
      await this.playSilenceInternal();
    });
  }

  private async playSilenceInternal() {
    await this.stopDecoderInternal();
    this.lastMusic = null;

    const dec = spawn(
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

    this.pipeDecoder(dec, "silence");
    console.log("[Pipeline] → silencio (stop)");
  }

  /** Reinicia solo el decoder con nuevo volumen (encoder permanece). */
  async restartCurrentDecoder(volume: number) {
    if (!this.lastMusic || this.mode !== "music") return;
    const { filePath, meta } = this.lastMusic;
    this.lastMusic.volume = volume;
    await this.playFile(filePath, meta, volume);
  }

  private pipeDecoder(dec: ChildProcess, mode: PipelineMode) {
    this.decoder = dec;
    this.mode = mode;

    const stdin = this.encoder?.stdin;
    const stdout = dec.stdout;

    if (!stdin || !stdout || !this.encoderAlive()) {
      dec.kill("SIGKILL");
      return;
    }

    const onStdinError = (err: NodeJS.ErrnoException) => {
      if (isPipeError(err)) {
        console.warn("[Pipeline] stdin EPIPE — encoder caído");
        this.stdinBroken = true;
        this.detachPipe(dec, stdout, stdin, onStdinError, onStdoutError);
      }
    };

    const onStdoutError = (err: NodeJS.ErrnoException) => {
      if (isPipeError(err)) {
        console.warn("[Pipeline] decoder stdout EPIPE");
        this.detachPipe(dec, stdout, stdin, onStdinError, onStdoutError);
      }
    };

    stdin.on("error", onStdinError);
    stdout.on("error", onStdoutError);

    stdout.pipe(stdin, { end: false });
    this.pipedStdout = stdout;

    dec.stderr?.on("data", (d: Buffer) => {
      const msg = d.toString();
      if (msg.includes("Error") && !msg.includes("Estim")) {
        console.error("[Pipeline decoder]", msg.slice(0, 200));
      }
    });

    dec.on("close", (code) => {
      if (this.decoder !== dec) return;
      this.detachPipe(dec, stdout, stdin, onStdinError, onStdoutError);
      this.decoder = null;
      console.log(`[Pipeline] Decoder fin mode=${mode} code=${code}`);
      if (mode === "music" && code === 0) {
        this.onTrackEnd?.();
      }
    });
  }

  private detachPipe(
    dec: ChildProcess,
    stdout: Readable,
    stdin: Writable,
    onStdinError: (err: NodeJS.ErrnoException) => void,
    onStdoutError: (err: NodeJS.ErrnoException) => void,
  ) {
    try {
      stdout.unpipe(stdin);
    } catch {
      /* ok */
    }
    stdin.removeListener("error", onStdinError);
    stdout.removeListener("error", onStdoutError);
    if (this.pipedStdout === stdout) this.pipedStdout = null;
    try {
      dec.kill("SIGKILL");
    } catch {
      /* ok */
    }
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

    dec.kill("SIGTERM");
    await sleep(300);
    try {
      if (!dec.killed) dec.kill("SIGKILL");
    } catch {
      /* ok */
    }
  }

  async shutdown() {
    return this.enqueue(async () => {
      this.lastMusic = null;
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
