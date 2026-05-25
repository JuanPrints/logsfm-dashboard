# LogsFM — Inicio rápido del stream

Referencia de una página. Guía completa: [APP-STREAM.md](./APP-STREAM.md).

---

## URLs

| Qué | URL |
|-----|-----|
| Audio en vivo | `https://stream.logsfm.com/stream` |
| API metadata | `https://api.logsfm.com/api/now-playing` |
| Admin (DJ) | `https://admin.logsfm.com` |
| Estado Icecast | `https://stream.logsfm.com/status-json.xsl` |

---

## Que suene (checklist)

### Servidor

- [ ] `systemctl status icecast2` → active
- [ ] `.env` → `ICECAST_PASSWORD` = `source-password` en `/etc/icecast2/icecast.xml`
- [ ] `ffmpeg -version` funciona
- [ ] `pm2 status logsfm-dashboard` → online
- [ ] `pm2 logs` muestra `Radio engine iniciado`

### Admin

- [ ] MP3 subidos en `/admin/songs`
- [ ] Playlist creada con canciones
- [ ] Consola DJ → **Cargar y Play** o **Cargar cola** + **▶ Play**
- [ ] Header: `Stream: online`

### Verificación

- [ ] `status-json.xsl` → `"server_name"` = **título de la canción** (no solo "LogsFM")
- [ ] `https://stream.logsfm.com/stream` → se oye audio
- [ ] `curl api.logsfm.com/api/now-playing` → `"playback":"playing"`, `"name":"..."`

### Si no suena

1. Admin → **Stop** → esperar 2 s → **Play**
2. Abrir stream en **pestaña nueva**
3. `pm2 logs logsfm-dashboard --lines 50` → buscar `[Pipeline] → música:`

### Errores EPIPE / PM2 reiniciando mucho

| Log | Qué hacer |
|-----|-----------|
| `write EPIPE` / `uncaughtException` | Actualiza código y `pm2 restart logsfm-dashboard` (versión con pipeline seguro) |
| `[Pipeline] Encoder cerrado code=224` | Icecast cerró la fuente; el watchdog remonta en ~60 s o pulsa **Play** |
| `logsfm-dashboard` con muchos **↺** | No uses `pm2 restart all`; revisa `pm2 logs` tras deploy |

Logs sanos: una línea `[Pipeline] Conectando encoder` al arrancar, luego `[Pipeline] → música:` al cambiar pista **sin** ráfagas cada segundo.

---

## Tu app oyente (mínimo)

```html
<audio id="player" src="https://stream.logsfm.com/stream" controls></audio>
<button onclick="document.getElementById('player').play()">Escuchar</button>
```

```javascript
const API = "https://api.logsfm.com";

async function updateUI() {
  const { data } = await fetch(`${API}/api/now-playing`).then(r => r.json());
  // Texto grande: nombre de canción o programa
  document.getElementById("title").textContent = data.name;
  // Texto pequeño: artista o emisora
  document.getElementById("subtitle").textContent = data.subtitle;
  // Badge: "En vivo · La Vida Es Así"
  document.getElementById("badge").textContent = data.display.badge;
}

updateUI();
setInterval(updateUI, 5000);
```

### Campos API para UI

| Mostrar | Campo |
|---------|-------|
| Título grande | `data.name` |
| Subtítulo | `data.subtitle` |
| "En vivo · …" | `data.display.badge` |
| Artista (puede ser null) | `data.song?.artist` |

---

## Stream continuo (no se corta entre canciones)

Desde la última versión, **un solo encoder** permanece conectado a Icecast. Al cambiar de canción solo se cambia el decoder interno — los oyentes **no deberían ver el reproductor en 0:00** ni quedarse mudos por reconexión.

Si el stream se cae, el watchdog lo remonta en ~60 s.

---

## Repetir canciones / playlist

En la consola DJ:

| Botón | Modo |
|-------|------|
| **Repeat** (cicla) | Apagado → Repetir playlist (∞) → Repetir 1 canción |
| **↺** (flecha circular) | Repetir canción actual ahora |
| **▶** en cola | Reproducir esa canción ya |

Cuando termina la playlist con modo **∞**, la cola se recarga sola y sigue en vivo.

En MatuDB (una vez):

```sql
ALTER TABLE radio_settings ADD COLUMN IF NOT EXISTS repeat_mode TEXT DEFAULT 'off';
```

---

## Deploy de cambios

```bash
cd ~/apps/logsfm-dashboard
git pull origin master
npm run build
pm2 restart logsfm-dashboard
pm2 logs logsfm-dashboard --lines 80
```

**No uses `pm2 restart all`** — solo `pm2 restart logsfm-dashboard` para no tumbar otros procesos.

### Checklist post-deploy

- [ ] `pm2 list` → `logsfm-dashboard` online, **↺** no sube solo
- [ ] Cargar y Play → título visible en consola DJ
- [ ] Stop → oyente oye silencio, UI en stopped
- [ ] Next → cambia canción en admin e Icecast `server_name`
- [ ] Fin de canción → siguiente o silencio, sin bucle de errores en logs

### SQL opcional (volumen persistido)

```sql
-- scripts/add-music-volume.sql
ALTER TABLE radio_settings ADD COLUMN IF NOT EXISTS music_volume INTEGER DEFAULT 85;
```
