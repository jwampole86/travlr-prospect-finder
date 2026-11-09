// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { Component, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { createPerfGuard } from './perfGuard';
import type { PerfLevel } from './perfGuard';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AvaCharacter, AvaCharacterProps } from './AvaCharacter';
import { FallbackAvatar } from './FallbackAvatar';
import { assetUrl } from './assets';
import type { ViewMode } from './webgl';

type StageProps = AvaCharacterProps & {
  className?: string;
  mode: ViewMode;
  onFailure?: () => void;
  /** False while AVA is closed and only being kept warm: the scene is built and drawn once, then stops rendering. */
  active?: boolean;
  /** Called once the model is loaded and on screen. */
  onReady?: () => void;
};

/** Starts loading the model before anyone asks for it, so opening AVA does not wait on the download. */
export function preloadAvaModel() {
  try { useLoader.preload(GLTFLoader, assetUrl('/models/ava.glb')); } catch { /* the stage retries when it mounts */ }
}

function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => { onReady?.(); }, [onReady]);
  return null;
}

/**
 * The scanned head is lopsided (it spans x -0.351 to +0.296), so one ear faces the camera a little more than the other.
 * This framing offset was found by measuring the blue ear pixels on each side from the front: left and right come out
 * within about 13% of each other at this value (e2e/three-d.spec.ts keeps it honest).
 */
export const CAMERA_X = -0.028;

const MAX_RETRIES = 2;

/**
 * 3D is always tried first. If the scene throws (a failed model download, a lost graphics context), it is retried a couple of
 * times before the flat view is used, and the failed download is forgotten so the retry really fetches it again.
 */
class Boundary extends Component<{ fallback: ReactNode; onError?: () => void; children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  private timer: ReturnType<typeof setTimeout> | undefined;
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.warn('[AVA] 3D scene error', error);
    if (this.state.attempt < MAX_RETRIES) {
      useLoader.clear(GLTFLoader, assetUrl('/models/ava.glb'));
      this.timer = setTimeout(() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 })), 600 * (this.state.attempt + 1));
    } else {
      this.props.onError?.();
    }
  }
  componentWillUnmount() { clearTimeout(this.timer); }
  render() {
    if (this.state.failed) return this.state.attempt < MAX_RETRIES ? null : this.props.fallback;
    return <div key={this.state.attempt} style={{ display: 'contents' }}>{this.props.children}</div>;
  }
}

/** Watches the real frame rate and steps the quality down on a device that cannot keep up (see perfGuard.ts). Automated browsers are not measured. */
function PerfWatch({ active, level, onLevel }: { active: boolean; level: PerfLevel; onLevel: (l: PerfLevel) => void }) {
  const cb = useRef(onLevel);
  cb.current = onLevel;
  const guard = useMemo(() => createPerfGuard({ onLevel: (l) => cb.current(l) }), []);
  const invalidate = useThree((s) => s.invalidate);
  const measured = useMemo(() => !navigator.webdriver || new URLSearchParams(window.location.search).has('perf'), []); // `?perf` measures even in automated browsers (tools/measure-throttled.mjs)
  useFrame((_, delta) => { if (active && measured) guard.tick(delta * 1000); });
  // At the lowest level the scene is drawn about thirty times a second instead of every screen refresh.
  useEffect(() => {
    if (!active || level < 2) return;
    const id = window.setInterval(invalidate, 33);
    return () => window.clearInterval(id);
  }, [active, level, invalidate]);
  return null;
}

// Constants, so a re-render never hands the canvas a fresh object and makes it re-apply its camera, pixel ratio or size.
const CAMERA = { position: [CAMERA_X, 0.5, 3.1] as [number, number, number], fov: 30, near: 0.1, far: 20 };
const GL = { alpha: true, antialias: true, powerPreference: 'high-performance' as const };
const DPR_FULL: [number, number] = [1, 2];
const RESIZE = { offsetSize: true, scroll: false };

export function AvaStage(props: StageProps) {
  const [level, setLevel] = useState<PerfLevel>(0);
  const { className, mode, onFailure, active = true, onReady, ...rest } = props;
  const simple = <FallbackAvatar className={className} presentation={rest.presentation} getMicLevel={rest.getMicLevel} getGaze={rest.getGaze} />;
  if (mode === '2d') return simple;
  return (
    <Boundary fallback={simple} onError={onFailure}>
      <div className={`${className ?? ''} stage-3d`} aria-hidden="true" data-testid="ava-3d">
        <Canvas
          camera={CAMERA}
          gl={GL}
          dpr={level === 0 ? DPR_FULL : 1}
          // Measure the layout size, not the on-screen size. She is scaled up with a CSS transform while she floats to point; the default
          // measurement includes that transform, so the canvas resized to the larger box and never resized back, leaving her too big
          // and cropped after the tour.
          resize={RESIZE}
          frameloop={active && level < 2 ? 'always' : 'demand'}
          onCreated={({ camera, gl }) => {
            camera.lookAt(CAMERA_X, 0.5, 0);
            // A lost graphics context is normally recoverable: tell the browser we want it back instead of giving up on 3D.
            gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
          }}
        >
          <PerfWatch active={active} level={level} onLevel={setLevel} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[1.5, 2.5, 3]} intensity={1.6} />
          <directionalLight position={[-2, 1, -1]} intensity={0.6} color="#7FD1FF" />
          <Suspense fallback={null}>
            <AvaCharacter {...rest} />
            <Ready onReady={onReady} />
          </Suspense>
        </Canvas>
      </div>
    </Boundary>
  );
}
