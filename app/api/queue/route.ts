import { NextResponse } from "next/server";
import { getQueue } from "@/lib/db/queue";

export async function GET() {
  try {
    const queue = await getQueue();

    return NextResponse.json({
      success: true,
      data: queue.map((q, i) => ({
        id: q.id,
        songId: q.song_id,
        title: q.title,
        artist: q.artist,
        coverUrl: q.cover_url,
        duration: q.duration,
        position: i,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
