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
  try {
    const engine = getRadioEngine();
    await engine.init();
    console.log("> Radio engine iniciado (pipeline PCM → Icecast)");
  } catch (err) {
    console.error("[RadioEngine] Error en init, reintento en 15s:", err);
    setTimeout(() => startRadioEngine(), 15_000);
    return;
  }

  const engine = getRadioEngine();
  setInterval(() => {
    engine.ensureMountAlive().catch((e) => console.error("[Watchdog]", e));
  }, 60_000);

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
          engine.setListeners(parseInt(String(match.listeners), 10));
        }
        engine.syncIcecastStatus(Boolean(match), true);
      } else {
        engine.syncIcecastStatus(false, false);
      }
    } catch {
      engine.syncIcecastStatus(false, false);
    }
  }, 10000);
}

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();
  startRadioEngine();

  process.on("unhandledRejection", (err) => {
    console.error("[unhandledRejection]", err);
  });

  process.on("uncaughtException", (err) => {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EPIPE" || code === "ECONNRESET") {
      console.warn("[uncaughtException] pipe roto (ignorado):", code);
      return;
    }
    console.error("[uncaughtException]", err);
  });

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
