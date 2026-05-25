"use client";

import { cn, formatDuration } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";
import { Disc3 } from "lucide-react";

export function NowPlayingDeck() {
  const { nowPlaying, playback } = useRadioStore();
  const isPlaying = playback === "playing";
  const progress = nowPlaying
    ? Math.min(100, (nowPlaying.elapsed / Math.max(nowPlaying.duration, 1)) * 100)
    : 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative">
        <div
          className={cn(
            "flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-background shadow-lg",
            isPlaying && "animate-spin-slow",
          )}
          style={{ animationDuration: "3s" }}
        >
          {nowPlaying?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nowPlaying.coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Disc3 className="h-12 w-12 text-muted" />
          )}
        </div>
        {isPlaying && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-success" />
          </span>
        )}
      </div>

      <div className="min-w-[200px] flex-1">
        <p className="truncate text-xl font-bold">
          {nowPlaying?.title ?? "Sin reproducción"}
        </p>
        <p className="truncate text-sm text-muted">
          {nowPlaying?.artist ?? "Carga playlist o elige canción"}
        </p>

        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-xs text-muted">
            <span>{formatDuration(nowPlaying?.elapsed ?? 0)}</span>
            <span>{formatDuration(nowPlaying?.duration ?? 0)}</span>
          </div>
        </div>

        <p className="mt-2 text-[10px] text-muted">
          {isPlaying
            ? "● EN AIRE — emitiendo a oyentes"
            : playback === "paused"
              ? "Pausado — stream activo (silencio)"
              : "Listo — el stream permanece conectado"}
        </p>
      </div>
    </div>
  );
}
