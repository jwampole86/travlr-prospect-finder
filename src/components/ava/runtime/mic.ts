// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
export interface MicSession {
  /** Smoothed 0..1 input level, read every frame by the face renderer. */
  level: () => number;
  stop: () => void;
}

/** Opens the real microphone. Rejects if permission is denied or unavailable. */
export async function openMic(): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let smoothed = 0;
  return {
    level() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      const target = Math.min(1, rms * 5);
      smoothed += (target - smoothed) * (target > smoothed ? 0.5 : 0.15);
      return smoothed;
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    }
  };
}

/** Shared mutable level for the renderer; 0 when the mic is closed. */
export const micLevel = { current: () => 0 };
