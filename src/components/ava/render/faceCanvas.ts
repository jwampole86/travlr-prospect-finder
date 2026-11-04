// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import manifest from '../core/ava-animation-manifest.json';
import type { FaceStateId } from '../core/ava-state';
import rig from './ava.rig.json';
import { assetUrl } from './assets';

const palette = manifest.palette as Record<string, string>;
type FaceDef = { eyes: { shape: string; color: string; opacity: number; scale?: number } };
const faceStates = manifest.faceStates as Record<string, FaceDef>;

/** Visor patch is 2*rx wide and 2*ry tall in model units; canvas pixels per model unit: */
export const FACE_W = 768;
export const FACE_H = Math.round(FACE_W * (rig.visor.ry / rig.visor.rx));
const U = FACE_W / (2 * rig.visor.rx);

// Eye layout measured from the scan's carved eyes (model units -> canvas px).
const EYE_DX = 0.125 * U;
const EYE_Y = FACE_H / 2 + 0.02 * U;

export interface FaceFrame {
  face: FaceStateId;
  prev: FaceStateId | null;
  /** Crossfade progress toward `face`, 0..1. */
  blend: number;
  seconds: number;
  micLevel: number;
  /** -1 (screen left) .. 1 (screen right) */
  gaze: number;
  speaking: boolean;
  reduced: boolean;
  sparkle: boolean;
}

function stateAlpha(face: FaceStateId, t: number, reduced: boolean): number {
  const base = faceStates[face].eyes.opacity;
  if (reduced) return base;
  if (face === 'thinking') return 0.65 + 0.35 * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 1.5));
  if (face === 'confirming') return 0.8 + 0.2 * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 2.4));
  if (face === 'sleeping') return 0.7 + 0.3 * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 4)); // closed eyes stay clearly visible
  return base;
}

const BLINK_FACES: FaceStateId[] = ['idle', 'explaining', 'guiding', 'greeting', 'confirming'];

/** Natural blink: a gap of 3-6 s (manifest blink.intervalMs) between blinks, a 140 ms close, occasionally a quick double blink. */
export function blinkScale(face: FaceStateId, t: number, reduced: boolean): number {
  if (reduced || !BLINK_FACES.includes(face)) return 1;
  const [minGap, maxGap] = manifest.faceStates.idle.animation.blink.intervalMs.map((ms) => ms / 1000);
  const dur = manifest.faceStates.idle.animation.blink.durationMs / 1000;
  const hash = (n: number) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const gap = (n: number) => minGap + hash(n) * (maxGap - minGap);
  // First scheduled blink whose (possibly double) window has not ended yet.
  let at = gap(0);
  let i = 0;
  while (at + dur * 3 < t) at += gap(++i);
  const close = (from: number) => {
    const ph = t - from;
    return ph >= 0 && ph < dur ? 1 - 0.9 * Math.sin((Math.PI * ph) / dur) : 1;
  };
  return Math.min(close(at), hash(i + 91) > 0.75 ? close(at + dur * 1.6) : 1);
}

/** Bright inner core over the coloured glow, like the emissive strokes in the approved reference. */
function core(ctx: CanvasRenderingContext2D, fill = false) {
  ctx.save();
  ctx.shadowBlur = 0;
  if (fill) { ctx.fillStyle = 'rgba(235,250,255,0.5)'; ctx.fill(); }
  else { ctx.lineWidth *= 0.4; ctx.strokeStyle = 'rgba(235,250,255,0.55)'; ctx.stroke(); }
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.22;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

function drawState(ctx: CanvasRenderingContext2D, f: FaceFrame, face: FaceStateId, alpha: number) {
  if (alpha <= 0.001) return;
  const { shape, color, scale = 1 } = faceStates[face].eyes;
  const col = palette[color];
  const pulse = f.speaking && !f.reduced ? 0.85 + 0.15 * Math.sin(f.seconds * 14) : 1;

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha * stateAlpha(face, f.seconds, f.reduced) * pulse);
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 34;
  ctx.lineCap = 'round';

  const maxGaze = manifest.faceStates.guiding.animation.gazeOffset.maxFractionOfVisorWidth * FACE_W;
  ctx.translate(face === 'guiding' ? f.gaze * maxGaze : 0, 0);
  const cx = FACE_W / 2;
  const eyes = [cx - EYE_DX, cx + EYE_DX];

  if (scale !== 1) {
    ctx.translate(cx, EYE_Y);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -EYE_Y);
  }

  if (shape === 'crescent_up' || shape === 'crescent_down') {
    ctx.save();
    ctx.translate(0, EYE_Y);
    ctx.scale(1, blinkScale(face, f.seconds, f.reduced));
    ctx.lineWidth = 0.028 * U;
    for (const ex of eyes) {
      ctx.beginPath();
      if (shape === 'crescent_up') ctx.arc(ex, 76, 108, Math.PI * 1.16, Math.PI * 1.84);
      else ctx.arc(ex, -76, 108, Math.PI * 0.16, Math.PI * 0.84); // closed, relaxed eyes
      ctx.stroke();
      core(ctx);
    }
    ctx.restore();
    if (face === 'success' && f.sparkle) {
      const k = 0.75 + 0.25 * Math.sin(f.seconds * 8);
      ctx.fillStyle = palette.lightBlue;
      star(ctx, eyes[0] - 100, EYE_Y - 112, 46 * k);
      star(ctx, eyes[1] + 100, EYE_Y - 118, 54 * (1.5 - k));
      star(ctx, eyes[0] - 40, EYE_Y + 84, 24 * (1.5 - k));
      star(ctx, eyes[1] + 50, EYE_Y + 88, 28 * k);
    }
  } else if (shape === 'dash_pair') {
    ctx.lineWidth = 0.03 * U;
    for (const ex of eyes) {
      ctx.beginPath();
      ctx.moveTo(ex - 0.052 * U, EYE_Y);
      ctx.lineTo(ex + 0.052 * U, EYE_Y);
      ctx.stroke();
      core(ctx);
    }
  } else if (shape === 'dot_pair') {
    const blink = blinkScale(face, f.seconds, f.reduced);
    for (const ex of eyes) {
      ctx.beginPath();
      ctx.ellipse(ex, EYE_Y, 0.036 * U, 0.036 * U * blink, 0, 0, Math.PI * 2);
      ctx.fill();
      core(ctx, true);
    }
  } else if (shape === 'x_pair') {
    ctx.lineWidth = 0.018 * U;
    const r = 0.038 * U;
    for (const ex of eyes) {
      ctx.beginPath();
      ctx.moveTo(ex - r, EYE_Y - r);
      ctx.lineTo(ex + r, EYE_Y + r);
      ctx.moveTo(ex + r, EYE_Y - r);
      ctx.lineTo(ex - r, EYE_Y + r);
      ctx.stroke();
    }
  } else if (shape === 'flatline') {
    // Same span as the listening waveform, but flat: there is no audio to show.
    const bars = manifest.faceStates.listening.animation.bars;
    const half = 0.175 * U;
    for (let i = 0; i < bars; i++) {
      ctx.beginPath();
      ctx.arc(cx - half + (2 * half * i) / (bars - 1), EYE_Y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (shape === 'dotted_ring_pair') {
    const dots = 14;
    const period = manifest.faceStates.searching.animation.scan.rotationPeriodMs / 1000;
    const spin = f.reduced ? 0 : (f.seconds * Math.PI * 2) / period;
    const base = ctx.globalAlpha;
    for (const ex of eyes) {
      for (let i = 0; i < dots; i++) {
        const a = spin + (i / dots) * Math.PI * 2;
        ctx.globalAlpha = base * (f.reduced ? 1 : 0.55 + 0.45 * (i / dots));
        ctx.beginPath();
        ctx.arc(ex + Math.cos(a) * 0.058 * U, EYE_Y + Math.sin(a) * 0.058 * U, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (shape === 'waveform') {
    const bars = manifest.faceStates.listening.animation.bars;
    const half = 0.175 * U;
    ctx.lineWidth = 19;
    for (let i = 0; i < bars; i++) {
      const x = cx - half + (2 * half * i) / (bars - 1);
      const bell = 0.35 + 0.65 * Math.sin((Math.PI * i) / (bars - 1));
      const wobble = 0.6 + 0.4 * Math.sin(f.seconds * 9 + i * 1.7);
      const h = 22 + bell * wobble * f.micLevel * 215;
      ctx.beginPath();
      ctx.moveTo(x, EYE_Y - h / 2);
      ctx.lineTo(x, EYE_Y + h / 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawFace(ctx: CanvasRenderingContext2D, f: FaceFrame) {
  ctx.fillStyle = palette.visorBlack;
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  if (f.prev && f.blend < 1) drawState(ctx, f, f.prev, 1 - f.blend);
  drawState(ctx, f, f.face, f.prev ? f.blend : 1);
}

export const EAR_SIZE = 256;
/** Glowing ring for the ear lights. `level` 0..1 scales brightness. */
export function drawEar(ctx: CanvasRenderingContext2D, level: number) {
  ctx.clearRect(0, 0, EAR_SIZE, EAR_SIZE);
  const c = EAR_SIZE / 2;
  ctx.save();
  ctx.strokeStyle = palette.primaryBlue;
  ctx.shadowColor = palette.primaryBlue;
  ctx.shadowBlur = 18;
  ctx.globalAlpha = Math.max(0.15, Math.min(1, level));
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.66, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha *= 0.35;
  ctx.fillStyle = palette.lightBlue;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const CHEST_W = 512;
export const CHEST_H = Math.round(CHEST_W * ((rig.chest.y[1] - rig.chest.y[0]) / (rig.chest.x[1] - rig.chest.x[0])));
export const chestLogoUrl = () => assetUrl('/brand/avyro-mark.png');

/** Loads the official AVYRO "A" mark (cut from the brand favicon artwork). */
export function loadChestLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${chestLogoUrl()}`));
    img.src = chestLogoUrl();
  });
}

/** Draws the brand mark centred on the chest patch; nothing is drawn until the real artwork is available. */
export function drawChestLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null) {
  ctx.clearRect(0, 0, CHEST_W, CHEST_H);
  if (!logo) return;
  const scale = Math.min((CHEST_W * 0.74) / logo.width, (CHEST_H * 0.74) / logo.height);
  const w = logo.width * scale, h = logo.height * scale;
  ctx.drawImage(logo, (CHEST_W - w) / 2, (CHEST_H - h) / 2 + CHEST_H * 0.02, w, h);
}
