"use client";

import { Mic, MicOff, Volume2 } from "lucide-react";
import { useMixerStore } from "@/lib/store/mixer-store";
import { useRadioStore } from "@/lib/store/radio-store";
import { cn } from "@/lib/utils";

export function MixerPanel() {
  const { musicVolume, micVolume, ducking, setMusicVolume, setMicVolume, setDucking } =
    useMixerStore();
  const { isLiveDj, micEnabled, sendCommand } = useRadioStore();

  return (
    <div className="panel rounded-lg">
      <div className="panel-header">Consola de audio</div>
      <div className="grid gap-4 p-4 md:grid-cols-3">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Volume2 className="h-3.5 w-3.5" />
              Música
            </span>
            <span className="font-mono text-xs text-accent">{musicVolume}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={musicVolume}
            onChange={(e) => setMusicVolume(parseInt(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-accent"
          />
          <p className="mt-1 text-[10px] text-muted">Volumen de la música en el stream</p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Mic className="h-3.5 w-3.5" />
              Micrófono
            </span>
            <span className="font-mono text-xs text-accent-blue">{micVolume}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={micVolume}
            onChange={(e) => setMicVolume(parseInt(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-accent-blue"
          />
          <button
            type="button"
            onClick={() =>
              sendCommand({
                action: micEnabled ? "toggle-mic" : "go-live",
              })
            }
            className={cn(
              "mt-2 dj-btn w-full text-xs",
              micEnabled ? "dj-btn-stop" : "dj-btn-action",
            )}
          >
            {micEnabled ? (
              <>
                <MicOff className="h-3 w-3" /> Silenciar mic
              </>
            ) : (
              <>
                <Mic className="h-3 w-3" /> Activar mic en vivo
              </>
            )}
          </button>
        </div>

        <div>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={ducking}
              onChange={(e) => setDucking(e.target.checked)}
              className="accent-accent"
            />
            <span className="font-semibold text-muted">Auto-ducking al hablar</span>
          </label>
          <div className="mt-3 flex h-8 items-end justify-center gap-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1.5 rounded-sm bg-accent/60 vu-bar",
                  !isLiveDj || !micEnabled ? "opacity-30 !h-[20%] ![animation:none]" : "",
                )}
                style={{ animationDelay: `${i * 0.07}s`, height: "40%" }}
              />
            ))}
          </div>
          <p className="mt-1 text-center text-[10px] text-muted">
            {isLiveDj ? (micEnabled ? "● EN VIVO" : "Live — mic off") : "Modo AutoDJ"}
          </p>
        </div>
      </div>
    </div>
  );
}
