import { execFileSync, execSync } from "child_process";
import fs from "fs";

let resolvedPath: string | null = null;

const LINUX_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function fileExists(bin: string) {
  return bin.includes("/") ? fs.existsSync(bin) : true;
}

function tryFfmpeg(bin: string): boolean {
  if (!fileExists(bin)) return false;
  try {
    execFileSync(bin, ["-version"], {
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, PATH: `${LINUX_PATH}:${process.env.PATH ?? ""}` },
    });
    return true;
  } catch {
    return false;
  }
}

function candidatePaths(): string[] {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  const list = [
    fromEnv,
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/bin/ffmpeg",
    "ffmpeg",
  ].filter((p): p is string => Boolean(p));

  if (process.platform !== "win32") {
    try {
      const which = execSync("command -v ffmpeg 2>/dev/null || which ffmpeg", {
        encoding: "utf8",
        timeout: 3000,
        shell: "/bin/bash",
        env: { ...process.env, PATH: `${LINUX_PATH}:${process.env.PATH ?? ""}` },
      }).trim();
      if (which) list.unshift(which);
    } catch {
      /* ok */
    }
  }

  return [...new Set(list)];
}

/** Ruta de ffmpeg que funciona (cacheada). PM2 suele tener PATH vacío — probamos rutas Linux. */
export function resolveFfmpegPath(): string {
  if (resolvedPath && tryFfmpeg(resolvedPath)) return resolvedPath;

  for (const bin of candidatePaths()) {
    if (tryFfmpeg(bin)) {
      resolvedPath = bin;
      if (!process.env.FFMPEG_PATH) {
        console.log(`[RadioEngine] FFmpeg resuelto: ${bin}`);
      }
      return bin;
    }
  }

  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

export function getFfmpegPath() {
  return resolveFfmpegPath();
}

export function checkFfmpeg(): {
  ok: boolean;
  path: string;
  version?: string;
  error?: string;
} {
  const bin = resolveFfmpegPath();
  try {
    const out = execFileSync(bin, ["-version"], {
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, PATH: `${LINUX_PATH}:${process.env.PATH ?? ""}` },
    });
    const first = out.split("\n")[0]?.trim();
    resolvedPath = bin;
    return { ok: true, path: bin, version: first };
  } catch (err) {
    resolvedPath = null;
    return {
      ok: false,
      path: bin,
      error: err instanceof Error ? err.message : "FFmpeg no encontrado",
    };
  }
}
