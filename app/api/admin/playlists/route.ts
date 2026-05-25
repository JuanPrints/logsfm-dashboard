import { NextResponse } from "next/server";
import {
  listPlaylists,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  reorderPlaylistSongs,
  setActivePlaylist,
} from "@/lib/db/playlists";
import { fillQueueFromPlaylist } from "@/lib/db/queue";

export async function GET() {
  try {
    const playlists = await listPlaylists();
    return NextResponse.json({ success: true, data: playlists });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...payload } = body;

    switch (action) {
      case "create": {
        const playlist = await createPlaylist(payload);
        return NextResponse.json({ success: true, data: playlist });
      }
      case "update": {
        const playlist = await updatePlaylist(payload.id, payload);
        return NextResponse.json({ success: true, data: playlist });
      }
      case "delete": {
        await deletePlaylist(payload.id);
        return NextResponse.json({ success: true });
      }
      case "add-song": {
        const item = await addSongToPlaylist(payload.playlistId, payload.songId);
        return NextResponse.json({ success: true, data: item });
      }
      case "remove-song": {
        await removeSongFromPlaylist(payload.playlistSongId);
        return NextResponse.json({ success: true });
      }
      case "reorder": {
        await reorderPlaylistSongs(payload.items);
        return NextResponse.json({ success: true });
      }
      case "activate": {
        const playlist = await setActivePlaylist(payload.id);
        if (payload.loadQueue) {
          await fillQueueFromPlaylist(payload.id, playlist.shuffle);
        }
        return NextResponse.json({ success: true, data: playlist });
      }
      default:
        return NextResponse.json(
          { success: false, error: "Acción no válida" },
          { status: 400 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
