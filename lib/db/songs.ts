import { getMatuClient } from "./matu";
import { firstRow } from "./helpers";
import type { SongRow } from "./types";

export async function listSongs(categoryId?: string) {
  const db = getMatuClient();
  let query = db.from("songs").select("*").order("created_at", { ascending: false });

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SongRow[];
}

export async function getSong(id: string) {
  const db = getMatuClient();
  const { data, error } = await db.from("songs").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as SongRow;
}

export async function createSong(payload: Omit<SongRow, "id" | "created_at">) {
  const db = getMatuClient();
  const { data, error } = await db.from("songs").insert(payload);
  if (error) throw new Error(error.message);
  return firstRow(data) as SongRow;
}

export async function updateSong(id: string, payload: Partial<SongRow>) {
  const db = getMatuClient();
  const { data, error } = await db.from("songs").eq("id", id).update(payload);
  if (error) throw new Error(error.message);
  return firstRow(data) as SongRow;
}

export async function deleteSong(id: string) {
  const db = getMatuClient();
  const { error } = await db.from("songs").eq("id", id).delete();
  if (error) throw new Error(error.message);
}
