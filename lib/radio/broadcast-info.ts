import type { CurrentShow, NowPlaying, PlaybackState, StreamInfo } from "@/lib/types";

const STATION_NAME = process.env.NEXT_PUBLIC_STATION_NAME ?? "LogsFM";

export function cleanArtist(artist?: string | null): string | null {
  if (!artist) return null;
  const trimmed = artist.trim();
  if (!trimmed || /^unknown$/i.test(trimmed) || trimmed === "—") return null;
  return trimmed;
}

export interface BroadcastSong {
  id: string;
  title: string;
  artist: string | null;
  album?: string | null;
  coverUrl?: string | null;
  duration: number;
  elapsed: number;
  startedAt: string;
}

export interface BroadcastDisplay {
  /** Texto principal grande — título de canción o nombre del programa */
  headline: string;
  /** Texto secundario — artista, DJ o nombre de la emisora */
  subline: string;
  /** Etiqueta compacta — ej. "En vivo · La Vida Es Así" */
  badge: string;
}

export interface BroadcastInfo {
  playback: PlaybackState;
  isLive: boolean;
  programName: string | null;
  programDj: string | null;
  stream: Pick<StreamInfo, "status" | "listeners" | "peakListeners">;
  display: BroadcastDisplay;
  /** Alias de display.headline — usar este campo en la app oyente */
  name: string;
  /** Alias de display.subline */
  subtitle: string;
  song: BroadcastSong | null;
  /** Compatibilidad con clientes antiguos */
  id?: string;
  title?: string;
  artist?: string | null;
  album?: string | null;
  coverUrl?: string | null;
  duration?: number;
  elapsed?: number;
  startedAt?: string;
}

interface BuildBroadcastInput {
  playback: PlaybackState;
  nowPlaying: NowPlaying | null;
  currentShow: CurrentShow | null;
  isLiveDj: boolean;
  stream: StreamInfo;
  programName?: string | null;
  programDj?: string | null;
}

export function buildBroadcastInfo(input: BuildBroadcastInput): BroadcastInfo {
  const programName =
    input.currentShow?.name ?? input.programName ?? null;
  const programDj =
    input.currentShow?.djName ?? input.programDj ?? null;
  const isLive = input.isLiveDj || Boolean(input.currentShow?.isLive);

  const song = input.nowPlaying
    ? {
        id: input.nowPlaying.id,
        title: input.nowPlaying.title,
        artist: cleanArtist(input.nowPlaying.artist),
        album: input.nowPlaying.album,
        coverUrl: input.nowPlaying.coverUrl,
        duration: input.nowPlaying.duration,
        elapsed: input.nowPlaying.elapsed,
        startedAt: input.nowPlaying.startedAt,
      }
    : null;

  const songTitle = song?.title ?? null;
  const songArtist = song?.artist ?? null;

  let headline: string;
  let subline: string;
  let badge: string;

  if (isLive && programName) {
    headline = programName;
    subline = programDj ?? STATION_NAME;
    badge = songTitle
      ? `En vivo · ${songTitle}`
      : `En vivo · ${programName}`;
  } else if (input.playback === "playing" && songTitle) {
    headline = songTitle;
    subline = songArtist ?? programName ?? STATION_NAME;
    badge = `En vivo · ${songTitle}`;
  } else if (input.playback === "paused" && songTitle) {
    headline = songTitle;
    subline = songArtist ?? programName ?? STATION_NAME;
    badge = `En pausa · ${songTitle}`;
  } else if (programName) {
    headline = programName;
    subline = programDj ?? STATION_NAME;
    badge = `${STATION_NAME} · ${programName}`;
  } else {
    headline = STATION_NAME;
    subline = input.stream.status === "online" ? "Radio en vivo" : "Fuera de línea";
    badge = STATION_NAME;
  }

  const display: BroadcastDisplay = { headline, subline, badge };

  return {
    playback: input.playback,
    isLive,
    programName,
    programDj,
    stream: {
      status: input.stream.status,
      listeners: input.stream.listeners,
      peakListeners: input.stream.peakListeners,
    },
    display,
    name: headline,
    subtitle: subline,
    song,
    ...(song
      ? {
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          coverUrl: song.coverUrl,
          duration: song.duration,
          elapsed: song.elapsed,
          startedAt: song.startedAt,
        }
      : {}),
  };
}
