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
3. `pm2 logs logsfm-dashboard --lines 50` → buscar `[FFmpeg] → music:`

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
```

**No uses `pm2 restart all`** — solo `pm2 restart logsfm-dashboard` para no tumbar otros procesos.
