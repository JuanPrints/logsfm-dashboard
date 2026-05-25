import { NextResponse } from "next/server";
import { getRadioEngine } from "@/lib/radio-engine";

export async function GET() {
  try {
    const engine = getRadioEngine();
    const state = await engine.getFullState();
    return NextResponse.json({
      success: true,
      data: state.nowPlaying,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
