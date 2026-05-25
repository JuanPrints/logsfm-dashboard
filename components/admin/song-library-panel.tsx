"use client";

import { useEffect, useState } from "react";
import { ListPlus, Play, Search, Upload } from "lucide-react";
import Link from "next/link";
import { formatDuration } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";

interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number;
  cover_url: string | null;
}

export function SongLibraryPanel() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { sendCommand, refresh } = useRadioStore();

  useEffect(() => {
    fetch("/api/admin/songs")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setSongs(j.data);
        setLoading(false);
      });
  }, []);

  const filtered = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase()),
  );

  const addToQueue = async (songId: string) => {
    await sendCommand({ action: "add-to-queue", songId });
    await refresh();
  };

  const playNow = async (songId: string) => {
    const res = await fetch("/api/admin/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "play-now", songId }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else await refresh();
  };

  return (
    <div className="panel flex h-full flex-col overflow-hidden rounded-lg">
      <div className="panel-header flex items-center justify-between">
        <span>Biblioteca de canciones</span>
        <Link href="/admin/songs" className="flex items-center gap-1 text-accent hover:underline">
          <Upload className="h-3 w-3" />
          Subir MP3
        </Link>
      </div>

      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Buscar artista o título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-center text-xs text-muted">Cargando...</p>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted">No hay canciones</p>
            <Link href="/admin/songs" className="mt-2 inline-block text-xs text-accent hover:underline">
              Sube tu primer MP3 →
            </Link>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-header">
              <tr className="text-left text-muted">
                <th className="px-2 py-1.5 font-semibold">Artista</th>
                <th className="px-2 py-1.5 font-semibold">Título</th>
                <th className="px-2 py-1.5 font-semibold">Dur.</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((song) => (
                <tr
                  key={song.id}
                  className="border-t border-border/50 hover:bg-card-hover"
                >
                  <td className="max-w-[100px] truncate px-2 py-1.5 text-muted">
                    {song.artist}
                  </td>
                  <td className="max-w-[140px] truncate px-2 py-1.5 font-medium">
                    {song.title}
                  </td>
                  <td className="px-2 py-1.5 text-muted">
                    {formatDuration(song.duration)}
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => playNow(song.id)}
                        className="rounded p-1 text-success hover:bg-success/10"
                        title="Reproducir ahora"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => addToQueue(song.id)}
                        className="rounded p-1 text-accent-blue hover:bg-accent-blue/10"
                        title="Agregar a cola"
                      >
                        <ListPlus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="border-t border-border px-2 py-1 text-[10px] text-muted">
        {filtered.length} canciones · ▶ Play = emitir ya · + = agregar a cola
      </div>
    </div>
  );
}
