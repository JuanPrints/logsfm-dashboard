import { NextResponse } from "next/server";
import { listSongs, createSong, deleteSong } from "@/lib/db/songs";
import { uploadSongFile, uploadCoverImage } from "@/lib/db/settings";
import { parseBuffer } from "music-metadata";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("category") ?? undefined;
    const songs = await listSongs(categoryId);
    return NextResponse.json({ success: true, data: songs });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const categoryId = formData.get("categoryId") as string | null;
    const cover = formData.get("cover") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Archivo MP3 requerido" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await parseBuffer(buffer, { mimeType: file.type });

    const upload = await uploadSongFile(file.name, buffer);

    let coverUrl: string | null = null;
    if (cover) {
      const coverBuffer = Buffer.from(await cover.arrayBuffer());
      const coverUpload = await uploadCoverImage(cover.name, coverBuffer);
      coverUrl = coverUpload.publicUrl;
    } else if (metadata.common.picture?.[0]) {
      const pic = metadata.common.picture[0];
      const coverUpload = await uploadCoverImage(
        `${file.name}-cover.jpg`,
        Buffer.from(pic.data),
      );
      coverUrl = coverUpload.publicUrl;
    }

    const song = await createSong({
      title: metadata.common.title ?? file.name.replace(/\.mp3$/i, ""),
      artist: metadata.common.artist ?? "Unknown",
      album: metadata.common.album ?? null,
      duration: Math.round(metadata.format.duration ?? 0),
      cover_url: coverUrl,
      file_path: upload.path,
      category_id: categoryId,
    });

    return NextResponse.json({ success: true, data: song });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID requerido" },
        { status: 400 },
      );
    }
    await deleteSong(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
