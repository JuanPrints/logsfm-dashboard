import { DirectIcecastStream } from "@/lib/radio-engine/direct-stream";
import { IcecastPipeline } from "@/lib/radio-engine/icecast-pipeline";

export type StreamOutput = DirectIcecastStream | IcecastPipeline;

export function createStreamOutput(icecastUrl: string, bitrate: string): StreamOutput {
  if (process.env.RADIO_STREAM_MODE === "pcm") {
    console.log("> Radio: modo PCM (encoder permanente)");
    return new IcecastPipeline(icecastUrl, bitrate);
  }
  console.log("> Radio: modo directo (FFmpeg → Icecast)");
  return new DirectIcecastStream(icecastUrl, bitrate);
}
