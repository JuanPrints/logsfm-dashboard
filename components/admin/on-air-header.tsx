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
  Repeat,
  RotateCcw,
  ListMusic,
  Radio,
  Info,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";
import { NowPlayingDeck } from "@/components/admin/now-playing-deck";

interface Playlist {
  id: string;
  name: string;
  is_active: boolean;
}

const MODE_LABELS = {
  playlist: "Modo playlist",
  manual: "Cola manual",
  single: "Canción suelta",
} as const;

export function OnAirHeader() {
  const {
    playback,
    playbackMode,
    activePlaylistId,
    activePlaylistName,
    stream,
    autoDj,
    shuffle,
    repeatMode,
    queue,
    ffmpegOk,
    pending,
    sendCommand,
    radioAction,
    refresh,
  } = useRadioStore();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPl, setSelectedPl] = useState("");
  const isPlaying = playback === "playing";

  useEffect(() => {
    fetch("/api/admin/playlists")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setPlaylists(j.data);
      });
  }, []);

  useEffect(() => {
    if (activePlaylistId) setSelectedPl(activePlaylistId);
  }, [activePlaylistId]);

  const loadPlaylist = async (play = false) => {
    if (!selectedPl) return alert("Selecciona una playlist");
    const optimisticNowPlaying = play
      ? {
          id: "loading",
          title: "Cargando playlist…",
          artist: activePlaylistName ?? "",
          duration: 0,
          elapsed: 0,
          startedAt: new Date().toISOString(),
        }
      : null;

    try {
      await radioAction(
        { action: "load-playlist", playlistId: selectedPl, play },
        play
          ? {
              playback: "playing",
              playbackMode: "playlist",
              activePlaylistId: selectedPl,
              nowPlaying: optimisticNowPlaying,
              stream: { ...stream, status: "connecting" },
            }
          : {
              playback: "stopped",
              playbackMode: "playlist",
              activePlaylistId: selectedPl,
              nowPlaying: null,
            },
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al cargar playlist");
    }
  };

  const handlePlay = async () => {
    try {
      if (isPlaying) {
        await sendCommand({ action: "pause" });
        return;
      }

      if (queue.length === 0) {
        if (playbackMode === "playlist" && (activePlaylistId || selectedPl)) {
          const id = activePlaylistId || selectedPl;
          await radioAction({
            action: "load-playlist",
            playlistId: id,
            play: true,
          });
          return;
        }
        alert(
          "No hay canciones en cola. Carga una playlist (Cargar y Play) o agrega canciones desde la biblioteca.",
        );
        return;
      }

      await sendCommand({ action: "play" });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al reproducir");
    }
  };

  const handleStop = async () => {
    try {
      await sendCommand({ action: "stop" });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al detener");
    }
  };

  const switchToManual = async () => {
    try {
      await radioAction({ action: "use-manual-mode" });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    }
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

      {ffmpegOk === false && (
        <div className="flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2 text-[11px] text-danger">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          FFmpeg no está disponible para el motor de radio. En el servidor ejecuta:{" "}
          <code className="rounded bg-background px-1">apt install -y ffmpeg</code>, añade{" "}
          <code className="rounded bg-background px-1">FFMPEG_PATH=/usr/bin/ffmpeg</code> al .env y{" "}
          <code className="rounded bg-background px-1">pm2 restart logsfm-dashboard --update-env</code>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-accent/5 px-4 py-2 text-[11px] text-muted">
        <Info className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span>
          <strong className="text-foreground">{MODE_LABELS[playbackMode]}</strong>
          {playbackMode === "playlist" && activePlaylistName
            ? ` · ${activePlaylistName}`
            : null}
          {" — "}
          Recargar la página no detiene la emisión (motor en servidor).
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4">
        <NowPlayingDeck />

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => sendCommand({ action: "previous" })}
            className="dj-btn dj-btn-action p-2 disabled:opacity-50"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handlePlay}
            className="dj-btn dj-btn-play px-4 py-2 disabled:opacity-50"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendCommand({ action: "next" })}
            className="dj-btn dj-btn-action p-2 disabled:opacity-50"
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleStop}
            className="dj-btn dj-btn-stop p-2 disabled:opacity-50"
            title="Detener música — el stream sigue en silencio"
          >
            <Square className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-l border-border pl-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => sendCommand({ action: "toggle-autodj" })}
            className={cn("dj-btn text-xs disabled:opacity-50", autoDj ? "bg-accent/20 text-accent" : "dj-btn-action")}
          >
            <Zap className="h-3 w-3" /> AutoDJ
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendCommand({ action: "toggle-shuffle" })}
            className={cn("dj-btn text-xs disabled:opacity-50", shuffle ? "bg-accent/20 text-accent" : "dj-btn-action")}
            title="Aleatorio global (settings)"
          >
            <Shuffle className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendCommand({ action: "toggle-repeat" })}
            className={cn(
              "dj-btn text-xs disabled:opacity-50",
              repeatMode !== "off" ? "bg-accent/20 text-accent" : "dj-btn-action",
            )}
            title={
              repeatMode === "one"
                ? "Repetir canción"
                : repeatMode === "all"
                  ? "Repetir playlist (solo en modo playlist)"
                  : "Repetir: apagado"
            }
          >
            <Repeat className="h-3 w-3" />
            {repeatMode === "one" ? "1" : repeatMode === "all" ? "∞" : ""}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendCommand({ action: "replay-current" })}
            className="dj-btn dj-btn-action p-2 disabled:opacity-50"
            title="Repetir canción actual"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-l border-border pl-4">
          <ListMusic className="h-4 w-4 text-muted" />
          <select
            value={selectedPl}
            onChange={(e) => setSelectedPl(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="">Playlist...</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.id === activePlaylistId ? "★" : ""}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => loadPlaylist(false)} className="dj-btn dj-btn-action text-xs">
            Cargar cola
          </button>
          <button type="button" onClick={() => loadPlaylist(true)} className="dj-btn dj-btn-play text-xs">
            Cargar y Play
          </button>
          {playbackMode === "playlist" && (
            <button type="button" onClick={switchToManual} className="dj-btn dj-btn-action text-xs">
              Cola manual
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
