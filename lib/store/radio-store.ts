"use client";

import { create } from "zustand";
import type {
  AdminCommand,
  CurrentShow,
  HistoryItem,
  NowPlaying,
  PlaybackState,
  QueueItem,
  RadioState,
  StreamInfo,
} from "@/lib/types";
import { subscribeToRadioRealtime } from "@/lib/db/realtime";

interface RadioStore extends RadioState {
  connected: boolean;
  loading: boolean;
  connect: () => () => void;
  refresh: () => Promise<void>;
  sendCommand: (command: AdminCommand) => Promise<void>;
  setState: (state: Partial<RadioState>) => void;
}

const defaultStream: StreamInfo = {
  status: "offline",
  listeners: 0,
  peakListeners: 0,
  bitrate: 128,
  format: "mp3",
  uptime: 0,
  mountPoint: "/stream",
};

async function fetchRadioState(): Promise<Partial<RadioState>> {
  const res = await fetch("/api/admin/radio");
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export const useRadioStore = create<RadioStore>((set, get) => ({
  connected: false,
  loading: true,
  playback: "stopped",
  nowPlaying: null,
  queue: [],
  history: [],
  currentShow: null,
  stream: defaultStream,
  isLiveDj: false,
  micEnabled: false,
  autoDj: true,
  shuffle: false,

  refresh: async () => {
    try {
      const data = await fetchRadioState();
      set({ ...data, loading: false, connected: true });
    } catch {
      set({ loading: false, connected: false });
    }
  },

  connect: () => {
    get().refresh();

    const unsubscribe = subscribeToRadioRealtime({
      onRadioSettings: () => get().refresh(),
      onStreamStats: () => get().refresh(),
      onQueue: () => get().refresh(),
      onHistory: () => get().refresh(),
    });

    set({ connected: true });
    return unsubscribe;
  },

  sendCommand: async (command) => {
    const body: Record<string, unknown> = { action: command.action };

    if (command.action === "add-to-queue") body.songId = command.songId;
    if (command.action === "remove-from-queue") body.queueItemId = command.queueItemId;
    if (command.action === "reorder-queue") body.items = command.items;

    const res = await fetch("/api/admin/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    set({ ...json.data, connected: true });
  },

  setState: (state) => set(state),
}));

// Re-export types for convenience in components
export type { NowPlaying, QueueItem, HistoryItem, CurrentShow, PlaybackState, StreamInfo };
