import { createClient, type MatuDBClient } from "@devjuanes/matuclient";

let client: MatuDBClient | null = null;

export function getMatuClient(): MatuDBClient {
  if (!client) {
    const url = process.env.MATUDB_URL;
    const projectId = process.env.MATUDB_PROJECT_ID;
    const apiKey = process.env.MATUDB_API_KEY;

    if (!url || !projectId || !apiKey) {
      throw new Error(
        "MatuDB no configurado. Define MATUDB_URL, MATUDB_PROJECT_ID y MATUDB_API_KEY.",
      );
    }

    client = createClient({
      url,
      projectId,
      apiKey,
      useSupabase: process.env.MATUDB_USE_SUPABASE === "true",
    });
  }

  return client;
}

export function createBrowserMatuClient() {
  const url = process.env.NEXT_PUBLIC_MATUDB_URL ?? process.env.MATUDB_URL;
  const projectId =
    process.env.NEXT_PUBLIC_MATUDB_PROJECT_ID ?? process.env.MATUDB_PROJECT_ID;
  const apiKey =
    process.env.NEXT_PUBLIC_MATUDB_API_KEY ?? process.env.MATUDB_API_KEY;

  if (!url || !projectId || !apiKey) {
    throw new Error("MatuDB client-side no configurado.");
  }

  return createClient({
    url,
    projectId,
    apiKey,
    useSupabase: process.env.NEXT_PUBLIC_MATUDB_USE_SUPABASE === "true",
  });
}
