import { NextResponse } from "next/server";
import { getHistory } from "@/lib/db/history";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const history = await getHistory(limit);

    return NextResponse.json({
      success: true,
      data: history.map((h) => ({
        id: h.id,
        songId: h.song_id,
        title: h.title,
        artist: h.artist,
        coverUrl: h.cover_url,
        playedAt: h.played_at,
        duration: h.duration,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
