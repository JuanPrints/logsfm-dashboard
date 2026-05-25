import { NextResponse } from "next/server";
import { listPlaylists, getPlaylistSongs } from "@/lib/db/playlists";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const playlist = await import("@/lib/db/playlists").then((m) => m.getPlaylist(id));
      const songs = await getPlaylistSongs(id);
      return NextResponse.json({
        success: true,
        data: { ...playlist, songs },
      });
    }

    const playlists = await listPlaylists();
    return NextResponse.json({ success: true, data: playlists });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
