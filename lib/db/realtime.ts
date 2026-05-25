"use client";

import { createBrowserMatuClient } from "@/lib/db/matu";
import { REALTIME_TABLES } from "@/lib/db/realtime-config";
import type { MatuDBClient } from "@devjuanes/matuclient";

type RefreshFn = () => void | Promise<void>;

/**
 * Suscripción MatuDB Realtime (Socket.io incluido en matuclient).
 * No necesitas un Socket.io propio — MatuDB emite cambios de PostgreSQL.
 */
export function subscribeToRadioRealtime(handlers: {
  onRadioSettings?: RefreshFn;
  onStreamStats?: RefreshFn;
  onQueue?: RefreshFn;
  onHistory?: RefreshFn;
}) {
  const db = createBrowserMatuClient();

  const channel = db
    .channel("logsfm-radio")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: REALTIME_TABLES.radioSettings },
      () => handlers.onRadioSettings?.(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: REALTIME_TABLES.streamStats },
      () => handlers.onStreamStats?.(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: REALTIME_TABLES.queue },
      () => handlers.onQueue?.(),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: REALTIME_TABLES.history },
      () => handlers.onHistory?.(),
    )
    .subscribe();

  return () => {
    db.removeChannel(channel);
  };
}

/** Ejemplo para la app pública de usuarios (copiar a tu app oyentes) */
export function subscribeConsumerApp(
  db: MatuDBClient,
  handlers: {
    onNowPlaying?: RefreshFn;
    onListeners?: RefreshFn;
    onNewHistory?: RefreshFn;
  },
) {
  const channel = db
    .channel("logsfm-consumer")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: REALTIME_TABLES.radioSettings },
      () => handlers.onNowPlaying?.(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: REALTIME_TABLES.streamStats },
      () => handlers.onListeners?.(),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: REALTIME_TABLES.history },
      () => handlers.onNewHistory?.(),
    )
    .subscribe();

  return () => db.removeChannel(channel);
}
