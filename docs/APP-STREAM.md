# LogsFM — Stream: cómo funciona e integración para apps oyentes

Guía completa: **arquitectura**, **pasos para que suene la radio**, **integración en tu app** (web/móvil), API y tiempo real.

> **¿Solo quieres que suene?** Ve directo a [Guía paso a paso: que suene la radio](#0-guía-paso-a-paso-que-suene-la-radio).

---

## URLs de producción

| Recurso | URL |
|---------|-----|
| **Stream de audio (MP3 en vivo)** | `https://stream.logsfm.com/stream` |
| **API pública** | `https://api.logsfm.com` |
| **Panel admin** (solo DJs) | `https://admin.logsfm.com` |

El stream es un mount Icecast en **MP3 128 kbps**. Funciona en `<audio>`, reproductores nativos, React Native, Flutter, etc.

---

## Índice

1. [Cómo funciona (arquitectura)](#0-cómo-funciona-arquitectura)
2. [Guía paso a paso: que suene la radio](#0-guía-paso-a-paso-que-suene-la-radio)
3. [Reproducir el audio en tu app](#1-reproducir-el-audio-lo-mínimo)
4. [API REST — metadata para la UI](#2-api-rest--metadata-para-la-ui)
5. [Cliente TypeScript](#3-cliente-typescript-listo-para-copiar)
6. [Hook React](#4-hook-react--reproductor--now-playing)
7. [Tiempo real con MatuDB](#5-tiempo-real-con-matudb-recomendado)
8. [CORS](#6-cors--importante-si-tu-app-está-en-otro-dominio)
9. [Flujo recomendado](#7-flujo-recomendado-en-tu-app)
10. [Problemas frecuentes](#8-problemas-frecuentes)
11. [Ejemplo HTML completo](#9-ejemplo-mínimo-completo-una-sola-página)
12. [Resumen rápido](#10-resumen-rápido)

---

## 0. Cómo funciona (arquitectura)

LogsFM separa **tres capas** que deben estar activas para que los oyentes escuchen música:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────┐     ┌────────────────────────┐
│  admin.logsfm   │     │  Radio Engine    │     │ Icecast │     │  stream.logsfm.com     │
│  (Consola DJ)   │────▶│  Node.js + PM2   │────▶│  :8000  │────▶│  /stream  (MP3 vivo)   │
│  Play / Pause   │     │  FFmpeg          │     │         │     │                        │
└─────────────────┘     └────────┬─────────┘     └─────────┘     └───────────┬────────────┘
                                   │                                            │
                                   ▼                                            ▼
                          ┌────────────────┐                          ┌─────────────────┐
                          │    MatuDB      │                          │  App oyentes    │
                          │ now playing,   │◀── api.logsfm.com ───────│  <audio> / Expo │
                          │ oyentes, cola  │                          │  React Native   │
                          └────────────────┘                          └─────────────────┘
```

### Componentes

| Pieza | Qué hace | Dónde corre |
|-------|----------|-------------|
| **Consola DJ** | Subes MP3, creas playlists, pulsas Play | `admin.logsfm.com` |
| **Radio Engine** | Lee el MP3 con FFmpeg y lo envía a Icecast | Servidor VPS (PM2, puerto 3020) |
| **Icecast** | Recibe el audio y lo reparte a oyentes | Servidor VPS (puerto 8000) |
| **Nginx** | Expone HTTPS del stream | `stream.logsfm.com` → Icecast |
| **API pública** | Devuelve nombre de canción, oyentes, etc. | `api.logsfm.com` |
| **MatuDB** | Guarda estado y emite cambios en tiempo real | `db.matudb.com` |

### Dos modos del stream

El engine mantiene el mount **siempre conectado**:

| Modo | Cuándo | Qué oyen los usuarios |
|------|--------|------------------------|
| **Silencio** | Pausa, stop, sin canción, arranque del servidor | Stream online pero **sin música** (silencio) |
| **Música** | Play activo con canción en cola | **La canción en vivo** |

> **Importante:** El admin puede mostrar "EN AIRE" pero si Icecast está en modo silencio, el reproductor avanza el tiempo y no se oye nada. Ver [verificación](#verificar-que-realmente-suena-música) abajo.

### Qué NO detiene la emisión

- Recargar `admin.logsfm.com` — el engine sigue en el servidor (PM2).
- Cerrar el navegador del DJ — la radio sigue emitiendo.
- Oyentes conectados/desconectados — no afecta al source.

### Qué SÍ cambia el audio

- **Play** → FFmpeg emite la canción actual.
- **Pause / Stop** → FFmpeg emite silencio (mount sigue online).
- **Siguiente canción** → FFmpeg cambia al siguiente MP3 automáticamente.

---

## 0. Guía paso a paso: que suene la radio

### A. Configuración del servidor (una sola vez)

#### 1. Icecast instalado y corriendo

```bash
sudo systemctl status icecast2
sudo systemctl enable icecast2
sudo systemctl start icecast2
```

#### 2. Variables en `.env` del proyecto

En `~/apps/logsfm-dashboard/.env`:

```env
PORT=3020
ICECAST_HOST=127.0.0.1
ICECAST_PORT=8000
ICECAST_MOUNT=/stream
ICECAST_PASSWORD=tu_source_password_aqui
ICECAST_BITRATE=128

MATUDB_URL=https://db.matudb.com
MATUDB_PROJECT_ID=tu-project-id
MATUDB_API_KEY=tu-api-key
```

**Crítico:** `ICECAST_PASSWORD` debe ser **idéntico** a `<source-password>` en `/etc/icecast2/icecast.xml`.

#### 3. FFmpeg instalado

```bash
ffmpeg -version
# Si falta: sudo apt install -y ffmpeg
```

#### 4. App corriendo con PM2

```bash
cd ~/apps/logsfm-dashboard
git pull origin master
npm install
npm run build
pm2 restart logsfm-dashboard
pm2 logs logsfm-dashboard --lines 20
```

Debes ver: `Radio engine iniciado` y `LogsFM en http://0.0.0.0:3020`.

#### 5. Nginx para el stream

El archivo `deploy/nginx-logsfm.conf` debe estar activo. El bloque `stream.logsfm.com` hace proxy a `127.0.0.1:8000`.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

### B. Emitir música desde el admin (cada sesión)

1. Entra a **https://admin.logsfm.com**
2. **Sube canciones** → `/admin/songs` → MP3
3. **Crea una playlist** → `/admin/playlists` → agrega canciones
4. En la **Consola DJ**:
   - Selecciona la playlist
   - Pulsa **「Cargar cola」** o **「Cargar y Play」**
   - Pulsa **▶ Play**
5. Verifica en el header: **Stream: online** y barra de progreso avanzando

Si no suena después de Play:

1. Pulsa **■ Stop**
2. Espera 2 segundos
3. Pulsa **▶ Play** de nuevo

---

### C. Verificar que realmente suena música

#### Test 1 — Icecast metadata

Abre en el navegador:

```
https://stream.logsfm.com/status-json.xsl
```

Busca `"server_name"`:

| Valor | Significado |
|-------|-------------|
| `"La Vida Es Así"` (título de canción) | ✅ Música en vivo |
| `"LogsFM"` solamente | ⚠️ Silencio — pulsa Stop + Play en admin |

#### Test 2 — Escuchar directo

```
https://stream.logsfm.com/stream
```

Pulsa play en el reproductor del navegador. Debes oír la canción.

> Usa **pestaña nueva** o URL con cache-bust si ya tenías la pestaña abierta:
> `https://stream.logsfm.com/stream?t=2`

#### Test 3 — Logs del engine

```bash
pm2 logs logsfm-dashboard --lines 50
```

Busca líneas como:

```
[FFmpeg] → music: La Vida Es Así ← /root/apps/logsfm-dashboard/uploads/songs/...
[RadioEngine] Stream música: La Vida Es Así ← ...
```

Si ves `[FFmpeg] → silence` mientras el admin está en Play, hay desincronización — Stop + Play lo corrige.

#### Test 4 — API

```bash
curl https://api.logsfm.com/api/now-playing
```

Debe devolver `"playback": "playing"` y `"name": "Título de la canción"`.

---

### D. Integrar en tu app de oyentes (resumen)

```typescript
// 1. Audio en vivo
const STREAM = "https://stream.logsfm.com/stream";
audio.src = STREAM;
await audio.play();

// 2. Nombre de canción para la UI
const res = await fetch("https://api.logsfm.com/api/now-playing");
const { data } = await res.json();
document.title = data.name;           // "La Vida Es Así"
document.subtitle = data.subtitle;    // "LogsFM" o artista
document.badge = data.display.badge;  // "En vivo · La Vida Es Así"
```

**No uses `data.artist` como título** — puede ser `null`. Usa siempre **`data.name`**.

Detalle completo en las secciones siguientes.

---

## 1. Reproducir el audio (lo mínimo)

### Web — HTML

```html
<audio
  id="logsfm-player"
  src="https://stream.logsfm.com/stream"
  controls
  preload="none"
  crossorigin="anonymous"
></audio>

<script>
  const player = document.getElementById("logsfm-player");

  // El usuario debe pulsar play (política de autoplay del navegador)
  player.play().catch(() => {
    console.log("Pulsa play para escuchar");
  });
</script>
```

### Web — React

```tsx
"use client";

import { useRef } from "react";

const STREAM_URL = "https://stream.logsfm.com/stream";

export function RadioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);

  const play = async () => {
    try {
      await audioRef.current?.play();
    } catch {
      alert("Pulsa play para iniciar la radio");
    }
  };

  return (
    <div>
      <audio ref={audioRef} src={STREAM_URL} preload="none" crossOrigin="anonymous" />
      <button type="button" onClick={play}>▶ Escuchar LogsFM</button>
    </div>
  );
}
```

### React Native (Expo)

```bash
npx expo install expo-av
```

```tsx
import { Audio } from "expo-av";
import { useEffect, useState } from "react";
import { Button } from "react-native";

const STREAM_URL = "https://stream.logsfm.com/stream";

export function RadioPlayer() {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      sound?.unloadAsync();
    };
  }, [sound]);

  const toggle = async () => {
    if (playing && sound) {
      await sound.stopAsync();
      setPlaying(false);
      return;
    }

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });

    const { sound: s } = await Audio.Sound.createAsync(
      { uri: STREAM_URL },
      { shouldPlay: true },
    );
    setSound(s);
    setPlaying(true);
  };

  return <Button title={playing ? "Detener" : "Escuchar LogsFM"} onPress={toggle} />;
}
```

### iOS / Android nativo

Usa la URL del stream directamente en tu reproductor de streaming (AVPlayer, ExoPlayer, etc.):

```
https://stream.logsfm.com/stream
Content-Type: audio/mpeg
```

---

## 2. API REST — metadata para la UI

Base: `https://api.logsfm.com`

Todas las respuestas siguen este formato:

```json
{ "success": true, "data": { ... } }
```

En error:

```json
{ "success": false, "error": "mensaje" }
```

### `GET /api/now-playing` o `GET /api/broadcast`

Estado de emisión con **textos listos para mostrar en tu app** (nombre de canción, programa, badge "En vivo · …").

```bash
curl https://api.logsfm.com/api/now-playing
# equivalente:
curl https://api.logsfm.com/api/broadcast
```

```json
{
  "success": true,
  "data": {
    "playback": "playing",
    "isLive": false,
    "programName": null,
    "programDj": null,
    "stream": {
      "status": "online",
      "listeners": 3,
      "peakListeners": 4
    },
    "display": {
      "headline": "La Vida Es Así",
      "subline": "LogsFM",
      "badge": "En vivo · La Vida Es Así"
    },
    "name": "La Vida Es Así",
    "subtitle": "LogsFM",
    "song": {
      "id": "90255be8-6d39-4586-aa37-3810230d74b1",
      "title": "La Vida Es Así",
      "artist": null,
      "coverUrl": null,
      "duration": 155,
      "elapsed": 42,
      "startedAt": "2026-05-25T06:01:16.265Z"
    },
    "id": "90255be8-6d39-4586-aa37-3810230d74b1",
    "title": "La Vida Es Así",
    "artist": null,
    "duration": 155,
    "elapsed": 42,
    "startedAt": "2026-05-25T06:01:16.265Z"
  }
}
```

#### Campos para tu UI (importante)

| Campo | Uso en la app |
|-------|----------------|
| **`data.name`** o **`data.display.headline`** | Texto grande — **título de la canción** o nombre del programa |
| **`data.subtitle`** o **`data.display.subline`** | Texto pequeño — artista, DJ o "LogsFM" |
| **`data.display.badge`** | Etiqueta compacta — `"En vivo · La Vida Es Así"` |
| **`data.programName`** | Nombre del programa en curso (si hay) |
| **`data.song`** | Objeto canción completo (`artist` es `null` si no hay artista, nunca `"Unknown"`) |

> **No uses `artist` como título principal.** Si el MP3 no traía artista, antes salía `"Unknown"`. Ahora usa **`name`** o **`display.headline`**.

Si no hay canción en aire, `song` es `null` y `name` muestra el programa o `"LogsFM"`.

**Tip:** Para que el tiempo avance en la UI sin pedir la API cada segundo, calcula `elapsed` en el cliente:

```typescript
function getLiveElapsed(nowPlaying: {
  startedAt: string;
  duration: number;
  elapsed: number;
}) {
  const started = new Date(nowPlaying.startedAt).getTime();
  const live = Math.floor((Date.now() - started) / 1000);
  return Math.min(live, nowPlaying.duration);
}
```

Actualiza la API cada **3–5 segundos** para corregir drift y detectar cambio de canción.

---

### `GET /api/listeners`

Oyentes conectados y estado del stream.

```json
{
  "success": true,
  "data": {
    "current": 2,
    "peak": 3,
    "status": "online"
  }
}
```

`status`: `"online"` | `"offline"` | `"connecting"` | `"error"`

---

### `GET /api/history?limit=20`

Últimas canciones reproducidas.

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "songId": "...",
      "title": "Canción anterior",
      "artist": "Artista",
      "coverUrl": null,
      "playedAt": "2026-05-25T05:55:00.000Z",
      "duration": 180
    }
  ]
}
```

---

### `GET /api/current-show`

Programa / show en curso.

```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "Mañanas LogsFM",
    "djName": "DJ Juan",
    "description": null,
    "startedAt": "2026-05-25T06:00:00.000Z",
    "isLive": false
  }
}
```

Si no hay show activo: `"data": null`.

---

### `GET /api/queue`

Cola de reproducción (próximas canciones).

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "songId": "...",
      "title": "Próxima canción",
      "artist": "Artista",
      "coverUrl": null,
      "duration": 200,
      "position": 0
    }
  ]
}
```

---

### `GET /api/playlists`

Listado de playlists públicas.

```bash
curl https://api.logsfm.com/api/playlists
```

Detalle de una playlist:

```bash
curl "https://api.logsfm.com/api/playlists?id=PLAYLIST_UUID"
```

---

## 3. Cliente TypeScript listo para copiar

```typescript
const API_BASE = "https://api.logsfm.com";
export const STREAM_URL = "https://stream.logsfm.com/stream";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "API error");
  return json.data as T;
}

export interface BroadcastDisplay {
  headline: string;
  subline: string;
  badge: string;
}

export interface BroadcastInfo {
  playback: "playing" | "paused" | "stopped";
  isLive: boolean;
  programName: string | null;
  programDj: string | null;
  name: string;
  subtitle: string;
  display: BroadcastDisplay;
  stream: { status: string; listeners: number; peakListeners: number };
  song: {
    id: string;
    title: string;
    artist: string | null;
    coverUrl?: string | null;
    duration: number;
    elapsed: number;
    startedAt: string;
  } | null;
}

export interface Listeners {
  current: number;
  peak: number;
  status: "online" | "offline" | "connecting" | "error";
}

export const logsfm = {
  streamUrl: STREAM_URL,
  getBroadcast: () => apiGet<BroadcastInfo>("/api/now-playing"),
  getListeners: () => apiGet<Listeners>("/api/listeners"),
  getHistory: (limit = 20) => apiGet<unknown[]>(`/api/history?limit=${limit}`),
  getCurrentShow: () => apiGet<unknown | null>("/api/current-show"),
  getQueue: () => apiGet<unknown[]>("/api/queue"),
  getPlaylists: () => apiGet<unknown[]>("/api/playlists"),
};
```

---

## 4. Hook React — reproductor + now playing

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logsfm, type BroadcastInfo } from "./logsfm-api";

export function useLogsfmRadio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [broadcast, setBroadcast] = useState<BroadcastInfo | null>(null);
  const [listeners, setListeners] = useState(0);
  const [streamStatus, setStreamStatus] = useState<string>("offline");

  const refresh = useCallback(async () => {
    const [info, ls] = await Promise.all([
      logsfm.getBroadcast(),
      logsfm.getListeners(),
    ]);
    setBroadcast(info);
    setListeners(ls.current);
    setStreamStatus(ls.status);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  // Reloj local del tiempo transcurrido
  useEffect(() => {
    if (!broadcast?.song) return;
    const tick = setInterval(() => {
      setBroadcast((current) => {
        if (!current?.song) return current;
        const elapsed = Math.min(
          Math.floor((Date.now() - new Date(current.song.startedAt).getTime()) / 1000),
          current.song.duration,
        );
        if (elapsed === current.song.elapsed) return current;
        return {
          ...current,
          song: { ...current.song, elapsed },
        };
      });
    }, 500);
    return () => clearInterval(tick);
  }, [broadcast?.song?.id, broadcast?.song?.startedAt]);

  const play = async () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(logsfm.streamUrl);
    }
    await audioRef.current.play();
    setPlaying(true);
  };

  const pause = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  return {
    playing,
    play,
    pause,
    broadcast,
    /** Texto grande para UI — título canción o programa */
    name: broadcast?.name ?? "LogsFM",
    /** Texto pequeño — artista o emisora */
    subtitle: broadcast?.subtitle ?? "",
    /** Badge compacto — "En vivo · ..." */
    badge: broadcast?.display.badge ?? "LogsFM",
    listeners,
    streamStatus,
  };
}
```

---

## 5. Tiempo real con MatuDB (recomendado)

En lugar de hacer polling constante, tu app puede suscribirse a cambios en la base de datos (now playing, oyentes, historial).

### Instalación

```bash
npm install @devjuanes/matuclient
```

### Variables de entorno en tu app

```env
NEXT_PUBLIC_MATUDB_URL=https://db.matudb.com
NEXT_PUBLIC_MATUDB_PROJECT_ID=25e99afa-2a74-429d-ba95-76fb9431e743
NEXT_PUBLIC_MATUDB_API_KEY=anon_xxxxxxxx
```

Usa la **API key anon/pública** del proyecto MatuDB (no la key de admin del servidor).

### Suscripción (copiar de `lib/db/realtime.ts`)

```typescript
import { createClient } from "@devjuanes/matuclient";

const db = createClient({
  url: process.env.NEXT_PUBLIC_MATUDB_URL!,
  projectId: process.env.NEXT_PUBLIC_MATUDB_PROJECT_ID!,
  apiKey: process.env.NEXT_PUBLIC_MATUDB_API_KEY!,
});

export function subscribeLogsfm(onChange: () => void) {
  const channel = db
    .channel("logsfm-consumer")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "radio_settings" },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "stream_stats" },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "playback_history" },
      () => onChange(),
    )
    .subscribe();

  return () => db.removeChannel(channel);
}
```

Uso:

```typescript
useEffect(() => {
  const unsubscribe = subscribeLogsfm(() => {
    refreshNowPlaying();
    refreshListeners();
  });
  return unsubscribe;
}, []);
```

**Tablas con Realtime activado en MatuDB:**

| Tabla | Para qué |
|-------|----------|
| `radio_settings` | Canción actual, play/pause, DJ en vivo |
| `stream_stats` | Oyentes, estado online/offline |
| `playback_history` | Nueva canción en historial |

---

## 6. CORS — importante si tu app está en otro dominio

La API (`api.logsfm.com`) tiene CORS configurado en nginx. Por defecto permite:

```
Access-Control-Allow-Origin: https://logsfm.com
```

Si tu app corre en **otro dominio** (ej. `https://app.logsfm.com`, `http://localhost:3000`), agrega ese origen en el servidor:

```nginx
# deploy/nginx-logsfm.conf — bloque api.logsfm.com
add_header Access-Control-Allow-Origin "https://TU-DOMINIO.com" always;
```

Para varios orígenes, usa un `map` en nginx o maneja CORS desde Next.js middleware.

El **stream de audio** (`stream.logsfm.com`) no requiere CORS para `<audio>` — el navegador lo reproduce directo.

---

## 7. Flujo recomendado en tu app

```
┌─────────────────────────────────────────────────────────┐
│  Pantalla Oyente                                        │
├─────────────────────────────────────────────────────────┤
│  1. <audio> o expo-av → stream.logsfm.com/stream        │
│  2. GET /api/now-playing  → título, artista, cover      │
│  3. GET /api/listeners    → "X oyentes en vivo"         │
│  4. MatuDB Realtime       → actualizar UI al instante   │
│  5. Reloj local           → barra de progreso suave     │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Problemas frecuentes

### El reproductor avanza pero no se oye nada

- **Causa habitual:** el mount de Icecast está en modo silencio aunque el admin muestre "playing". Verifica en `https://stream.logsfm.com/status-json.xsl` que `server_name` sea el **título de la canción**, no solo `"LogsFM"`.
- Recarga la pestaña del stream o usa URL con cache-bust: `https://stream.logsfm.com/stream?t=1`
- En admin: pulsa **Stop** y luego **Play** de nuevo para forzar remontaje de música.
- Revisa logs: `pm2 logs logsfm-dashboard --lines 80` — busca `[FFmpeg] → music:`

### El tiempo del stream vuelve a 0 al abrir la URL

- Normal en streams en vivo cuando el source se reconecta. Tras el fix del engine, debería mantenerse estable mientras suena música.

### Error CORS en fetch desde tu app

- Agrega el dominio de tu app en nginx (`api.logsfm.com`).
- O consume la API desde tu backend (server-side) y expón tus propios endpoints.

### `now-playing` devuelve `null`

- Normal si no hay canción en cola o la radio está en pausa/stop.
- El stream puede seguir **online** emitiendo silencio.

### Autoplay bloqueado en móvil/web

- Siempre muestra un botón **Escuchar** — el usuario debe interactuar antes de `play()`.

### Reconexión del stream

```typescript
audio.addEventListener("error", () => {
  setTimeout(() => {
    audio.src = "https://stream.logsfm.com/stream?t=" + Date.now();
    audio.play().catch(() => {});
  }, 3000);
});
```

---

## 9. Ejemplo mínimo completo (una sola página)

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>LogsFM</title>
  <style>
    body { font-family: system-ui; max-width: 420px; margin: 2rem auto; }
    button { padding: 0.75rem 1.5rem; font-size: 1rem; cursor: pointer; }
    .meta { margin-top: 1rem; }
    .progress { height: 6px; background: #eee; border-radius: 3px; margin-top: 0.5rem; }
    .progress > div { height: 100%; background: #6366f1; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>LogsFM</h1>
  <button id="play">▶ Escuchar en vivo</button>
  <p id="listeners"></p>
  <div class="meta">
    <strong id="title">—</strong>
    <div id="artist"></div>
    <div class="progress"><div id="bar"></div></div>
    <small id="time"></small>
  </div>

  <audio id="audio" preload="none" crossorigin="anonymous"></audio>

  <script>
    const API = "https://api.logsfm.com";
    const STREAM = "https://stream.logsfm.com/stream";
    const audio = document.getElementById("audio");
    let broadcast = null;

    document.getElementById("play").onclick = async () => {
      audio.src = STREAM;
      await audio.play();
    };

    async function refresh() {
      const [npRes, lsRes] = await Promise.all([
        fetch(API + "/api/now-playing").then(r => r.json()),
        fetch(API + "/api/listeners").then(r => r.json()),
      ]);
      broadcast = npRes.data;
      document.getElementById("listeners").textContent =
        broadcast.display.badge + " · " + lsRes.data.current + " oyentes";
      document.getElementById("title").textContent = broadcast.name;
      document.getElementById("artist").textContent = broadcast.subtitle;
    }

    function tick() {
      if (!broadcast?.song) return;
      const elapsed = Math.min(
        Math.floor((Date.now() - new Date(broadcast.song.startedAt)) / 1000),
        broadcast.song.duration
      );
      const pct = (elapsed / broadcast.song.duration) * 100;
      document.getElementById("bar").style.width = pct + "%";
      const fmt = s => Math.floor(s/60) + ":" + String(s%60).padStart(2,"0");
      document.getElementById("time").textContent = fmt(elapsed) + " / " + fmt(broadcast.song.duration);
    }

    refresh();
    setInterval(refresh, 5000);
    setInterval(tick, 500);
  </script>
</body>
</html>
```

---

## 10. Resumen rápido

| Necesitas | Usa |
|-----------|-----|
| Audio en vivo | `https://stream.logsfm.com/stream` |
| Nombre canción / programa (UI) | `data.name` o `data.display.headline` de `/api/now-playing` |
| Badge "En vivo · …" | `data.display.badge` |
| Artista / subtítulo | `data.subtitle` o `data.display.subline` |
| Oyentes en vivo | `GET https://api.logsfm.com/api/listeners` |
| Historial | `GET https://api.logsfm.com/api/history?limit=20` |
| Updates instantáneos | MatuDB Realtime en `radio_settings` + `stream_stats` |
| Admin / programación | `https://admin.logsfm.com` (no exponer a oyentes) |
