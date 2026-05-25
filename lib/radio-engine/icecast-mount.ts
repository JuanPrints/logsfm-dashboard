function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type IcecastMountInfo = {
  host: string;
  port: string;
  mount: string;
};

function normalizeMount(mount: string) {
  return mount.startsWith("/") ? mount : `/${mount}`;
}

/** True si el mount no tiene fuente activa en status-json. */
export async function isMountFree(info: IcecastMountInfo): Promise<boolean> {
  const mount = normalizeMount(info.mount);
  try {
    const res = await fetch(
      `http://${info.host}:${info.port}/status-json.xsl`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return true;
    const json = await res.json();
    const source = json?.icestats?.source;
    const sources = Array.isArray(source) ? source : source ? [source] : [];
    const active = sources.some((s: { listenurl?: string; server_name?: string }) => {
      const url = String(s.listenurl ?? "");
      return url.includes(mount) || url.endsWith(mount.replace(/^\//, ""));
    });
    return !active;
  } catch {
    return true;
  }
}

/** Espera a que Icecast libere el mount (otra fuente desconectada). */
export async function waitMountFree(
  info: IcecastMountInfo,
  maxWaitMs = 8000,
): Promise<void> {
  const step = 500;
  let waited = 0;
  while (waited < maxWaitMs) {
    if (await isMountFree(info)) return;
    await sleep(step);
    waited += step;
  }
  console.warn(
    `[Icecast] Mount ${info.mount} sigue ocupado tras ${maxWaitMs}ms — conectando igual`,
  );
}

export function icecastSourceGapMs() {
  const n = parseInt(process.env.ICECAST_SOURCE_GAP_MS ?? "2500", 10);
  return Number.isFinite(n) && n >= 0 ? n : 2500;
}

export function logIcecastTarget(info: IcecastMountInfo) {
  const mount = normalizeMount(info.mount);
  console.log(
    `[Icecast] Fuente → http://${info.host}:${info.port}${mount} (revisa ICECAST_PASSWORD en .env)`,
  );
}
