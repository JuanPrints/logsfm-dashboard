"use client";

import { Trash2, ListX, Play } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";

export function QueuePanel() {
  const { queue, nowPlaying, playback, sendCommand, radioAction } = useRadioStore();

  const clearQueue = async () => {
    await radioAction({ action: "clear-queue" });
  };

  const playFromQueue = async (songId: string) => {
    await radioAction(
      { action: "play-now", songId },
      { playback: "playing" },
    );
  };

  return (
    <div className="panel flex h-full flex-col overflow-hidden rounded-lg">
      <div className="panel-header flex items-center justify-between">
        <span>Cola de reproducción ({queue.length})</span>
        {queue.length > 0 && (
          <button
            type="button"
            onClick={clearQueue}
            className="flex items-center gap-1 text-[10px] text-danger hover:underline"
          >
            <ListX className="h-3 w-3" /> Vaciar
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {queue.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted">
            <p>Cola vacía</p>
            <p className="mt-2">
              1. Carga una playlist arriba, o<br />
              2. Agrega canciones desde la biblioteca →
            </p>
          </div>
        ) : (
          queue.map((item, index) => {
            const isCurrent =
              playback === "playing" && nowPlaying?.id === item.songId;
            return (
            <div
              key={item.id}
              className={cn(
                "group flex items-center gap-2 border-b border-border/50 px-2 py-1.5 text-xs hover:bg-card-hover",
                isCurrent && "bg-accent/10 border-l-2 border-l-accent",
              )}
            >
              <span className="w-5 text-center font-mono text-muted">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.title}</p>
                <p className="truncate text-muted">{item.artist}</p>
              </div>
              <span className="text-muted">{formatDuration(item.duration)}</span>
              <button
                type="button"
                title="Reproducir ahora"
                onClick={() => playFromQueue(item.songId)}
                className="rounded p-1 text-accent opacity-0 hover:text-accent group-hover:opacity-100"
              >
                <Play className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() =>
                  sendCommand({ action: "remove-from-queue", queueItemId: item.id })
                }
                className="rounded p-1 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
