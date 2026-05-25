import { getMatuClient } from "./matu";
import type { CategoryRow, RadioSettingsRow, StreamStatsRow } from "./types";

export async function getStreamStats() {
  const db = getMatuClient();
  const { data, error } = await db
    .from("stream_stats")
    .select("*")
    .eq("id", "default")
    .single();
  if (error) throw new Error(error.message);
  return data as StreamStatsRow;
}

export async function updateStreamStats(payload: Partial<StreamStatsRow>) {
  const db = getMatuClient();
  const current = await getStreamStats().catch(() => null);
  const peak = Math.max(current?.peak_listeners ?? 0, payload.listeners ?? 0);

  const { data, error } = await db
    .from("stream_stats")
    .update({
      ...payload,
      peak_listeners: payload.listeners != null ? peak : current?.peak_listeners,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default")
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as StreamStatsRow;
}

export async function getRadioSettings() {
  const db = getMatuClient();
  const { data, error } = await db
    .from("radio_settings")
    .select("*")
    .eq("id", "default")
    .single();
  if (error) throw new Error(error.message);
  return data as RadioSettingsRow;
}

export async function updateRadioSettings(payload: Partial<RadioSettingsRow>) {
  const db = getMatuClient();
  const { data, error } = await db
    .from("radio_settings")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", "default")
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as RadioSettingsRow;
}

export async function listCategories() {
  const db = getMatuClient();
  const { data, error } = await db
    .from("categories")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryRow[];
}

export async function createCategory(payload: Pick<CategoryRow, "name" | "slug" | "color">) {
  const db = getMatuClient();
  const { data, error } = await db.from("categories").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return data as CategoryRow;
}

export async function uploadSongFile(filename: string, file: File | Blob | Buffer) {
  const db = getMatuClient();
  const path = `songs/${Date.now()}-${filename}`;
  const { data, error } = await db.storage.upload(path, file);
  if (error) throw new Error(error.message);
  const { data: urlData } = db.storage.getPublicUrl(path);
  return { path, publicUrl: urlData.publicUrl, data };
}

export async function uploadCoverImage(filename: string, file: File | Blob | Buffer) {
  const db = getMatuClient();
  const path = `covers/${Date.now()}-${filename}`;
  const { data, error } = await db.storage.upload(path, file);
  if (error) throw new Error(error.message);
  const { data: urlData } = db.storage.getPublicUrl(path);
  return { path, publicUrl: urlData.publicUrl, data };
}
