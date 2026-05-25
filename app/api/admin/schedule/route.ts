import { NextResponse } from "next/server";
import {
  listScheduledShows,
  createScheduledShow,
  updateScheduledShow,
  deleteScheduledShow,
} from "@/lib/db/shows";

export async function GET() {
  try {
    const shows = await listScheduledShows();
    return NextResponse.json({ success: true, data: shows });
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
        const show = await createScheduledShow(payload);
        return NextResponse.json({ success: true, data: show });
      }
      case "update": {
        const show = await updateScheduledShow(payload.id, payload);
        return NextResponse.json({ success: true, data: show });
      }
      case "delete": {
        await deleteScheduledShow(payload.id);
        return NextResponse.json({ success: true });
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
