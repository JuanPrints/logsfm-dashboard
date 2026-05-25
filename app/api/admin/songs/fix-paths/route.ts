import { NextResponse } from "next/server";
import { getMatuClient } from "@/lib/db/matu";
import { toRelativeSongPath } from "@/lib/upload/resolve-song-path";
import path from "path";

/** Corrige rutas absolutas legacy en la tabla songs → rutas relativas */
export async function POST() {
  try {
    const db = getMatuClient();
    const { data, error } = await db.from("songs").select("id, file_path");
    if (error) throw new Error(error.message);

    const songs = (data ?? []) as { id: string; file_path: string }[];
    let fixed = 0;

    for (const song of songs) {
      const fp = song.file_path.replace(/\\/g, "/");
      if (fp.startsWith("http")) continue;

      const marker = "uploads/songs/";
      const idx = fp.indexOf(marker);
      if (idx !== -1) {
        const relative = fp.slice(idx);
        if (relative !== song.file_path) {
          await db.from("songs").eq("id", song.id).update({ file_path: relative });
          fixed++;
        }
      } else if (path.isAbsolute(fp)) {
        const relative = toRelativeSongPath(path.basename(fp));
        await db.from("songs").eq("id", song.id).update({ file_path: relative });
        fixed++;
      }
    }

    return NextResponse.json({ success: true, data: { fixed, total: songs.length } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
