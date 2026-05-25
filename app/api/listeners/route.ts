import { NextResponse } from "next/server";
import { getStreamStats } from "@/lib/db/settings";

export async function GET() {
  try {
    const stats = await getStreamStats();

    return NextResponse.json({
      success: true,
      data: {
        current: stats.listeners,
        peak: stats.peak_listeners,
        status: stats.status,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
