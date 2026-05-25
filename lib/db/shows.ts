import { getMatuClient } from "./matu";
import type { ScheduledShowRow } from "./types";

export async function listScheduledShows() {
  const db = getMatuClient();
  const { data, error } = await db
    .from("scheduled_shows")
    .select("*")
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduledShowRow[];
}

export async function createScheduledShow(
  payload: Omit<ScheduledShowRow, "id" | "created_at">,
) {
  const db = getMatuClient();
  const { data, error } = await db
    .from("scheduled_shows")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ScheduledShowRow;
}

export async function updateScheduledShow(
  id: string,
  payload: Partial<ScheduledShowRow>,
) {
  const db = getMatuClient();
  const { data, error } = await db
    .from("scheduled_shows")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ScheduledShowRow;
}

export async function deleteScheduledShow(id: string) {
  const db = getMatuClient();
  const { error } = await db.from("scheduled_shows").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getActiveShowNow() {
  const now = new Date();
  const day = now.getDay();
  const time = now.toTimeString().slice(0, 8);

  const db = getMatuClient();
  const { data, error } = await db.rpc(`
    SELECT * FROM scheduled_shows
    WHERE is_active = true
      AND day_of_week = ${day}
      AND start_time <= '${time}'
      AND (start_time + (duration_minutes || ' minutes')::interval) > '${time}'
    LIMIT 1
  `);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ScheduledShowRow[];
  return rows[0] ?? null;
}
