# LogsFM — Radio Console

Panel administrativo fullstack para administrar una radio online (AutoDJ / DJ Console).

**No incluye app pública para oyentes** — solo panel admin, API y radio engine.

## Stack

- Next.js 16 + TypeScript
- TailwindCSS 4
- **MatuDB** (`@devjuanes/matuclient`) — base de datos sin ORM
- Socket.io — tiempo real
- FFmpeg — streaming de audio
- Icecast — servidor de streaming
- Zustand — estado del cliente

## Requisitos

- Node.js 20+
- MatuDB server corriendo ([matu-db-api](https://github.com/DevJuanes/matu-db-api))
- FFmpeg instalado en PATH
- Icecast 2.x (opcional para streaming real)

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` con tus credenciales de MatuDB.

### 3. Crear tablas en MatuDB

Ejecuta el schema SQL en tu instancia MatuDB:

```bash
# Contenido en lib/db/schema.sql
```

Puedes usar `db.rpc()` desde MatuDB o ejecutar directamente en PostgreSQL.

### 4. Iniciar la aplicación

```bash
npm run dev
```

Esto levanta:
- **Next.js** en `http://localhost:3000`
- **Socket.io** en `http://localhost:3001`

## Panel Admin

| Ruta | Descripción |
|------|-------------|
| `/admin` | Dashboard DJ — play/pause/next, cola, oyentes |
| `/admin/playlists` | CRUD playlists, activar, cargar cola |
| `/admin/songs` | Upload MP3 con metadata automática |
| `/admin/schedule` | Programación de shows |
| `/admin/live` | Modo DJ en vivo con micrófono |

## API pública (para app consumidora)

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/now-playing` | Canción actual |
| `GET /api/history?limit=50` | Historial de reproducción |
| `GET /api/listeners` | Oyentes en vivo |
| `GET /api/current-show` | Show activo |
| `GET /api/queue` | Cola de reproducción |
| `GET /api/playlists` | Listado de playlists |
| `GET /api/playlists?id=UUID` | Playlist con canciones |

Guía para integrar el stream en tu app de oyentes: **[docs/APP-STREAM.md](./docs/APP-STREAM.md)** (completa) · **[docs/STREAM-QUICKSTART.md](./docs/STREAM-QUICKSTART.md)** (inicio rápido)

## Realtime (MatuDB — sin Socket.io propio)

MatuDB ya incluye Socket.io. Activa Realtime en estas tablas:

- `radio_settings`, `stream_stats`, `queue_items`, `playback_history`

Ver `lib/db/realtime-config.ts` y `DEPLOY.md` para despliegue completo en **logsfm.com**.

## Despliegue

Guía completa: **[DEPLOY.md](./DEPLOY.md)**

Subdominios recomendados:
- `admin.logsfm.com` — panel DJ
- `api.logsfm.com` — API para app de usuarios
- `stream.logsfm.com` — audio Icecast

## MatuDB

Este proyecto usa `@devjuanes/matuclient` directamente, sin ORM.

```typescript
import { getMatuClient } from "@/lib/db/matu";

const db = getMatuClient();
const { data } = await db.from("songs").select("*");
```

Storage para MP3 y covers:

```typescript
await db.storage.upload("songs/track.mp3", fileBuffer);
```

Ver [Matudb.md](./Matudb.md) para la referencia completa del cliente.

## Estructura

```
app/
  admin/          # Panel administrativo
  api/            # REST API pública + admin
lib/
  db/             # Repositorios MatuDB + schema.sql
  radio-engine/   # FFmpeg + Icecast
  store/          # Zustand
server/
  index.ts        # Custom server (Next.js + Socket.io)
components/
  admin/          # UI components
```
