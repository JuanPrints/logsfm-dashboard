"use client";

import { useEffect, useState, useRef } from "react";
import { Upload, Trash2, Music } from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number;
  cover_url: string | null;
  category_id: string | null;
}

export default function SongsPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchSongs = async () => {
    const res = await fetch("/api/admin/songs");
    const json = await res.json();
    if (json.success) setSongs(json.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    await fetch("/api/admin/songs", { method: "POST", body: formData });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    fetchSongs();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/admin/songs?id=${id}`, { method: "DELETE" });
    fetchSongs();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Canciones</h1>
          <p className="text-sm text-muted">
            Sube MP3 con metadata automática vía MatuDB Storage
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">
          <Upload className="h-4 w-4" />
          {uploading ? "Subiendo..." : "Subir MP3"}
          <input
            ref={fileRef}
            type="file"
            accept="audio/mpeg,audio/mp3,.mp3"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {loading ? (
        <p className="text-muted">Cargando...</p>
      ) : songs.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center rounded-2xl py-16">
          <Music className="h-12 w-12 text-muted" />
          <p className="mt-4 text-muted">No hay canciones. Sube tu primer MP3.</p>
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-4 py-3 font-medium">Canción</th>
                <th className="px-4 py-3 font-medium">Artista</th>
                <th className="px-4 py-3 font-medium">Álbum</th>
                <th className="px-4 py-3 font-medium">Duración</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {songs.map((song) => (
                <tr
                  key={song.id}
                  className="border-b border-border/50 transition-colors hover:bg-card-hover"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-background">
                        {song.cover_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={song.cover_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Music className="h-4 w-4 text-muted" />
                        )}
                      </div>
                      <span className="font-medium">{song.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{song.artist}</td>
                  <td className="px-4 py-3 text-muted">{song.album ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {formatDuration(song.duration)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(song.id)}
                      className="rounded p-1.5 text-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
