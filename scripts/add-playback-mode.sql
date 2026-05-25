-- Modo de reproducción: playlist | manual | single
ALTER TABLE radio_settings ADD COLUMN IF NOT EXISTS playback_mode TEXT DEFAULT 'manual';
ALTER TABLE radio_settings ADD COLUMN IF NOT EXISTS active_playlist_id UUID REFERENCES playlists(id) ON DELETE SET NULL;
ALTER TABLE radio_settings ADD COLUMN IF NOT EXISTS music_volume INTEGER DEFAULT 85;
