import { getMatuClient } from "./matu";
import { firstRow } from "./helpers";
import type { PlaylistRow, PlaylistSongRow, PlaylistSongWithDetails } from "./types";

export async function listPlaylists() {
  const db = getMatuClient();
  const { data, error } = await db
    .from("playlists")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PlaylistRow[];
}

export async function getPlaylist(id: string) {
  const db = getMatuClient();
  const { data, error } = await db.from("playlists").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as PlaylistRow;
}

export async function createPlaylist(payload: Pick<PlaylistRow, "name" | "description">) {
  const db = getMatuClient();
  const { data, error } = await db.from("playlists").insert(payload);
  if (error) throw new Error(error.message);
  return firstRow(data) as PlaylistRow;
}

export async function updatePlaylist(id: string, payload: Partial<PlaylistRow>) {
  const db = getMatuClient();
  const { data, error } = await db.from("playlists").eq("id", id).update(payload);
  if (error) throw new Error(error.message);
  return firstRow(data) as PlaylistRow;
}

export async function deletePlaylist(id: string) {
  const db = getMatuClient();
  const { error } = await db.from("playlists").eq("id", id).delete();
  if (error) throw new Error(error.message);
}

export async function getPlaylistSongs(playlistId: string) {
  const db = getMatuClient();
  const { data, error } = await db.rpc(`
    SELECT ps.*, s.title, s.artist, s.cover_url, s.duration
    FROM playlist_songs ps
    JOIN songs s ON s.id = ps.song_id
    WHERE ps.playlist_id = '${playlistId}'
    ORDER BY ps.position ASC
  `);
  if (error) throw new Error(error.message);
  return (data ?? []) as PlaylistSongWithDetails[];
}

export async function addSongToPlaylist(playlistId: string, songId: string) {
  const db = getMatuClient();
  const existing = await getPlaylistSongs(playlistId);
  const position = existing.length;

  const { data, error } = await db
    .from("playlist_songs")
    .insert({ playlist_id: playlistId, song_id: songId, position });
  if (error) throw new Error(error.message);
  return firstRow(data) as PlaylistSongRow;
}

export async function removeSongFromPlaylist(playlistSongId: string) {
  const db = getMatuClient();
  const { error } = await db.from("playlist_songs").eq("id", playlistSongId).delete();
  if (error) throw new Error(error.message);
}

export async function reorderPlaylistSongs(
  items: { id: string; position: number }[],
) {
  const db = getMatuClient();
  for (const item of items) {
    const { error } = await db
      .from("playlist_songs")
      .eq("id", item.id)
      .update({ position: item.position });
    if (error) throw new Error(error.message);
  }
}

export async function setActivePlaylist(playlistId: string) {
  const db = getMatuClient();
  await db.rpc(`UPDATE playlists SET is_active = false WHERE id != '${playlistId}'`);
  const { data, error } = await db
    .from("playlists")
    .eq("id", playlistId)
    .update({ is_active: true });
  if (error) throw new Error(error.message);
  return firstRow(data) as PlaylistRow;
}

export async function clearActivePlaylist() {
  const db = getMatuClient();
  await db.rpc("UPDATE playlists SET is_active = false");
}
