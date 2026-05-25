-- Ejecutar en MatuDB si ya tenías el schema anterior
ALTER TABLE radio_settings
  ADD COLUMN IF NOT EXISTS repeat_mode TEXT DEFAULT 'off';

UPDATE radio_settings SET repeat_mode = 'off' WHERE repeat_mode IS NULL;
