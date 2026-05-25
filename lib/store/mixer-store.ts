"use client";

import { create } from "zustand";

interface MixerStore {
  musicVolume: number;
  micVolume: number;
  ducking: boolean;
  setMusicVolume: (v: number) => void;
  setMicVolume: (v: number) => void;
  setDucking: (v: boolean) => void;
  syncToServer: () => Promise<void>;
}

export const useMixerStore = create<MixerStore>((set, get) => ({
  musicVolume: 85,
  micVolume: 100,
  ducking: true,

  setMusicVolume: (v) => {
    set({ musicVolume: v });
    get().syncToServer();
  },

  setMicVolume: (v) => {
    set({ micVolume: v });
    get().syncToServer();
  },

  setDucking: (v) => {
    set({ ducking: v });
    get().syncToServer();
  },

  syncToServer: async () => {
    const { musicVolume, micVolume, ducking } = get();
    await fetch("/api/admin/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-volume",
        musicVolume,
        micVolume,
        ducking,
      }),
    }).catch(() => {});
  },
}));
