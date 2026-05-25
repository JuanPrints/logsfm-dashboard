import { getMatuClient } from "./matu";
import type { HistoryRow } from "./types";

export async function getHistory(limit = 50) {
  const db = getMatuClient();
  const { data, error } = await db
    .from("playback_history")
    .select("*")
    .order("played_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as HistoryRow[];
}

export async function addToHistory(payload: {
  song_id: string;
  title: string;
  artist: string;
  cover_url?: string | null;
  duration: number;
}) {
  const db = getMatuClient();
  const { data, error } = await db
    .from("playback_history")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as HistoryRow;
}
