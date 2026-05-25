/**
 * Tablas que deben tener Realtime activado en MatuDB.
 * La app de usuarios y el panel se suscriben via db.channel().
 */
export const REALTIME_TABLES = {
  /** Now playing, play/pause, live DJ, show actual */
  radioSettings: "radio_settings",
  /** Oyentes en vivo, estado online/offline del stream */
  streamStats: "stream_stats",
  /** Cola de reproducción */
  queue: "queue_items",
  /** Historial — escuchar INSERT */
  history: "playback_history",
} as const;

export const REALTIME_TABLES_ADMIN = {
  ...REALTIME_TABLES,
  playlists: "playlists",
  songs: "songs",
  scheduledShows: "scheduled_shows",
} as const;

export type RealtimeTable =
  (typeof REALTIME_TABLES)[keyof typeof REALTIME_TABLES];
