"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Radio, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";

export default function LiveDjPage() {
  const { isLiveDj, micEnabled, sendCommand } = useRadioStore();
  const [djName, setDjName] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(avg / 255);
        animRef.current = requestAnimationFrame(tick);
      };
      tick();

      sendCommand({ action: "toggle-mic" });
    } catch {
      alert("No se pudo acceder al micrófono");
    }
  };

  const stopMic = () => {
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
    if (micEnabled) sendCommand({ action: "toggle-mic" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Live DJ</h1>
        <p className="text-sm text-muted">
          Transmite en vivo con micrófono mezclado con la música
        </p>
      </div>

      <div className="glass mx-auto max-w-lg rounded-2xl p-8 text-center glow-accent">
        <div
          className={cn(
            "mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full transition-all",
            isLiveDj
              ? "bg-danger/20 ring-4 ring-danger/30"
              : "bg-background ring-4 ring-border",
          )}
        >
          {micEnabled ? (
            <Mic className="h-12 w-12 text-danger animate-pulse-live" />
          ) : (
            <MicOff className="h-12 w-12 text-muted" />
          )}
        </div>

        {isLiveDj && (
          <div className="mb-6">
            <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-success transition-all duration-75"
                style={{ width: `${audioLevel * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">Nivel de micrófono</p>
          </div>
        )}

        {!isLiveDj ? (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Nombre del DJ"
              value={djName}
              onChange={(e) => setDjName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => sendCommand({ action: "go-live" })}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-danger px-6 py-3 font-medium text-white hover:bg-danger/90"
            >
              <Radio className="h-5 w-5" />
              Ir en vivo
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-3 py-1 text-sm font-medium text-danger animate-pulse-live">
              ● EN VIVO
            </span>

            <div className="flex gap-3">
              {!micEnabled ? (
                <button
                  type="button"
                  onClick={startMic}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-medium text-white"
                >
                  <Mic className="h-4 w-4" />
                  Activar mic
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopMic}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-warning px-4 py-2.5 text-sm font-medium text-white"
                >
                  <MicOff className="h-4 w-4" />
                  Silenciar mic
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  stopMic();
                  sendCommand({ action: "stop-live" });
                }}
                className="flex items-center justify-center gap-2 rounded-lg bg-background px-4 py-2.5 text-sm font-medium ring-1 ring-border hover:ring-danger"
              >
                <Square className="h-4 w-4" />
                Detener
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
