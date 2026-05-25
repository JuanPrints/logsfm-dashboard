import fs from "fs/promises";
import path from "path";
import { getMatuClient } from "@/lib/db/matu";
import { toRelativeSongPath } from "@/lib/upload/resolve-song-path";

export const SONGS_DIR = path.join(process.cwd(), "uploads", "songs");
export const COVERS_DIR = path.join(process.cwd(), "public", "uploads", "covers");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Guarda MP3 en disco local (FFmpeg lo usa directamente) */
export async function storeSongLocally(filename: string, buffer: Buffer) {
  await ensureDir(SONGS_DIR);
  const name = `${Date.now()}-${safeFilename(filename)}`;
  const fullPath = path.join(SONGS_DIR, name);
  await fs.writeFile(fullPath, buffer);
  return toRelativeSongPath(name);
}

/** Guarda cover local si MatuDB Storage falla */
export async function storeCoverLocally(filename: string, buffer: Buffer) {
  await ensureDir(COVERS_DIR);
  const name = `${Date.now()}-${safeFilename(filename)}`;
  const fullPath = path.join(COVERS_DIR, name);
  await fs.writeFile(fullPath, buffer);
  return fullPath;
}

/** Intenta MatuDB Storage; no lanza error si falla */
export async function tryMatuStorageUpload(
  folder: "songs" | "covers",
  filename: string,
  data: Buffer,
): Promise<string | null> {
  try {
    const db = getMatuClient();
    const storagePath = `${folder}/${Date.now()}-${safeFilename(filename)}`;
    const { error } = await db.storage.upload(storagePath, data);
    if (error) {
      console.warn(`[MatuDB Storage] ${folder}:`, error.message);
      return null;
    }
    const { data: urlData } = db.storage.getPublicUrl(storagePath);
    return urlData.publicUrl;
  } catch (err) {
    console.warn(`[MatuDB Storage] ${folder}:`, err);
    return null;
  }
}

export async function storeSongFile(filename: string, buffer: Buffer) {
  const relativePath = await storeSongLocally(filename, buffer);
  const remoteUrl = await tryMatuStorageUpload("songs", filename, buffer);
  return { relativePath, remoteUrl };
}

export async function storeCoverFile(filename: string, buffer: Buffer) {
  const remoteUrl = await tryMatuStorageUpload("covers", filename, buffer);
  if (remoteUrl) return remoteUrl;
  const localPath = await storeCoverLocally(filename, buffer);
  return `/uploads/covers/${path.basename(localPath)}`;
}
