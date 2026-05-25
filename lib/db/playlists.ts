import { getMatuClient } from "./matu";
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
  const { data, error } = await db.from("playlists").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return data as PlaylistRow;
}

export async function updatePlaylist(id: string, payload: Partial<PlaylistRow>) {
  const db = getMatuClient();
  const { data, error } = await db
    .from("playlists")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PlaylistRow;
}

export async function deletePlaylist(id: string) {
  const db = getMatuClient();
  const { error } = await db.from("playlists").delete().eq("id", id);
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
    .insert({ playlist_id: playlistId, song_id: songId, position })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PlaylistSongRow;
}

export async function removeSongFromPlaylist(playlistSongId: string) {
  const db = getMatuClient();
  const { error } = await db.from("playlist_songs").delete().eq("id", playlistSongId);
  if (error) throw new Error(error.message);
}

export async function reorderPlaylistSongs(
  items: { id: string; position: number }[],
) {
  const db = getMatuClient();
  for (const item of items) {
    const { error } = await db
      .from("playlist_songs")
      .update({ position: item.position })
      .eq("id", item.id);
    if (error) throw new Error(error.message);
  }
}

export async function setActivePlaylist(playlistId: string) {
  const db = getMatuClient();
  await db.from("playlists").update({ is_active: false }).neq("id", playlistId);
  const { data, error } = await db
    .from("playlists")
    .update({ is_active: true })
    .eq("id", playlistId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PlaylistRow;
}
