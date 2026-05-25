"use client";

import { Trash2, ListX } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";

export function QueuePanel() {
  const { queue, sendCommand, refresh } = useRadioStore();

  const clearQueue = async () => {
    await fetch("/api/admin/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear-queue" }),
    });
    await refresh();
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
          queue.map((item, index) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 border-b border-border/50 px-2 py-1.5 text-xs hover:bg-card-hover"
            >
              <span className="w-5 text-center font-mono text-muted">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.title}</p>
                <p className="truncate text-muted">{item.artist}</p>
              </div>
              <span className="text-muted">{formatDuration(item.duration)}</span>
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
          ))
        )}
      </div>
    </div>
  );
}
