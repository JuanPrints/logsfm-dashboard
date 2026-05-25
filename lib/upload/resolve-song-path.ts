import fs from "fs";
import path from "path";
import { getMatuClient } from "@/lib/db/matu";

/** Ruta relativa para guardar en DB (portable entre entornos) */
export function toRelativeSongPath(filename: string): string {
  return path.posix.join("uploads", "songs", filename);
}

/**
 * Resuelve la ruta del MP3 para FFmpeg.
 * Soporta rutas relativas, absolutas legacy, y fallback a MatuDB Storage.
 */
export function resolveSongFilePath(filePath: string): string {
  const trimmed = filePath.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  const candidates: string[] = [];

  // Ruta relativa: uploads/songs/file.mp3
  if (!path.isAbsolute(trimmed)) {
    candidates.push(path.join(process.cwd(), trimmed));
  }

  // Ruta absoluta legacy del servidor
  if (path.isAbsolute(trimmed)) {
    candidates.push(trimmed);
  }

  // Extraer uploads/songs/... de rutas absolutas antiguas
  const marker = "uploads/songs/";
  const idx = trimmed.replace(/\\/g, "/").indexOf(marker);
  if (idx !== -1) {
    const relative = trimmed.slice(idx).replace(/\\/g, "/");
    candidates.push(path.join(process.cwd(), relative));
  }

  // Fallback: solo el nombre del archivo en uploads/songs/
  const basename = path.basename(trimmed);
  candidates.push(path.join(process.cwd(), "uploads", "songs", basename));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Último recurso: URL pública de MatuDB Storage
  try {
    const db = getMatuClient();
    const storageKey = `songs/${basename}`;
    const { data } = db.storage.getPublicUrl(storageKey);
    if (data.publicUrl) return data.publicUrl;
  } catch {
    /* MatuDB no configurado en este entorno */
  }

  return candidates[0] ?? path.join(process.cwd(), trimmed);
}

export function songFileExists(filePath: string): boolean {
  const resolved = resolveSongFilePath(filePath);
  if (resolved.startsWith("http")) return true;
  return fs.existsSync(resolved);
}
