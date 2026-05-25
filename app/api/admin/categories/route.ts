import { NextResponse } from "next/server";
import { listCategories, createCategory } from "@/lib/db/settings";

export async function GET() {
  try {
    const categories = await listCategories();
    return NextResponse.json({ success: true, data: categories });
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
    const category = await createCategory(body);
    return NextResponse.json({ success: true, data: category });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
