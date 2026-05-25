import { execFileSync } from "child_process";

export function getFfmpegPath() {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

export function checkFfmpeg(): { ok: boolean; path: string; version?: string; error?: string } {
  const bin = getFfmpegPath();
  try {
    const out = execFileSync(bin, ["-version"], { encoding: "utf8", timeout: 5000 });
    const first = out.split("\n")[0]?.trim();
    return { ok: true, path: bin, version: first };
  } catch (err) {
    return {
      ok: false,
      path: bin,
      error: err instanceof Error ? err.message : "FFmpeg no encontrado en PATH",
    };
  }
}
