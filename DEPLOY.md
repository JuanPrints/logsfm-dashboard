# Despliegue LogsFM en logsfm.com

Guía completa para producción: panel admin, API pública, streaming e inicio de la radio.

## Arquitectura de subdominios

```
logsfm.com              → App pública de oyentes (tu otra app)
admin.logsfm.com        → Panel DJ / AutoDJ (este proyecto)
api.logsfm.com          → REST API para la app de usuarios
stream.logsfm.com       → Audio en vivo (Icecast)
db.matudb.com           → MatuDB (ya lo tienes configurado)
```

Todo el backend de radio (Next.js + radio engine) corre en **un solo servidor** en el puerto `3000`. Nginx enruta por subdominio.

---

## 1. Tablas Realtime en MatuDB

En el panel de MatuDB, activa **Realtime** en estas tablas:

| Tabla | Eventos | Para qué |
|-------|---------|----------|
| `radio_settings` | `*` | Now playing, play/pause, live DJ |
| `stream_stats` | `*` | Oyentes en vivo, estado online |
| `queue_items` | `*` | Cola de reproducción |
| `playback_history` | `INSERT` | Historial de canciones |

Opcional (solo admin): `playlists`, `songs`, `scheduled_shows`

### Suscripción en la app de usuarios

```typescript
import { createClient } from "@devjuanes/matuclient";

const db = createClient({
  url: "https://db.matudb.com",
  projectId: "TU_PROJECT_ID",
  apiKey: "TU_API_KEY",
});

// Realtime — sin Socket.io propio
db.channel("logsfm-live")
  .on("postgres_changes", { event: "*", schema: "public", table: "radio_settings" }, () => {
    fetch("https://api.logsfm.com/now-playing").then(r => r.json()).then(updateUI);
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "stream_stats" }, () => {
    fetch("https://api.logsfm.com/listeners").then(r => r.json()).then(updateListeners);
  })
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "playback_history" }, () => {
    fetch("https://api.logsfm.com/history").then(r => r.json()).then(updateHistory);
  })
  .subscribe();
```

También puedes usar REST polling sin Realtime, pero con MatuDB Realtime la app reacciona al instante.

---

## 2. SQL Schema

Ejecuta el archivo completo en MatuDB:

```
lib/db/schema.sql
```

Desde el panel MatuDB → SQL Editor, o:

```bash
# Si tienes acceso directo a PostgreSQL del proyecto
psql $DATABASE_URL -f lib/db/schema.sql
```

---

## 3. Preparar el servidor (Ubuntu 22/24)

### Requisitos

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# FFmpeg (obligatorio para streaming)
sudo apt install -y ffmpeg

# Icecast (servidor de audio)
sudo apt install -y icecast2

# Nginx + Certbot SSL
sudo apt install -y nginx certbot python3-certbot-nginx

# PM2 (process manager)
sudo npm install -g pm2
```

### Configurar Icecast

Edita `/etc/icecast2/icecast.xml`:

```xml
<hostname>stream.logsfm.com</hostname>
<listen-socket>
  <port>8000</port>
</listen-socket>
<mount>
  <mount-name>/stream</mount-name>
  <bitrate>128</bitrate>
</mount>
```

```bash
sudo systemctl enable icecast2
sudo systemctl start icecast2
```

El stream quedará en: `http://stream.logsfm.com:8000/stream`

---

## 4. Subir el proyecto al servidor

```bash
# En tu máquina local
git push origin main

# En el servidor
cd /var/www
sudo git clone https://github.com/TU_USUARIO/logsfm.git
cd logsfm
npm install
npm run build
```

### Variables de entorno en producción

Crea `/var/www/logsfm/.env`:

```env
# MatuDB
MATUDB_URL=https://db.matudb.com
MATUDB_PROJECT_ID=25e99afa-2a74-429d-ba95-76fb9431e743
MATUDB_API_KEY=tu_api_key
MATUDB_USE_SUPABASE=false

NEXT_PUBLIC_MATUDB_URL=https://db.matudb.com
NEXT_PUBLIC_MATUDB_PROJECT_ID=25e99afa-2a74-429d-ba95-76fb9431e743
NEXT_PUBLIC_MATUDB_API_KEY=tu_api_key

# App
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Icecast (localhost porque corre en el mismo servidor)
ICECAST_HOST=127.0.0.1
ICECAST_PORT=8000
ICECAST_PASSWORD=tu_password_icecast
ICECAST_MOUNT=/stream
ICECAST_BITRATE=128
```

---

## 5. Nginx — subdominios

Crea `/etc/nginx/sites-available/logsfm`:

```nginx
# ── Panel Admin ──
server {
    listen 443 ssl http2;
    server_name admin.logsfm.com;

    ssl_certificate     /etc/letsencrypt/live/logsfm.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/logsfm.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# ── API pública (app de usuarios) ──
server {
    listen 443 ssl http2;
    server_name api.logsfm.com;

    ssl_certificate     /etc/letsencrypt/live/logsfm.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/logsfm.com/privkey.pem;

    # Solo expone endpoints REST
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Opcional: bloquear rutas admin
        if ($request_uri ~* "^/admin") {
            return 403;
        }
    }

    # CORS para tu app de oyentes
    add_header Access-Control-Allow-Origin "https://logsfm.com" always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
}

# ── Stream de audio Icecast ──
server {
    listen 443 ssl http2;
    server_name stream.logsfm.com;

    ssl_certificate     /etc/letsencrypt/live/logsfm.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/logsfm.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;

        # Importante para streaming
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/logsfm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### DNS (en tu registrador)

| Registro | Tipo | Valor |
|----------|------|-------|
| `admin` | A | IP de tu servidor |
| `api` | A | IP de tu servidor |
| `stream` | A | IP de tu servidor |
| `@` | A | IP de tu servidor |

### SSL

```bash
sudo certbot --nginx -d logsfm.com -d admin.logsfm.com -d api.logsfm.com -d stream.logsfm.com
```

---

## 6. Iniciar con PM2

```bash
cd /var/www/logsfm
pm2 start npm --name "logsfm" -- start
pm2 save
pm2 startup
```

Ver logs:

```bash
pm2 logs logsfm
```

---

## 7. Cómo iniciar la radio (paso a paso)

### Primera vez

1. **Ejecuta el schema SQL** en MatuDB (`lib/db/schema.sql`)
2. **Activa Realtime** en las 4 tablas listadas arriba
3. **Verifica Icecast** está corriendo: `curl http://127.0.0.1:8000/status-json.xsl`
4. **Verifica FFmpeg**: `ffmpeg -version`
5. **Inicia la app**: `pm2 start logsfm`

### Operación diaria (desde admin.logsfm.com)

```
1. /admin/songs      → Sube MP3s
2. /admin/playlists  → Crea playlist y agrégale canciones
3. /admin/playlists  → Click ▶ Activar (carga la cola)
4. /admin            → Click ▶ Play
```

FFmpeg toma la primera canción de la cola y la envía a Icecast.
MatuDB Realtime notifica a la app de usuarios al instante.

### AutoDJ + programación

```
1. /admin/schedule   → Programa shows (día, hora, playlist)
2. Dashboard         → Activa AutoDJ (⚡)
```

El engine carga automáticamente la playlist del show activo.

### Live DJ

```
1. /admin/live       → "Ir en vivo"
2. Activa micrófono  → Mezcla voz con música
3. "Detener"         → Vuelve a AutoDJ
```

---

## 8. API para tu app de usuarios

Base URL: `https://api.logsfm.com`

| Endpoint | Respuesta |
|----------|-----------|
| `GET /api/now-playing` | Canción actual + metadata |
| `GET /api/listeners` | `{ current, peak, status }` |
| `GET /api/history?limit=20` | Últimas canciones |
| `GET /api/current-show` | Show activo |
| `GET /api/queue` | Cola actual |
| `GET /api/playlists` | Listado de playlists |

Stream de audio: `https://stream.logsfm.com/stream`

### Ejemplo fetch en tu app

```typescript
const API = "https://api.logsfm.com";

export async function getNowPlaying() {
  const res = await fetch(`${API}/api/now-playing`);
  return res.json();
}

export async function getListeners() {
  const res = await fetch(`${API}/api/listeners`);
  return res.json();
}
```

---

## 9. Checklist de producción

- [ ] Schema SQL ejecutado en MatuDB
- [ ] Realtime activado en 4 tablas
- [ ] `.env` configurado en servidor
- [ ] Icecast corriendo (`systemctl status icecast2`)
- [ ] FFmpeg instalado
- [ ] DNS apuntando (admin, api, stream)
- [ ] SSL con Certbot
- [ ] PM2 corriendo (`pm2 status`)
- [ ] Play ▶ desde admin.logsfm.com funciona
- [ ] App usuarios recibe updates Realtime

---

## Troubleshooting

**Stream offline**
→ Revisa Icecast: `sudo journalctl -u icecast2 -f`
→ Revisa password en `.env` vs `icecast.xml`

**FFmpeg error**
→ `pm2 logs logsfm` — busca "Connection refused"
→ Verifica que el archivo MP3 existe en MatuDB Storage

**Realtime no actualiza**
→ Confirma que la tabla tiene Realtime ON en MatuDB
→ Revisa `NEXT_PUBLIC_MATUDB_*` en build (rebuild después de cambiar)

**Oyentes en 0**
→ Icecast debe estar online y alguien conectado al stream
→ El engine hace poll cada 10s a `status-json.xsl`
