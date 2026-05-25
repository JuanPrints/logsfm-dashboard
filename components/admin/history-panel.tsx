"use client";

import { formatDuration } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";

export function HistoryPanel() {
  const { history } = useRadioStore();

  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="mb-4 text-lg font-semibold">Historial reciente</h2>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {history.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Sin historial</p>
        ) : (
          history.slice(0, 10).map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.title}</p>
                <p className="truncate text-xs text-muted">{item.artist}</p>
              </div>
              <span className="text-xs text-muted">
                {formatDuration(item.duration)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
