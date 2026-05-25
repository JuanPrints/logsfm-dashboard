"use client";

import { useEffect } from "react";
import { useRadioStore } from "@/lib/store/radio-store";

/** Reloj local — el tiempo avanza sin esperar al servidor */
export function usePlaybackClock() {
  const playback = useRadioStore((s) => s.playback);
  const nowPlaying = useRadioStore((s) => s.nowPlaying);
  const setState = useRadioStore((s) => s.setState);

  useEffect(() => {
    if (playback !== "playing" || !nowPlaying) return;

    const tick = setInterval(() => {
      const current = useRadioStore.getState().nowPlaying;
      if (!current || useRadioStore.getState().playback !== "playing") return;

      const started = new Date(current.startedAt).getTime();
      const elapsed = Math.floor((Date.now() - started) / 1000);
      if (elapsed !== current.elapsed) {
        setState({
          nowPlaying: { ...current, elapsed: Math.min(elapsed, current.duration) },
        });
      }
    }, 250);

    return () => clearInterval(tick);
  }, [playback, nowPlaying?.id, nowPlaying?.startedAt, setState]);
}

/** Poll ligero del estado del engine (más rápido que MatuDB realtime) */
export function useEnginePoll(intervalMs = 3000) {
  const refresh = useRadioStore((s) => s.refresh);

  useEffect(() => {
    const id = setInterval(() => refresh(), intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);
}
