import { NextResponse } from "next/server";
import { getPlaylist, getPlaylistSongs } from "@/lib/db/playlists";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const playlist = await getPlaylist(id);
    const songs = await getPlaylistSongs(id);
    return NextResponse.json({ success: true, data: { ...playlist, songs } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
