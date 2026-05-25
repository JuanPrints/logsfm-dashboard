"use client";

import { formatDuration } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";

export function HistoryPanel() {
  const { history } = useRadioStore();

  return (
    <div className="panel max-h-40 overflow-hidden rounded-lg">
      <div className="panel-header">Historial reciente</div>
      <div className="max-h-28 overflow-y-auto">
        {history.length === 0 ? (
          <p className="p-3 text-center text-[10px] text-muted">Sin historial</p>
        ) : (
          history.slice(0, 8).map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 border-b border-border/30 px-2 py-1 text-[10px]"
            >
              <span className="min-w-0 flex-1 truncate">{item.artist} — {item.title}</span>
              <span className="text-muted">{formatDuration(item.duration)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
