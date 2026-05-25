import { NextResponse } from "next/server";
import { getRadioEngine } from "@/lib/radio-engine";
import { getRadioSettings } from "@/lib/db/settings";
import { buildBroadcastInfo } from "@/lib/radio/broadcast-info";

/** Estado completo de emisión para apps oyentes (now playing + programa + display) */
export async function GET() {
  try {
    const engine = getRadioEngine();
    const [state, settings] = await Promise.all([
      engine.getFullState(),
      getRadioSettings(),
    ]);

    const data = buildBroadcastInfo({
      playback: state.playback,
      nowPlaying: state.nowPlaying,
      currentShow: state.currentShow,
      isLiveDj: state.isLiveDj,
      stream: state.stream,
      programName: settings.current_show_name,
      programDj: settings.current_dj_name,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
