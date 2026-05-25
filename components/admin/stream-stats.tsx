"use client";

import { Users, Radio, Clock, Signal } from "lucide-react";
import { useRadioStore } from "@/lib/store/radio-store";
import { cn, formatDuration } from "@/lib/utils";

export function StreamStats() {
  const { stream, currentShow, isLiveDj } = useRadioStore();

  const stats = [
    {
      label: "Oyentes",
      value: stream.listeners.toString(),
      icon: Users,
      color: "text-accent",
    },
    {
      label: "Estado",
      value: stream.status,
      icon: Signal,
      color: stream.status === "online" ? "text-success" : "text-warning",
    },
    {
      label: "Bitrate",
      value: `${stream.bitrate}kbps`,
      icon: Radio,
      color: "text-accent",
    },
    {
      label: "Uptime",
      value: formatDuration(stream.uptime),
      icon: Clock,
      color: "text-muted",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4", color)} />
              <span className="text-xs text-muted">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold capitalize">{value}</p>
          </div>
        ))}
      </div>

      {currentShow && (
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2">
            {isLiveDj && (
              <span className="flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger animate-pulse-live">
                ● LIVE
              </span>
            )}
            <h3 className="font-semibold">{currentShow.name}</h3>
          </div>
          {currentShow.djName && (
            <p className="mt-1 text-sm text-muted">DJ: {currentShow.djName}</p>
          )}
        </div>
      )}
    </div>
  );
}
