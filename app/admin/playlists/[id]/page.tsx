"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ListPlus,
  Play,
  Trash2,
  Music,
} from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface Song {
  id: string;
  title: string;
  artist: string;
  duration: number;
  cover_url: string | null;
}

interface PlaylistSong {
  id: string;
  song_id: string;
  title: string;
  artist: string;
  duration: number;
  position: number;
}

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState("");
  const [playlistSongs, setPlaylistSongs] = useState<PlaylistSong[]>([]);
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [search, setSearch] = useState("");

  const fetchAll = async () => {
    const [plRes, songsRes] = await Promise.all([
      fetch(`/api/admin/playlists/${id}`),
      fetch("/api/admin/songs"),
    ]);
    const plJson = await plRes.json();
    const songsJson = await songsRes.json();
    if (plJson.success) {
      setName(plJson.data.name);
      setPlaylistSongs(plJson.data.songs ?? []);
    }
    if (songsJson.success) setAllSongs(songsJson.data);
  };

  useEffect(() => {
    fetchAll();
  }, [id]);

  const addSong = async (songId: string) => {
    await fetch("/api/admin/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-song", playlistId: id, songId }),
    });
    fetchAll();
  };

  const removeSong = async (playlistSongId: string) => {
    await fetch("/api/admin/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove-song", playlistSongId }),
    });
    fetchAll();
  };

  const loadAndPlay = async () => {
    const res = await fetch("/api/admin/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "load-playlist", playlistId: id, play: true }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else window.location.href = "/admin";
  };

  const inPlaylist = new Set(playlistSongs.map((s) => s.song_id));
  const available = allSongs.filter(
    (s) =>
      !inPlaylist.has(s.id) &&
      (s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.artist.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/playlists" className="text-muted hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{name || "Playlist"}</h1>
            <p className="text-xs text-muted">{playlistSongs.length} canciones</p>
          </div>
        </div>
        <button type="button" onClick={loadAndPlay} className="dj-btn dj-btn-play">
          <Play className="h-4 w-4" /> Cargar cola y emitir
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <div className="panel flex flex-col overflow-hidden rounded-lg">
          <div className="panel-header">Canciones en playlist</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {playlistSongs.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted">
                Vacía — agrega canciones desde la derecha →
              </p>
            ) : (
              playlistSongs.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-xs hover:bg-card-hover"
                >
                  <span className="w-5 text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="truncate text-muted">{s.artist}</p>
                  </div>
                  <span className="text-muted">{formatDuration(s.duration)}</span>
                  <button
                    type="button"
                    onClick={() => removeSong(s.id)}
                    className="rounded p-1 text-muted hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel flex flex-col overflow-hidden rounded-lg">
          <div className="panel-header">Agregar canciones</div>
          <div className="border-b border-border p-2">
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {available.map((song) => (
              <div
                key={song.id}
                className="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-xs hover:bg-card-hover"
              >
                <Music className="h-3.5 w-3.5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{song.title}</p>
                  <p className="truncate text-muted">{song.artist}</p>
                </div>
                <button
                  type="button"
                  onClick={() => addSong(song.id)}
                  className="dj-btn dj-btn-action px-2 py-1"
                >
                  <ListPlus className="h-3 w-3" /> Agregar
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
