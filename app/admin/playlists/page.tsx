"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
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
    const res = await fetch("/api/admin/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: newName }),
    });
    const json = await res.json();
    if (!json.success) {
      alert(json.error);
      return;
    }
    setNewName("");
    fetchPlaylists();
    window.location.href = `/admin/playlists/${json.data.id}`;
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar playlist?")) return;
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
        <p className="text-sm text-muted">
          Crea una playlist → entra a administrar canciones → reproduce desde la Consola DJ
        </p>
      </div>

      <div className="panel flex gap-3 rounded-lg p-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre de la nueva playlist..."
          className="flex-1 rounded border border-border bg-background px-4 py-2 text-sm outline-none focus:border-accent"
          onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
        />
        <button type="button" onClick={createPlaylist} className="dj-btn dj-btn-play">
          <Plus className="h-4 w-4" /> Crear y administrar
        </button>
      </div>

      {loading ? (
        <p className="text-muted">Cargando...</p>
      ) : playlists.length === 0 ? (
        <p className="text-muted">No hay playlists. Crea la primera arriba.</p>
      ) : (
        <div className="grid gap-2">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className={cn(
                "panel flex items-center gap-4 rounded-lg p-4",
                pl.is_active && "ring-1 ring-accent/40",
              )}
            >
              <div className="flex-1">
                <h3 className="font-semibold">{pl.name}</h3>
                {pl.is_active && (
                  <span className="text-[10px] text-accent">Playlist activa</span>
                )}
              </div>
              <Link
                href={`/admin/playlists/${pl.id}`}
                className="dj-btn dj-btn-action"
              >
                <Settings2 className="h-4 w-4" /> Administrar
              </Link>
              <button
                type="button"
                onClick={() => remove(pl.id)}
                className="rounded p-2 text-muted hover:text-danger"
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
