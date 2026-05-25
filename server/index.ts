import { loadEnvConfig } from "@next/env";
import { createServer } from "http";
import next from "next";
import { getRadioEngine } from "../lib/radio-engine";

// Cargar .env ANTES de leer PORT (fix producción con PM2)
loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);

async function startRadioEngine() {
  const engine = getRadioEngine();
  await engine.init();

  setInterval(async () => {
    try {
      const host = process.env.ICECAST_HOST ?? "localhost";
      const icePort = process.env.ICECAST_PORT ?? "8000";
      const mount = process.env.ICECAST_MOUNT ?? "/stream";
      const res = await fetch(`http://${host}:${icePort}/status-json.xsl`);
      if (res.ok) {
        const json = await res.json();
        const source = json?.icestats?.source;
        const sources = Array.isArray(source) ? source : source ? [source] : [];
        const match = sources.find(
          (s: { listenurl?: string; server_name?: string }) =>
            s.listenurl?.includes(mount) ||
            s.server_name?.includes(mount.replace("/", "")),
        );
        if (match?.listeners != null) {
          await engine.setListeners(parseInt(String(match.listeners), 10));
        }
        engine.syncIcecastStatus(Boolean(match), true);
      } else {
        engine.syncIcecastStatus(false, false);
      }
    } catch {
      engine.syncIcecastStatus(false, false);
    }
  }, 10000);

  console.log("> Radio engine iniciado (FFmpeg + Icecast → MatuDB Realtime)");
}

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();
  await startRadioEngine();

  createServer((req, res) => {
    handle(req, res);
  }).listen(port, hostname, () => {
    console.log(`> LogsFM en http://${hostname}:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
