-- ============================================================
-- LogsFM — Schema PostgreSQL para MatuDB
-- Ejecutar en tu proyecto MatuDB (db.matudb.com o self-hosted)
-- ============================================================

-- ── REALTIME (activar en panel MatuDB) ──────────────────────
-- Tablas que la app de usuarios y el panel deben escuchar:
--
--   radio_settings    → now playing, play/pause, live DJ
--   stream_stats      → oyentes, estado del stream
--   queue_items       → cola de reproducción
--   playback_history  → historial (INSERT)
--
-- Tablas opcionales (solo admin):
--   playlists, songs, scheduled_shows
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT 'Unknown',
  album TEXT,
  duration INTEGER NOT NULL DEFAULT 0,
  cover_url TEXT,
  file_path TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  shuffle BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(playlist_id, song_id)
);

CREATE TABLE IF NOT EXISTS queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  source TEXT DEFAULT 'manual',
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playback_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  cover_url TEXT,
  duration INTEGER NOT NULL DEFAULT 0,
  played_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dj_name TEXT,
  description TEXT,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  playlist_id UUID REFERENCES playlists(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Estado global de la radio (REALTIME ✓)
CREATE TABLE IF NOT EXISTS radio_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  playback_state TEXT DEFAULT 'stopped',
  current_song_id UUID REFERENCES songs(id) ON DELETE SET NULL,
  auto_dj BOOLEAN DEFAULT true,
  shuffle BOOLEAN DEFAULT false,
  is_live_dj BOOLEAN DEFAULT false,
  mic_enabled BOOLEAN DEFAULT false,
  current_show_name TEXT,
  current_dj_name TEXT,
  show_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stats del stream Icecast (REALTIME ✓)
CREATE TABLE IF NOT EXISTS stream_stats (
  id TEXT PRIMARY KEY DEFAULT 'default',
  status TEXT DEFAULT 'offline',
  listeners INTEGER DEFAULT 0,
  peak_listeners INTEGER DEFAULT 0,
  bitrate INTEGER DEFAULT 128,
  uptime_seconds INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO radio_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;
INSERT INTO stream_stats (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- Categorías iniciales
INSERT INTO categories (name, slug, color) VALUES
  ('Pop', 'pop', '#6366f1'),
  ('Rock', 'rock', '#ef4444'),
  ('Electrónica', 'electronica', '#22c55e'),
  ('Latino', 'latino', '#f59e0b')
ON CONFLICT (slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist ON playlist_songs(playlist_id);
CREATE INDEX IF NOT EXISTS idx_queue_position ON queue_items(position);
CREATE INDEX IF NOT EXISTS idx_history_played_at ON playback_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_day ON scheduled_shows(day_of_week, start_time);

-- Vista útil para la app de usuarios (now playing en 1 query)
CREATE OR REPLACE VIEW now_playing AS
SELECT
  rs.playback_state,
  rs.is_live_dj,
  rs.current_dj_name,
  rs.current_show_name,
  s.id AS song_id,
  s.title,
  s.artist,
  s.album,
  s.cover_url,
  s.duration,
  ss.status AS stream_status,
  ss.listeners,
  ss.peak_listeners
FROM radio_settings rs
LEFT JOIN songs s ON s.id = rs.current_song_id
CROSS JOIN stream_stats ss
WHERE rs.id = 'default' AND ss.id = 'default';
