import { NextResponse } from "next/server";
import { listSongs, createSong, deleteSong } from "@/lib/db/songs";
import { storeSongFile, storeCoverFile } from "@/lib/upload/song-storage";
import { parseBuffer } from "music-metadata";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("category") ?? undefined;
    const songs = await listSongs(categoryId);
    return NextResponse.json({ success: true, data: songs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("[GET /api/admin/songs]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
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

    if (!file.name.match(/\.(mp3|mpeg)$/i) && !file.type.includes("audio")) {
      return NextResponse.json(
        { success: false, error: "Solo se permiten archivos MP3" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let metadata;
    try {
      metadata = await parseBuffer(buffer, {
        mimeType: file.type || "audio/mpeg",
      });
    } catch {
      metadata = { common: {}, format: {} };
    }

    const { relativePath, remoteUrl } = await storeSongFile(file.name, buffer);

    let coverUrl: string | null = null;
    if (cover) {
      const coverBuffer = Buffer.from(await cover.arrayBuffer());
      coverUrl = await storeCoverFile(cover.name, coverBuffer);
    } else if (metadata.common?.picture?.[0]) {
      const pic = metadata.common.picture[0];
      coverUrl = await storeCoverFile(
        `${file.name}-cover.jpg`,
        Buffer.from(pic.data),
      );
    }

    const song = await createSong({
      title: metadata.common?.title ?? file.name.replace(/\.mp3$/i, ""),
      artist: metadata.common?.artist ?? "Unknown",
      album: metadata.common?.album ?? null,
      duration: Math.round(metadata.format?.duration ?? 0),
      cover_url: coverUrl,
      file_path: remoteUrl ?? relativePath,
      category_id: categoryId?.trim() ? categoryId : null,
    });

    return NextResponse.json({
      success: true,
      data: { ...song, remote_url: remoteUrl },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al subir canción";
    console.error("[POST /api/admin/songs]", message, err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
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
    const message = err instanceof Error ? err.message : "Error";
    console.error("[DELETE /api/admin/songs]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
