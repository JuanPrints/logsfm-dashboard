"use client";

import { formatDuration } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";
import { Trash2 } from "lucide-react";

export function QueuePanel() {
  const { queue, sendCommand } = useRadioStore();

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cola de reproducción</h2>
        <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">
          {queue.length} tracks
        </span>
      </div>

      <div className="max-h-80 space-y-1 overflow-y-auto">
        {queue.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            La cola está vacía
          </p>
        ) : (
          queue.map((item, index) => (
            <div
              key={item.id}
              className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-card-hover"
            >
              <span className="w-6 text-center text-xs text-muted">
                {index + 1}
              </span>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background">
                {item.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-muted">♪</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted">{item.artist}</p>
              </div>
              <span className="text-xs text-muted">
                {formatDuration(item.duration)}
              </span>
              <button
                type="button"
                onClick={() =>
                  sendCommand({
                    action: "remove-from-queue",
                    queueItemId: item.id,
                  })
                }
                className="rounded p-1 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
