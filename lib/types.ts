export type StreamStatus = "online" | "offline" | "connecting" | "error";

export type PlaybackState = "playing" | "paused" | "stopped";

export type RepeatMode = "off" | "one" | "all";

export interface NowPlaying {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  coverUrl?: string | null;
  duration: number;
  elapsed: number;
  startedAt: string;
}

export interface QueueItem {
  id: string;
  songId: string;
  title: string;
  artist: string;
  coverUrl?: string | null;
  duration: number;
  position: number;
}

export interface HistoryItem {
  id: string;
  songId: string;
  title: string;
  artist: string;
  coverUrl?: string | null;
  playedAt: string;
  duration: number;
}

export interface CurrentShow {
  id: string;
  name: string;
  djName?: string | null;
  description?: string | null;
  startedAt: string;
  endsAt?: string | null;
  isLive: boolean;
}

export interface StreamInfo {
  status: StreamStatus;
  listeners: number;
  peakListeners: number;
  bitrate: number;
  format: string;
  uptime: number;
  mountPoint: string;
}

export interface RadioState {
  playback: PlaybackState;
  nowPlaying: NowPlaying | null;
  queue: QueueItem[];
  history: HistoryItem[];
  currentShow: CurrentShow | null;
  stream: StreamInfo;
  isLiveDj: boolean;
  micEnabled: boolean;
  autoDj: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
}

export interface SocketEvents {
  "radio:state": RadioState;
  "radio:now-playing": NowPlaying | null;
  "radio:queue": QueueItem[];
  "radio:listeners": number;
  "radio:stream-status": StreamInfo;
  "radio:playback": PlaybackState;
  "radio:live-dj": { isLive: boolean; micEnabled: boolean };
  "admin:command": AdminCommand;
}

export type AdminCommand =
  | { action: "play" }
  | { action: "pause" }
  | { action: "stop" }
  | { action: "next" }
  | { action: "previous" }
  | { action: "toggle-autodj" }
  | { action: "toggle-shuffle" }
  | { action: "toggle-repeat" }
  | { action: "replay-current" }
  | { action: "toggle-mic" }
  | { action: "go-live" }
  | { action: "stop-live" }
  | { action: "add-to-queue"; songId: string }
  | { action: "remove-from-queue"; queueItemId: string }
  | { action: "reorder-queue"; items: { id: string; position: number }[] };

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
