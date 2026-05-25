import { getMatuClient } from "./matu";
import type { QueueItemRow, QueueItemWithSong } from "./types";

export async function getQueue() {
  const db = getMatuClient();
  const { data, error } = await db.rpc(`
    SELECT q.*, s.title, s.artist, s.cover_url, s.duration
    FROM queue_items q
    JOIN songs s ON s.id = q.song_id
    ORDER BY q.position ASC
  `);
  if (error) throw new Error(error.message);
  return (data ?? []) as QueueItemWithSong[];
}

export async function addToQueue(songId: string, source = "manual") {
  const db = getMatuClient();
  const queue = await getQueue();
  const position = queue.length;

  const { data, error } = await db
    .from("queue_items")
    .insert({ song_id: songId, position, source })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as QueueItemRow;
}

export async function removeFromQueue(queueItemId: string) {
  const db = getMatuClient();
  const { error } = await db.from("queue_items").delete().eq("id", queueItemId);
  if (error) throw new Error(error.message);
  await normalizeQueuePositions();
}

export async function clearQueue() {
  const db = getMatuClient();
  const { error } = await db.rpc("DELETE FROM queue_items");
  if (error) throw new Error(error.message);
}

export async function reorderQueue(items: { id: string; position: number }[]) {
  const db = getMatuClient();
  for (const item of items) {
    const { error } = await db
      .from("queue_items")
      .update({ position: item.position })
      .eq("id", item.id);
    if (error) throw new Error(error.message);
  }
}

export async function popNextFromQueue() {
  const queue = await getQueue();
  if (queue.length === 0) return null;

  const next = queue[0];
  await removeFromQueue(next.id);
  return next;
}

async function normalizeQueuePositions() {
  const queue = await getQueue();
  const db = getMatuClient();
  for (let i = 0; i < queue.length; i++) {
    await db.from("queue_items").update({ position: i }).eq("id", queue[i].id);
  }
}

export async function fillQueueFromPlaylist(playlistId: string, shuffle = false) {
  const db = getMatuClient();
  const { data, error } = await db.rpc(`
    SELECT song_id FROM playlist_songs
    WHERE playlist_id = '${playlistId}'
    ORDER BY position ASC
  `);
  if (error) throw new Error(error.message);

  const songIds = ((data ?? []) as { song_id: string }[]).map((r) => r.song_id);
  if (shuffle) {
    for (let i = songIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [songIds[i], songIds[j]] = [songIds[j], songIds[i]];
    }
  }

  await clearQueue();
  for (let i = 0; i < songIds.length; i++) {
    await db.from("queue_items").insert({
      song_id: songIds[i],
      position: i,
      source: "playlist",
    });
  }
}
