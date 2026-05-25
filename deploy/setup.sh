#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/root/apps/logsfm-dashboard"
PORT=3020

echo "==> LogsFM Dashboard — Deploy"
echo "    Directorio: $APP_DIR"

cd "$APP_DIR"

# Dependencias del sistema
command -v ffmpeg >/dev/null 2>&1 || { echo "Instala FFmpeg: apt install -y ffmpeg"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Instala Node.js 20+"; exit 1; }

# .env obligatorio
if [ ! -f .env ]; then
  echo ""
  echo "ERROR: Crea .env antes de continuar"
  echo "  cp .env.example .env && nano .env"
  exit 1
fi

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
