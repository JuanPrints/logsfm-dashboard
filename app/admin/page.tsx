"use client";

import { PlayerControls } from "@/components/admin/player-controls";
import { QueuePanel } from "@/components/admin/queue-panel";
import { StreamStats } from "@/components/admin/stream-stats";
import { HistoryPanel } from "@/components/admin/history-panel";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard DJ</h1>
        <p className="text-sm text-muted">
          Control central de reproducción y streaming
        </p>
      </div>

      <PlayerControls />
      <StreamStats />

      <div className="grid gap-6 lg:grid-cols-2">
        <QueuePanel />
        <HistoryPanel />
      </div>
    </div>
  );
}
