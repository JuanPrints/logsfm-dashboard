import { NextResponse } from "next/server";
import { getRadioEngine } from "@/lib/radio-engine";
import { addToQueue, removeFromQueue, reorderQueue, clearQueue } from "@/lib/db/queue";

export async function GET() {
  try {
    const engine = getRadioEngine();
    const state = await engine.getFullState();
    return NextResponse.json({ success: true, data: state });
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
    const engine = getRadioEngine();

    switch (body.action) {
      case "play":
        await engine.play();
        break;
      case "pause":
        await engine.pause();
        break;
      case "stop":
        await engine.stop();
        break;
      case "next":
        await engine.next();
        break;
      case "previous":
        await engine.previous();
        break;
      case "toggle-autodj":
        await engine.toggleAutoDj();
        break;
      case "toggle-shuffle":
        await engine.toggleShuffle();
        break;
      case "toggle-repeat":
        await engine.toggleRepeat();
        break;
      case "replay-current":
        await engine.replayCurrent();
        break;
      case "go-live":
        await engine.goLive(body.djName);
        break;
      case "stop-live":
        await engine.stopLive();
        break;
      case "toggle-mic":
        await engine.toggleMic();
        break;
      case "load-playlist":
        await engine.loadPlaylist(body.playlistId, Boolean(body.play));
        break;
      case "play-now":
        await engine.playNow(body.songId);
        break;
      case "set-volume":
        engine.setVolume(body.musicVolume ?? 85, body.micVolume ?? 100, body.ducking ?? true);
        break;
      case "add-to-queue":
        await addToQueue(body.songId);
        break;
      case "remove-from-queue":
        await removeFromQueue(body.queueItemId);
        break;
      case "reorder-queue":
        await reorderQueue(body.items);
        break;
      case "clear-queue":
        await clearQueue();
        break;
      default:
        return NextResponse.json(
          { success: false, error: "Acción no válida" },
          { status: 400 },
        );
    }

    const state = await engine.getFullState();
    return NextResponse.json({ success: true, data: state });
  } catch (err) {
    console.error("[POST /api/admin/radio]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
