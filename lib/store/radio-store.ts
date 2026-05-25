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
  pending: boolean;
  connect: () => () => void;
  refresh: () => Promise<void>;
  sendCommand: (command: AdminCommand) => Promise<void>;
  radioAction: (body: Record<string, unknown>, optimistic?: Partial<RadioState>) => Promise<void>;
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

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchRadioState(): Promise<Partial<RadioState>> {
  const res = await fetch("/api/admin/radio", { cache: "no-store" });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

function optimisticForAction(action: string): Partial<RadioState> | undefined {
  switch (action) {
    case "play":
      return { playback: "playing", stream: { ...defaultStream, status: "connecting" } };
    case "pause":
      return { playback: "paused" };
    case "stop":
      return { playback: "stopped", nowPlaying: null };
    default:
      return undefined;
  }
}

export const useRadioStore = create<RadioStore>((set, get) => ({
  connected: false,
  loading: true,
  pending: false,
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
      set({ ...data, loading: false, connected: true, pending: false });
    } catch {
      set({ loading: false, connected: false, pending: false });
    }
  },

  connect: () => {
    get().refresh();

    const unsubscribe = subscribeToRadioRealtime({
      onRadioSettings: () => {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => get().refresh(), 400);
      },
      onStreamStats: () => {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => get().refresh(), 400);
      },
      onQueue: () => get().refresh(),
      onHistory: () => get().refresh(),
    });

    set({ connected: true });
    return unsubscribe;
  },

  radioAction: async (body, optimistic) => {
    if (optimistic) set({ ...optimistic, pending: true });
    else set({ pending: true });

    const res = await fetch("/api/admin/radio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    set({ pending: false });
    if (!json.success) throw new Error(json.error);
    set({ ...json.data, connected: true });
  },

  sendCommand: async (command) => {
    const body: Record<string, unknown> = { action: command.action };
    if (command.action === "add-to-queue") body.songId = command.songId;
    if (command.action === "remove-from-queue") body.queueItemId = command.queueItemId;
    if (command.action === "reorder-queue") body.items = command.items;

    const optimistic = optimisticForAction(command.action);
    await get().radioAction(body, optimistic);
  },

  setState: (state) => set(state),
}));

export type { NowPlaying, QueueItem, HistoryItem, CurrentShow, PlaybackState, StreamInfo };
