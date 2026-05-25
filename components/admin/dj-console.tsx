"use client";

import { OnAirHeader } from "@/components/admin/on-air-header";
import { QueuePanel } from "@/components/admin/queue-panel";
import { SongLibraryPanel } from "@/components/admin/song-library-panel";
import { MixerPanel } from "@/components/admin/mixer-panel";
import { HistoryPanel } from "@/components/admin/history-panel";
import { StreamDiagnostics } from "@/components/admin/stream-diagnostics";
import { useEnginePoll, usePlaybackClock } from "@/lib/hooks/use-playback-clock";

export function DjConsole() {
  usePlaybackClock();
  useEnginePoll(2000);

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col gap-3">
      <OnAirHeader />
      <StreamDiagnostics />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-5">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <div className="min-h-0 flex-1">
            <QueuePanel />
          </div>
          <HistoryPanel />
        </div>
        <div className="min-h-0 lg:col-span-3">
          <SongLibraryPanel />
        </div>
      </div>

      <MixerPanel />
    </div>
  );
}
