export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  color: string;
  created_at: string;
}

export interface SongRow {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number;
  cover_url: string | null;
  file_path: string;
  category_id: string | null;
  created_at: string;
}

export interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  shuffle: boolean;
  created_at: string;
}

export interface PlaylistSongRow {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number;
}

export interface QueueItemRow {
  id: string;
  song_id: string;
  position: number;
  source: string;
  added_at: string;
}

export interface HistoryRow {
  id: string;
  song_id: string;
  title: string;
  artist: string;
  cover_url: string | null;
  duration: number;
  played_at: string;
}

export interface ScheduledShowRow {
  id: string;
  name: string;
  dj_name: string | null;
  description: string | null;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  playlist_id: string | null;
  is_active: boolean;
  created_at: string;
}

export type PlaybackMode = "playlist" | "manual" | "single";

export interface RadioSettingsRow {
  id: string;
  playback_state: string;
  current_song_id: string | null;
  playback_mode?: PlaybackMode | string;
  active_playlist_id?: string | null;
  auto_dj: boolean;
  shuffle: boolean;
  repeat_mode?: string;
  music_volume?: number;
  is_live_dj: boolean;
  mic_enabled: boolean;
  current_show_name: string | null;
  current_dj_name: string | null;
  show_started_at: string | null;
  updated_at: string;
}

export interface StreamStatsRow {
  id: string;
  status: string;
  listeners: number;
  peak_listeners: number;
  bitrate: number;
  uptime_seconds: number;
  updated_at: string;
}

export interface QueueItemWithSong extends QueueItemRow {
  title: string;
  artist: string;
  cover_url: string | null;
  duration: number;
}

export interface PlaylistSongWithDetails extends PlaylistSongRow {
  title: string;
  artist: string;
  cover_url: string | null;
  duration: number;
}
