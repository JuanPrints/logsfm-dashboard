#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/root/apps/logsfm-dashboard"
PORT=3020

echo "==> LogsFM Dashboard — Deploy"
echo "    Directorio: $APP_DIR"

cd "$APP_DIR"

# Dependencias del sistema
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Instalando FFmpeg..."
  apt-get update -qq && apt-get install -y ffmpeg
fi
FFMPEG_BIN="$(command -v ffmpeg)"
echo "    FFmpeg: $FFMPEG_BIN"
command -v node >/dev/null 2>&1 || { echo "Instala Node.js 20+"; exit 1; }

# .env obligatorio
if [ ! -f .env ]; then
  echo ""
  echo "ERROR: Crea .env antes de continuar"
  echo "  cp .env.example .env && nano .env"
  exit 1
fi

# PM2 no hereda PATH completo — fijar FFmpeg en .env
if grep -q '^FFMPEG_PATH=' .env; then
  sed -i "s|^FFMPEG_PATH=.*|FFMPEG_PATH=$FFMPEG_BIN|" .env
else
  echo "FFMPEG_PATH=$FFMPEG_BIN" >> .env
fi
echo "    .env FFMPEG_PATH=$FFMPEG_BIN"

mkdir -p logs

echo "==> git pull"
git pull origin master || git pull origin main

echo "==> npm install"
npm install

echo "==> npm run build"
export $(grep -v '^#' .env | xargs)
npm run build

echo "==> PM2"
if pm2 describe logsfm-dashboard >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save

echo ""
echo "==> Deploy completado"
echo "    App local:  http://127.0.0.1:$PORT"
echo "    Admin:      https://admin.logsfm.com"
echo "    API:        https://api.logsfm.com"
echo "    Stream:     https://stream.logsfm.com/stream"
echo ""
pm2 status logsfm-dashboard
