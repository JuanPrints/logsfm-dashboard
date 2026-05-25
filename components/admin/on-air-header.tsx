"use client";

import { useEffect, useState } from "react";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Zap,
  Shuffle,
  ListMusic,
  Radio,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";

interface Playlist {
  id: string;
  name: string;
  is_active: boolean;
}

export function OnAirHeader() {
  const {
    playback,
    nowPlaying,
    stream,
    autoDj,
    shuffle,
    queue,
    sendCommand,
    refresh,
  } = useRadioStore();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPl, setSelectedPl] = useState("");
  const isPlaying = playback === "playing";

  useEffect(() => {
    fetch("/api/admin/playlists")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setPlaylists(j.data);
          const active = j.data.find((p: Playlist) => p.is_active);
          if (active) setSelectedPl(active.id);
        }
      });
  }, []);

  const loadPlaylist = async (play = false) => {
    if (!selectedPl) return alert("Selecciona una playlist");
    const res = await fetch("/api/admin/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "load-playlist",
        playlistId: selectedPl,
        play,
      }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else await refresh();
  };

  const handlePlay = async () => {
    try {
      if (isPlaying) {
        await sendCommand({ action: "pause" });
      } else {
        if (queue.length === 0 && selectedPl) {
          await loadPlaylist(false);
        }
        await sendCommand({ action: "play" });
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al reproducir");
    }
  };

  const handleStop = async () => {
    await fetch("/api/admin/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    await refresh();
  };

  return (
    <div className="panel overflow-hidden rounded-lg">
      <div className="panel-header flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5" />
          On Air — Consola DJ
        </span>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
            stream.status === "online"
              ? "bg-success/20 text-success"
              : stream.status === "error"
                ? "bg-danger/20 text-danger"
                : "bg-muted/20 text-muted",
          )}
        >
          Stream: {stream.status} · {stream.listeners} oyentes
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-background">
          {nowPlaying?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={nowPlaying.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl text-muted">♪</span>
          )}
        </div>

        <div className="min-w-[180px] flex-1">
          <p className="truncate text-lg font-bold">
            {nowPlaying?.title ?? "Sin reproducción"}
          </p>
          <p className="truncate text-sm text-muted">
            {nowPlaying?.artist ?? "Selecciona canciones o carga una playlist"}
          </p>
          {nowPlaying && (
            <div className="mt-1 flex gap-2 text-[10px] text-muted">
              <span>{formatDuration(nowPlaying.elapsed)}</span>
              <span>/</span>
              <span>{formatDuration(nowPlaying.duration)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => sendCommand({ action: "previous" })} className="dj-btn dj-btn-action p-2">
            <SkipBack className="h-4 w-4" />
          </button>
          <button type="button" onClick={handlePlay} className="dj-btn dj-btn-play px-4 py-2">
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button type="button" onClick={() => sendCommand({ action: "next" })} className="dj-btn dj-btn-action p-2">
            <SkipForward className="h-4 w-4" />
          </button>
          <button type="button" onClick={handleStop} className="dj-btn dj-btn-stop p-2" title="Detener stream">
            <Square className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-l border-border pl-4">
          <button
            type="button"
            onClick={() => sendCommand({ action: "toggle-autodj" })}
            className={cn("dj-btn text-xs", autoDj ? "bg-accent/20 text-accent" : "dj-btn-action")}
          >
            <Zap className="h-3 w-3" /> AutoDJ
          </button>
          <button
            type="button"
            onClick={() => sendCommand({ action: "toggle-shuffle" })}
            className={cn("dj-btn text-xs", shuffle ? "bg-accent/20 text-accent" : "dj-btn-action")}
          >
            <Shuffle className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-l border-border pl-4">
          <ListMusic className="h-4 w-4 text-muted" />
          <select
            value={selectedPl}
            onChange={(e) => setSelectedPl(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="">Playlist...</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.is_active ? "★" : ""}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => loadPlaylist(false)} className="dj-btn dj-btn-action text-xs">
            Cargar cola
          </button>
          <button type="button" onClick={() => loadPlaylist(true)} className="dj-btn dj-btn-play text-xs">
            Cargar y Play
          </button>
        </div>
      </div>
    </div>
  );
}
