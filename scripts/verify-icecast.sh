#!/usr/bin/env bash
# Verifica Icecast + contraseña de fuente (ejecutar en el VPS dentro del proyecto)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

HOST="${ICECAST_HOST:-127.0.0.1}"
PORT="${ICECAST_PORT:-8000}"
MOUNT="${ICECAST_MOUNT:-/stream}"
PASS="${ICECAST_PASSWORD:-hackme}"
FFMPEG="${FFMPEG_PATH:-/usr/bin/ffmpeg}"

echo "==> Icecast status"
curl -sf "http://${HOST}:${PORT}/status-json.xsl" | head -c 2000 || echo "NO RESPONDE — systemctl status icecast2"

echo ""
echo "==> Contraseña en icecast.xml (debe coincidir con ICECAST_PASSWORD en .env)"
grep -E 'source-password|hostname|listen-socket' /etc/icecast2/icecast.xml 2>/dev/null || echo "No se pudo leer icecast.xml"

echo ""
echo "==> Prueba FFmpeg → mount (5 s de silencio)"
timeout 6 "$FFMPEG" -hide_banner -loglevel warning \
  -re -f lavfi -i anullsrc=r=44100:cl=stereo \
  -acodec libmp3lame -b:a 128k -f mp3 -content_type audio/mpeg \
  -ice_name "LogsFM Test" -legacy_icecast 1 \
  "icecast://source:${PASS}@${HOST}:${PORT}${MOUNT}" || true

echo ""
echo "==> Mount tras prueba"
curl -sf "http://${HOST}:${PORT}/status-json.xsl" | grep -o '"server_name":"[^"]*"' | head -3 || true

echo ""
echo "Si ves 401/403 en FFmpeg, corrige ICECAST_PASSWORD en .env y reinicia: pm2 restart logsfm-dashboard --update-env"
