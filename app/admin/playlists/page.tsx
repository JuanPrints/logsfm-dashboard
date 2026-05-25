"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Play, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  shuffle: boolean;
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");

  const fetchPlaylists = async () => {
    const res = await fetch("/api/admin/playlists");
    const json = await res.json();
    if (json.success) setPlaylists(json.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    await fetch("/api/admin/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: newName }),
    });
    setNewName("");
    fetchPlaylists();
  };

  const activate = async (id: string) => {
    await fetch("/api/admin/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate", id, loadQueue: true }),
    });
    fetchPlaylists();
  };

  const remove = async (id: string) => {
    await fetch("/api/admin/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    fetchPlaylists();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Playlists</h1>
        <p className="text-sm text-muted">Gestiona tus listas de reproducción</p>
      </div>

      <div className="glass flex gap-3 rounded-xl p-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre de la playlist..."
          className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none focus:border-accent"
          onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
        />
        <button
          type="button"
          onClick={createPlaylist}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" />
          Crear
        </button>
      </div>

      {loading ? (
        <p className="text-muted">Cargando...</p>
      ) : (
        <div className="grid gap-3">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className={cn(
                "glass flex items-center gap-4 rounded-xl p-4",
                pl.is_active && "ring-1 ring-accent/50",
              )}
            >
              <GripVertical className="h-5 w-5 text-muted" />
              <div className="flex-1">
                <h3 className="font-semibold">{pl.name}</h3>
                {pl.description && (
                  <p className="text-sm text-muted">{pl.description}</p>
                )}
              </div>
              {pl.is_active && (
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">
                  Activa
                </span>
              )}
              <button
                type="button"
                onClick={() => activate(pl.id)}
                className="rounded-lg p-2 text-muted hover:bg-card-hover hover:text-accent"
                title="Activar y cargar cola"
              >
                <Play className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(pl.id)}
                className="rounded-lg p-2 text-muted hover:bg-card-hover hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
