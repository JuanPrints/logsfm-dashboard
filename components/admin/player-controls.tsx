"use client";

import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Shuffle,
  Zap,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";

export function PlayerControls() {
  const { playback, nowPlaying, autoDj, shuffle, sendCommand } = useRadioStore();
  const isPlaying = playback === "playing";

  return (
    <div className="glass rounded-2xl p-6 glow-accent">
      <div className="flex items-center gap-6">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background">
          {nowPlaying?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nowPlaying.coverUrl}
              alt={nowPlaying.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="text-3xl text-muted">♪</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold">
            {nowPlaying?.title ?? "Sin reproducción"}
          </p>
          <p className="truncate text-muted">
            {nowPlaying?.artist ?? "—"}
          </p>

          {nowPlaying && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{
                    width: `${Math.min(100, (nowPlaying.elapsed / nowPlaying.duration) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>{formatDuration(nowPlaying.elapsed)}</span>
                <span>{formatDuration(nowPlaying.duration)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => sendCommand({ action: "toggle-autodj" })}
            className={cn(
              "rounded-lg p-2.5 transition-colors",
              autoDj ? "bg-accent/20 text-accent" : "text-muted hover:bg-card-hover",
            )}
            title="AutoDJ"
          >
            <Zap className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => sendCommand({ action: "previous" })}
            className="rounded-lg p-2.5 text-muted transition-colors hover:bg-card-hover hover:text-foreground"
          >
            <SkipBack className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() =>
              sendCommand({ action: isPlaying ? "pause" : "play" })
            }
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6 ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => sendCommand({ action: "next" })}
            className="rounded-lg p-2.5 text-muted transition-colors hover:bg-card-hover hover:text-foreground"
          >
            <SkipForward className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => sendCommand({ action: "toggle-shuffle" })}
            className={cn(
              "rounded-lg p-2.5 transition-colors",
              shuffle ? "bg-accent/20 text-accent" : "text-muted hover:bg-card-hover",
            )}
            title="Shuffle"
          >
            <Shuffle className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
