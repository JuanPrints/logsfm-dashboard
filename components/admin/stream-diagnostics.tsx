"use client";

import { useRadioStore } from "@/lib/store/radio-store";
import { AlertTriangle } from "lucide-react";

export function StreamDiagnostics() {
  const { stream, queue, playback } = useRadioStore();

  if (stream.status === "online") return null;

  const hints: string[] = [];
  if (queue.length === 0) hints.push("La cola está vacía — carga una playlist o agrega canciones");
  if (playback === "stopped" && queue.length > 0)
    hints.push("Tienes canciones en cola — pulsa ▶ Play para emitir");
  hints.push("Verifica ICECAST_PASSWORD en .env = source-password en icecast.xml");
  hints.push("Icecast debe estar corriendo: systemctl status icecast2");

  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-xs">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div>
        <p className="font-semibold text-warning">
          Stream {stream.status} — {queue.length} en cola
        </p>
        <ul className="mt-1 list-inside list-disc text-muted">
          {hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
