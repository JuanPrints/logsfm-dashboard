"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Radio, Square, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRadioStore } from "@/lib/store/radio-store";
import { useMixerStore } from "@/lib/store/mixer-store";

export default function LiveDjPage() {
  const { isLiveDj, micEnabled, sendCommand } = useRadioStore();
  const { micVolume, setMicVolume } = useMixerStore();
  const [djName, setDjName] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [micError, setMicError] = useState("");
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((list) => {
        const mics = list.filter((d) => d.kind === "audioinput");
        setDevices(mics);
        if (mics[0] && !deviceId) setDeviceId(mics[0].deviceId);
      })
      .catch(() => setMicError("No se pudo listar dispositivos de audio"));
  }, [deviceId]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  const stopMicLocal = () => {
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  };

  const startMic = async () => {
    setMicError("");
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
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

      if (!micEnabled) {
        await sendCommand({ action: "toggle-mic" });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo acceder al micrófono";
      setMicError(
        msg.includes("Permission")
          ? "Permiso denegado. Usa HTTPS y permite el micrófono en el navegador."
          : msg,
      );
    }
  };

  const stopMic = async () => {
    stopMicLocal();
    if (micEnabled) await sendCommand({ action: "toggle-mic" });
  };

  const goLive = async () => {
    await fetch("/api/admin/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "go-live",
        djName: djName.trim() || "DJ Live",
      }),
    });
    const { refresh } = useRadioStore.getState();
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Live DJ</h1>
        <p className="text-sm text-muted">
          Modo en vivo con monitoreo de micrófono. La mezcla de voz al stream Icecast
          requiere la consola de audio del servidor (próxima versión).
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-muted">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>
          El medidor de mic funciona en tu navegador. Para que los oyentes escuchen tu voz
          en <strong>stream.logsfm.com</strong>, aún falta conectar el audio del mic al
          motor FFmpeg. Mientras tanto usa la música del AutoDJ y controla volumen abajo.
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
          <div className="mb-6 space-y-3 text-left">
            <label className="block text-xs font-semibold text-muted">
              Micrófono
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
              >
                {devices.length === 0 && (
                  <option value="">Sin dispositivos — pulsa Activar mic</option>
                )}
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Micrófono ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-muted">
              Ganancia mic (preview)
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={micVolume}
                  onChange={(e) => setMicVolume(parseInt(e.target.value, 10))}
                  className="h-1.5 flex-1 accent-accent-blue"
                />
                <span className="w-10 font-mono text-accent-blue">{micVolume}%</span>
              </div>
            </label>

            <div>
              <div className="h-2 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-success transition-all duration-75"
                  style={{ width: `${Math.min(100, audioLevel * 120)}%` }}
                />
              </div>
              <p className="mt-1 text-center text-xs text-muted">
                Nivel de entrada {micEnabled ? "● detectando" : "— mic off"}
              </p>
            </div>

            {micError && (
              <p className="text-center text-xs text-danger">{micError}</p>
            )}
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
              onClick={goLive}
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
                onClick={async () => {
                  stopMicLocal();
                  await sendCommand({ action: "stop-live" });
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

      <p className="text-center text-xs text-muted">
        Programación de shows:{" "}
        <a href="/admin/schedule" className="text-accent hover:underline">
          /admin/schedule
        </a>
      </p>
    </div>
  );
}
