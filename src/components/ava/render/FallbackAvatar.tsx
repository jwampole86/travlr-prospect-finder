// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { useEffect, useRef } from 'react';
import type { Presentation } from '../core/ava-state';
import { EAR_SIZE, FACE_H, FACE_W, drawEar, drawFace, drawChestLogo, loadChestLogo, CHEST_H, CHEST_W } from './faceCanvas';
import type { FaceFrame } from './faceCanvas';

const W = 340;
const H = 400;
const DEG = Math.PI / 180;

interface Props {
  presentation: Presentation;
  getMicLevel: () => number;
  getGaze: () => number;
  className?: string;
}

/**
 * Flat 2D version of AVA for devices without WebGL, or for people who prefer a lighter view.
 * It is driven by exactly the same presentation as the 3D character (face, arms, hover, speaking, motion).
 */
export function FallbackAvatar({ presentation, getMicLevel, getGaze, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pr = useRef(presentation);
  pr.current = presentation;
  const getters = useRef({ getMicLevel, getGaze });
  getters.current = { getMicLevel, getGaze };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const face = document.createElement('canvas');
    face.width = FACE_W; face.height = FACE_H;
    const faceCtx = face.getContext('2d')!;
    const ear = document.createElement('canvas');
    ear.width = ear.height = EAR_SIZE;
    const earCtx = ear.getContext('2d')!;
    const chest = document.createElement('canvas');
    chest.width = CHEST_W; chest.height = CHEST_H;
    const chestCtx = chest.getContext('2d')!;
    let logo: HTMLImageElement | null = null;
    loadChestLogo().then((img) => { logo = img; }).catch(() => undefined);

    let raf = 0;
    let lastFace = pr.current.face;
    let prevFace: Presentation['face'] | null = null;
    let faceSince = 0;
    let armL = 8, armR = 8;
    const start = performance.now();
    let last = start;

    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame);
      const t = (nowMs - start) / 1000;
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      const p = pr.current;
      const reduced = p.motion === 'reduced';
      if (!p.visible) { ctx.clearRect(0, 0, W, H); return; }

      if (p.face !== lastFace) { prevFace = lastFace; lastFace = p.face; faceSince = t; }
      const blend = Math.min(1, ((t - faceSince) * 1000) / 180);
      const f: FaceFrame = {
        face: lastFace, prev: blend < 1 ? prevFace : null, blend, seconds: t,
        micLevel: getters.current.getMicLevel(), gaze: getters.current.getGaze(),
        speaking: p.overlays.speaking, reduced, sparkle: p.overlays.sparkle
      };
      drawFace(faceCtx, f);
      const earLevel = ['warning', 'error', 'micDenied'].includes(p.face) ? 0.45 : p.face === 'sleeping' ? 0.25 : 0.85 + (reduced ? 0 : 0.1 * Math.sin(t * 1.6));
      drawEar(earCtx, earLevel);
      drawChestLogo(chestCtx, logo);

      // Arm targets (degrees outward from the body) per gesture, eased so nothing snaps.
      const g = p.arms.gesture;
      const side = p.arms.side;
      let tl = 8, tr = 8;
      if (!reduced) {
        const wave = Math.sin(t * 5);
        if (g === 'greet') tr = 55 + 8 * wave;
        else if (g === 'explain') { if (side !== 'right') tl = 30; if (side !== 'left') tr = 30; }
        else if (g === 'guide') { const left = side === 'left' || (side === 'auto' && getters.current.getGaze() > 0); if (left) tl = 45; else tr = 45; }
        else if (g === 'success') { tl = tr = 42 + 4 * Math.sin(t * 12); }
        else if (g === 'warning') { tl = tr = -8; }
      }
      armL += (tl - armL) * Math.min(1, dt * 8);
      armR += (tr - armR) * Math.min(1, dt * 8);

      const bob = p.hover && !reduced ? Math.sin(t * 1.4) * 4 : 0;
      const tilt = !reduced && p.head === 'listen' ? 3 * DEG : !reduced && p.head === 'think' ? -4 * DEG : 0;

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, 0);

      // Hover halo
      ctx.strokeStyle = '#7FD1FF'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, 362, 80, 14, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.translate(0, bob);

      const shade = () => { ctx.shadowColor = 'rgba(10,15,26,.22)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; };
      const unshade = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };
      const white = (x0: number, y0: number, x1: number, y1: number) => {
        const gr = ctx.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dfe7f3');
        return gr;
      };

      // Arms (behind torso): +X is her left, which is screen-right.
      const arm = (dir: 1 | -1, deg: number) => {
        ctx.save();
        ctx.translate(dir * 58, 232);
        ctx.rotate(dir * (-deg * DEG));
        ctx.fillStyle = white(0, 0, dir * 40, 80);
        shade();
        ctx.beginPath(); ctx.ellipse(dir * 20, 40, 22, 56, dir * -0.35, 0, Math.PI * 2); ctx.fill();
        unshade();
        ctx.strokeStyle = '#c5d2e6'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      };
      arm(-1, armR);
      arm(1, armL);

      // Torso (teardrop) and chest mark
      ctx.fillStyle = white(-50, 210, 50, 340);
      ctx.beginPath();
      ctx.moveTo(-62, 226);
      ctx.quadraticCurveTo(-70, 300, 0, 352);
      ctx.quadraticCurveTo(70, 300, 62, 226);
      ctx.quadraticCurveTo(0, 204, -62, 226);
      shade();
      ctx.fill();
      unshade();
      ctx.strokeStyle = '#c5d2e6'; ctx.lineWidth = 2; ctx.stroke();
      ctx.drawImage(chest, -34, 244, 68, 68 * (CHEST_H / CHEST_W));

      // Shoulder joints and neck
      ctx.fillStyle = '#2a3342';
      for (const x of [-60, 60]) { ctx.beginPath(); ctx.arc(x, 234, 9, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillRect(-18, 196, 36, 22);

      // Head
      ctx.save();
      ctx.translate(0, 148);
      ctx.rotate(tilt);
      ctx.fillStyle = white(-90, -80, 90, 80);
      shade();
      ctx.beginPath(); ctx.ellipse(0, 0, 108, 84, 0, 0, Math.PI * 2); ctx.fill();
      unshade();
      ctx.strokeStyle = '#c5d2e6'; ctx.lineWidth = 2; ctx.stroke();
      // Ear rings
      for (const x of [-108, 108]) ctx.drawImage(ear, x - 26, -26, 52, 52);
      // Visor with the live face
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, 4, 82, 54, 0, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#0A0F1A';
      ctx.fillRect(-82, -50, 164, 108);
      const fh = 164 * (FACE_H / FACE_W);
      ctx.drawImage(face, -82, 4 - fh / 2, 164, fh);
      ctx.restore();
      ctx.restore();
      ctx.restore();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={className} data-testid="ava-fallback">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} role="img" aria-label="AVA, shown in simple view" />
    </div>
  );
}
