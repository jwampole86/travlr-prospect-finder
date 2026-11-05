// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import manifest from '../core/ava-animation-manifest.json';
import type { FaceStateId, Presentation } from '../core/ava-state';
import { nearerArm } from './sides';
import rigSpec from './ava.rig.json';

const earSpec = rigSpec.ear;
import { assetUrl } from './assets';
import { CHEST_H, CHEST_W, EAR_SIZE, FACE_H, FACE_W, drawChestLogo, drawEar, drawFace, loadChestLogo } from './faceCanvas';

const DEG = Math.PI / 180;
const ENV = manifest.envelopes;

// Replaces the -X half of the scanned head with a mirror image of its +X half (cut at the head's centre line), so the head,
// and with it both ear rings, is exactly symmetric. The cut happens in the fragment shader, so the halves meet cleanly.
function mirrorShell(shell: THREE.Mesh, centreWorldX: number, hole: { top: number; radius: number }) {
  const parent = shell.parent;
  if (!parent) throw new Error('head shell has no parent');
  const id = new THREE.Matrix4();
  shell.updateMatrix();
  if (!shell.matrix.equals(id)) throw new Error('head shell has its own transform; cannot mirror');
  const cut = parent.worldToLocal(new THREE.Vector3(centreWorldX, 0, 0)).x;

  const half = (source: THREE.Material) => {
    const mat = source.clone();
    mat.side = THREE.DoubleSide; // the head's inside is drawn too, so the opening under the head is never see-through
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.avaCut = { value: cut };
      shader.uniforms.avaHole = { value: new THREE.Vector2(hole.top, hole.radius) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vAvaP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAvaP = position;');
      // Besides the mirror cut, a hole just the size of the neck is cut in the head's underside. The neck passes up through it, so
      // the two are one continuous piece with no gap around the join.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vAvaP;\nuniform float avaCut;\nuniform vec2 avaHole;')
        .replace('void main() {', 'void main() {\n  if (vAvaP.x < avaCut) discard;\n  vec2 avaD = vec2(vAvaP.x - avaCut, vAvaP.z);\n  if (vAvaP.y < avaHole.x && dot(avaD, avaD) < avaHole.y * avaHole.y) discard;');
    };
    mat.customProgramCacheKey = () => 'ava-half-shell-hole';
    return mat;
  };

  const original = shell.material as THREE.Material;
  const mirror = shell.clone();
  shell.material = half(original);
  mirror.material = half(original);
  mirror.name = 'HEAD_SHELL_MIRROR';
  mirror.position.x = 2 * cut;
  mirror.scale.x = -1;
  parent.add(mirror);
  return { original, cut };
}

export interface AvaCharacterProps {
  presentation: Presentation;
  /** Real microphone level (0..1) while capturing; 0 otherwise. */
  getMicLevel: () => number;
  /** Where the guided UI target is, relative to AVA: -1 screen-left .. 1 screen-right. */
  getGaze: () => number;
  /** Turntable angle in degrees for the studio (inspect side/back). */
  turnDeg?: number;
}

const approach = (cur: number, target: number, maxSpeed: number, dt: number, stiffness = 7) => {
  const step = (target - cur) * Math.min(1, dt * stiffness);
  const lim = maxSpeed * dt;
  return cur + Math.max(-lim, Math.min(lim, step));
};

/** The neck between torso and head, relative to the neck pivot (the scan is centred on x = -0.028, not 0). */
/** The neck column's radius, and how far its top reaches up into the head past the head's lowest point. */
/** The scan hangs a white socket boss under the head. Everything below `SOCKET_TOP` within `SOCKET_RADIUS` of the neck axis is cut away. */
const SOCKET_TOP = -0.012;
const SOCKET_RADIUS = 0.135;
const NECK_RADIUS = 0.08;
const NECK_INTO_HEAD = 0.04;
const NECK_X = -0.028; // the scan is centred on x = -0.028, not 0
/**
 * The neck joint, from the close-up reference: a stack of plain glossy black rings (no glow), seated in a dark recess in a
 * white bezel on the torso, under the head. `y` is the ring's centre in model space, `r` its radius, `h` its height.
 */
const NECK_STACK: Array<{ name: string; r: number; h: number; y: number; kind: 'black' | 'white' }> = [
  { name: 'NECK_RECESS', r: 0.124, h: 0.004, y: 0.4785, kind: 'black' },
  { name: 'NECK_BASE', r: 0.108, h: 0.02, y: 0.488, kind: 'black' },
  { name: 'NECK_COLUMN', r: NECK_RADIUS, h: 0, y: 0, kind: 'black' } // spans from the base ring up into the head; sized when built
];
/** Head-local height of the lowest point of the head's own underside (a smooth, shallow bowl; measured from the scan). */
const HEAD_BOTTOM = -0.026;
/** The scan sinks the head into the top of the torso, hiding the neck. Lifting it leaves the short black neck of the reference art in view. */
const HEAD_LIFT = 0.012;

function canvasTexture(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, ctx: canvas.getContext('2d')!, texture };
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

export function AvaCharacter({ presentation, getMicLevel, getGaze, turnDeg = 0 }: AvaCharacterProps) {
  const gltf = useLoader(GLTFLoader, assetUrl('/models/ava.glb'));
  const root = useRef<THREE.Group>(null);
  const p = useRef(presentation);
  p.current = presentation;

  const rig = useMemo(() => {
    // Work on a private copy of the loaded model. React may run this memo twice (Strict Mode) and the loader hands the same
    // cached scene to every remount; building on the shared scene would leave textures drawn for one build mapped by another.
    const scene = gltf.scene.clone(true);
    const get = (n: string) => scene.getObjectByName(n) as THREE.Object3D;
    const face = canvasTexture(FACE_W, FACE_H);
    const earL = canvasTexture(EAR_SIZE, EAR_SIZE);
    const earR = canvasTexture(EAR_SIZE, EAR_SIZE);
    const chest = canvasTexture(CHEST_W, CHEST_H);
    drawChestLogo(chest.ctx, null);
    loadChestLogo()
      .then((logo) => {
        drawChestLogo(chest.ctx, logo);
        chest.texture.needsUpdate = true;
      })
      .catch((err) => console.error(err));

    const setMat = (name: string, mat: THREE.Material) => {
      get(name).traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat;
      });
    };
    setMat(
      'FACE_DISPLAY',
      new THREE.MeshStandardMaterial({
        color: '#0A0F1A',
        roughness: 0.18,
        metalness: 0.35,
        emissive: '#ffffff',
        emissiveMap: face.texture,
        emissiveIntensity: 1.5,
        envMapIntensity: 0.6
      })
    );
    const glow = (map: THREE.Texture, intensity: number) =>
      new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(intensity, intensity, intensity), polygonOffset: true, polygonOffsetFactor: -2 });
    setMat('EAR_L', glow(earL.texture, 1.3));
    setMat('EAR_R', glow(earR.texture, 1.3));
    setMat('CHEST_A', glow(chest.texture, 1));

    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material && (m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const mm = m.material as THREE.MeshStandardMaterial;
        if (mm.name === 'AVA_Shell') {
          mm.envMapIntensity = 1.0;
        }
      }
    });

    // The scanned head is lopsided (it spans x -0.351 to +0.296) and its two ear patches differ in size and depth, so the
    // scanned patches can never look identical. Instead each ear ring is rebuilt here from one shared pattern: the same
    // circle (same height, size and texture) is projected onto the head surface on each side, so the two ears are exact twins
    // from every angle. The scanned patches are hidden.
    scene.updateMatrixWorld(true);
    const neckPitch = get('NECK_PITCH');
    const shellMeshes: THREE.Mesh[] = [];
    get('HEAD_SHELL').traverse((o) => { if ((o as THREE.Mesh).isMesh) shellMeshes.push(o as THREE.Mesh); });
    const shell = shellMeshes[0];
    const shellSide = (shell.material as THREE.Material).side;
    const ray = new THREE.Raycaster();
    const EAR = earSpec;
    const RAD = 18, SEG = 72, LIFT = 0.006;

    // The head has 42,000 triangles and the ear profile needs hundreds of rays, so the rays are cast against just the few
    // triangles around the +X ear (copied into world space) instead of the whole scan.
    const earRegion = (() => {
      const pos = shell.geometry.getAttribute('position');
      const index = shell.geometry.getIndex();
      const count = index ? index.count : pos.count;
      const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      const pad = EAR.r + 0.04;
      const kept: number[] = [];
      for (let i = 0; i < count; i += 3) {
        let inside = true;
        for (let k = 0; k < 3; k++) {
          v[k].fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(shell.matrixWorld);
          if (v[k].x < 0.1 || Math.abs(v[k].y - EAR.cy) > pad || Math.abs(v[k].z - EAR.cz) > pad) { inside = false; break; }
        }
        if (inside) for (let k = 0; k < 3; k++) kept.push(v[k].x, v[k].y, v[k].z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
      return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    })();
    earRegion.updateMatrixWorld(true);
    const earX = (y: number, z: number) => {
      ray.set(new THREE.Vector3(2, y, z), new THREE.Vector3(-1, 0, 0));
      const hit = ray.intersectObject(earRegion, false)[0];
      return hit ? hit.point.x : null;
    };
    const headBox = new THREE.Box3().setFromObject(shell);
    if (headBox.isEmpty() || !earRegion.geometry.getAttribute('position').count) throw new Error('head shell not found under the ears');
    const midX = (headBox.min.x + headBox.max.x) / 2; // the head's own centre line (the scan is not centred on x = 0)

    // The scanned head is lopsided, so its +X half (screen-right) is mirrored onto -X below. Both ears therefore sit on exactly
    // the same surface, and one shared, rotationally symmetric profile measured on that half serves both rings.
    const profile: number[] = [];
    for (let r = 0; r <= RAD; r++) {
      let outer = 0;
      const steps = r === 0 ? 1 : 24;
      for (let k = 0; k < steps; k++) {
        const ang = (k / steps) * Math.PI * 2;
        const y = EAR.cy + Math.sin(ang) * EAR.r * (r / RAD);
        const z = EAR.cz + Math.cos(ang) * EAR.r * (r / RAD);
        const x = earX(y, z);
        if (x !== null) outer = Math.max(outer, Math.abs(x - midX));
      }
      profile.push(outer);
    }
    const smooth = profile.map((_, i) => Math.max(profile[Math.max(0, i - 1)], profile[i], profile[Math.min(RAD, i + 1)]));

    const buildEar = (side: 1 | -1, texture: THREE.Texture) => {
      const positions: number[] = [];
      const uvs: number[] = [];
      const push = (r: number, ang: number) => {
        const y = EAR.cy + Math.sin(ang) * EAR.r * (r / RAD);
        const z = EAR.cz + Math.cos(ang) * EAR.r * (r / RAD);
        const world = new THREE.Vector3(midX + side * (smooth[r] + LIFT), y, z);
        const l = neckPitch.worldToLocal(world);
        positions.push(l.x, l.y, l.z);
        uvs.push(0.5 + (z - EAR.cz) / (2 * EAR.r), 0.5 + (y - EAR.cy) / (2 * EAR.r));
      };
      push(0, 0);
      for (let r = 1; r <= RAD; r++) for (let k = 0; k < SEG; k++) push(r, (k / SEG) * Math.PI * 2);
      const index: number[] = [];
      const at = (r: number, k: number) => 1 + (r - 1) * SEG + (k % SEG);
      for (let k = 0; k < SEG; k++) index.push(0, at(1, k), at(1, k + 1));
      for (let r = 1; r < RAD; r++) {
        for (let k = 0; k < SEG; k++) {
          index.push(at(r, k), at(r + 1, k), at(r + 1, k + 1), at(r, k), at(r + 1, k + 1), at(r, k + 1));
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(index);
      const mat = glow(texture, 1.3);
      mat.side = THREE.DoubleSide;
      mat.polygonOffsetFactor = -4;
      mat.polygonOffsetUnits = -4;
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.name = side > 0 ? 'EAR_RING_L' : 'EAR_RING_R';
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
      neckPitch.add(mesh);

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTexture, color: '#00B2FF', transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending
      }));
      halo.position.copy(neckPitch.worldToLocal(new THREE.Vector3(midX + side * (smooth[0] + LIFT + 0.02), EAR.cy, EAR.cz)));
      halo.scale.setScalar(0.26);
      halo.renderOrder = 6;
      neckPitch.add(halo);
      return halo;
    };

    const haloTexture = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, 'rgba(0,178,255,0.95)');
      grad.addColorStop(0.45, 'rgba(0,178,255,0.45)');
      grad.addColorStop(1, 'rgba(0,178,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();

    // The rebuilt rings are an improvement, never a requirement: if anything about them fails, keep the scanned ear patches
    // and carry on, so a problem here can never take the whole 3D character down.
    let halos: THREE.Sprite[] = [];
    try {
      halos = [buildEar(1, earL.texture), buildEar(-1, earR.texture)];
      get('EAR_L').visible = false;
      get('EAR_R').visible = false;
      mirrorShell(shell, midX, { top: SOCKET_TOP, radius: SOCKET_RADIUS });
      // The visor is now symmetric about the head's centre line (+X half mirrored), so the face display is widened to fill
      // it and centred there.
      const faceNode = get('FACE_DISPLAY');
      const before = new THREE.Box3().setFromObject(faceNode);
      const visorHalf = before.max.x - midX; // the +X half of the visor is the one that was kept
      faceNode.scale.x *= (2 * visorHalf) / (before.max.x - before.min.x);
      faceNode.updateMatrixWorld(true);
      const after = new THREE.Box3().setFromObject(faceNode);
      faceNode.position.x += midX - (after.min.x + after.max.x) / 2;
    } catch (err) {
      console.warn('[AVA] ear rings could not be rebuilt; using the scanned ear patches', err);
      for (const m of neckPitch.children.filter((c) => c.name.startsWith('EAR_RING') || c.type === 'Sprite')) neckPitch.remove(m);
      get('EAR_L').visible = true;
      get('EAR_R').visible = true;
    }

    // Deep gloss black like the reference renders: low metalness so the room reflections do not tint it blue-grey. The scanned
    // black parts (shoulder joints) pick up a grey-blue cast from the room lighting, so they use it too.
    const black = new THREE.MeshStandardMaterial({ color: '#050609', roughness: 0.32, metalness: 0.08, envMapIntensity: 0.35 });
    setMat('SHOULDER_JOINTS', black);

    get('NECK_YAW').position.y += HEAD_LIFT; // before the neck is built, so the neck is measured from the lifted head

    // The scanned neck is a flat, off-centre disc that reads as a grey block. Replace it with the ringed joint from the reference.
    try {
      get('NECK').visible = false;
      const white = new THREE.MeshStandardMaterial({ color: '#f3f5f9', roughness: 0.22, metalness: 0.05, envMapIntensity: 0.9 });
      // On the body, not the head: the head turns and nods on top of the neck, so the neck stays seated instead of swinging with it.
      const base = get('NECK_YAW').position;
      const headBottomWorld = base.y + HEAD_BOTTOM; // base is already lifted
      for (const ring of NECK_STACK) {
        let { h, y } = ring;
        if (ring.name === 'NECK_COLUMN') {
          const bottom = 0.498;
          const top = headBottomWorld + NECK_INTO_HEAD; // ends well inside the head, so the neck and head are one continuous piece with no seam
          h = top - bottom;
          y = (top + bottom) / 2;
        }
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(ring.r, ring.r, h, 64, 1), ring.kind === 'white' ? white : black);
        mesh.name = ring.name;
        mesh.position.set(NECK_X + base.x, y, base.z);
        get('BODY_CTRL').add(mesh);
      }
    } catch (err) {
      console.warn('[AVA] neck collar could not be built; using the scanned neck', err);
      get('NECK').visible = true;
    }

    return {
      scene, face, earL, earR, halos,
      neckYaw: get('NECK_YAW'),
      neckPitch: get('NECK_PITCH'),
      shoulderL: get('SHOULDER_L'),
      shoulderR: get('SHOULDER_R'),
      body: get('BODY_CTRL')
    };
  }, [gltf]);

  const anim = useRef({
    yaw: 0, pitch: 0, roll: 0, shL: 0, shR: 0, bodyYaw: 0,
    prevFace: null as FaceStateId | null, curFace: 'idle' as FaceStateId, faceSince: 0,
    gestureKey: '', gestureSince: 0, explainSide: 1 as 1 | -1, lastExplainCycle: -1
  });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const pr = p.current;
    const a = anim.current;
    const reduced = pr.motion === 'reduced';
    if (root.current) { root.current.visible = pr.visible; root.current.rotation.y = turnDeg * DEG; }

    // --- Face crossfade -----------------------------------------------------------
    if (pr.face !== a.curFace) {
      a.prevFace = a.curFace;
      a.curFace = pr.face;
      a.faceSince = t;
    }
    const fadeMs = 180; // within manifest.faceRendering.crossfadeMs (120-250)
    const blend = Math.min(1, ((t - a.faceSince) * 1000) / fadeMs);
    const gaze = getGaze();
    drawFace(rig.face.ctx, {
      face: a.curFace,
      prev: blend < 1 ? a.prevFace : null,
      blend,
      seconds: t,
      micLevel: getMicLevel(),
      gaze,
      speaking: pr.overlays.speaking,
      reduced,
      sparkle: pr.overlays.sparkle
    });
    rig.face.texture.needsUpdate = true;

    const earLevel = pr.face === 'warning' || pr.face === 'error' || pr.face === 'micDenied' ? 0.45 : pr.face === 'sleeping' ? 0.25 : pr.face === 'listening' ? 0.75 + 0.25 * getMicLevel() : pr.overlays.speaking ? 0.8 + 0.2 * Math.sin(t * 14) : 0.85 + (reduced ? 0 : 0.1 * Math.sin(t * 1.6));
    drawEar(rig.earL.ctx, earLevel);
    drawEar(rig.earR.ctx, earLevel);
    rig.earL.texture.needsUpdate = true;
    rig.earR.texture.needsUpdate = true;
    for (const h of rig.halos) (h.material as THREE.SpriteMaterial).opacity = 0.2 * Math.min(1, earLevel);

    // --- Targets (degrees; shoulder positive = arm raised) -----------------------
    let yawT = 0, pitchT = 0, rollT = 0, shLT = 0, shRT = 0;
    switch (pr.head) {
      case 'listen': pitchT = 3; break;
      case 'think': pitchT = -2; yawT = 3 * Math.sin(t * 1.2); break;
      case 'search': yawT = 9 * Math.sin(t * 1.9); break;
      case 'confirm': rollT = 4; pitchT = 1; break;
    }
    const g = pr.arms.gesture;
    const key = `${g}:${pr.arms.side}`;
    if (key !== a.gestureKey) {
      a.gestureKey = key;
      a.gestureSince = t;
    }
    const since = t - a.gestureSince;
    const gazeSide = nearerArm(gaze);
    const sideOf = (s: string) => (s === 'auto' ? gazeSide : s);
    let shoulderSpeed: number = ENV.shoulderDeg.maxSpeedDegPerSec;

    if (g === 'greet') {
      shRT = 42 + 9 * Math.sin(since * 9) * Math.min(1, since * 3);
    } else if (g === 'explain') {
      const cycle = Math.floor(since / (manifest.timing.explainGestureCooldownMs / 1000 + 0.4));
      if (cycle !== a.lastExplainCycle) {
        a.lastExplainCycle = cycle;
        a.explainSide = (a.explainSide === 1 ? -1 : 1) as 1 | -1;
      }
      const phase = since - cycle * (manifest.timing.explainGestureCooldownMs / 1000 + 0.4);
      const up = phase < 1.5 ? 28 * Math.sin(Math.PI * (phase / 1.5)) : 0;
      if (a.explainSide === 1) shLT = up; else shRT = up;
      yawT = (a.explainSide === 1 ? 5 : -5) * (up / 28);
      pitchT = -2;
    } else if (g === 'guide') {
      const side = sideOf(pr.arms.side);
      const lift = 42 + 3 * Math.sin(since * 3);
      if (side === 'left') shLT = lift; else shRT = lift;
      yawT = gaze * ENV.headYawDeg.routine;
      pitchT = 2;
    } else if (g === 'success') {
      shoulderSpeed = ENV.shoulderDeg.celebrationMaxSpeedDegPerSec;
      const lift = 40 + 4 * Math.sin(since * 12);
      shLT = lift; shRT = lift; pitchT = -5;
    } else if (g === 'warning') {
      shLT = -12; shRT = -12; pitchT = 6;
    } else if (g === 'cancel') {
      shLT = 0; shRT = 0;
    }
    // Speaking fills only the arm channels that nothing else is using.
    if (pr.overlays.speaking && !reduced) {
      if (shLT === 0 && g !== 'greet') shLT = 4 * (0.5 + 0.5 * Math.sin(t * 5.1));
      if (shRT === 0 && g !== 'greet') shRT = 4 * (0.5 + 0.5 * Math.sin(t * 5.1 + 2.1));
      pitchT += 1.5 * Math.sin(t * 6.3);
    }
    if (reduced) { yawT = pitchT = rollT = shLT = shRT = 0; }

    // --- Rate-limited smoothing ---------------------------------------------------
    a.yaw = approach(a.yaw, yawT, ENV.headYawDeg.maxSpeedDegPerSec, dt);
    a.pitch = approach(a.pitch, pitchT, ENV.headPitchDeg.maxSpeedDegPerSec, dt);
    a.roll = approach(a.roll, rollT, 20, dt);
    a.shL = approach(a.shL, shLT, shoulderSpeed, dt);
    a.shR = approach(a.shR, shRT, shoulderSpeed, dt);
    const bodyYawT = pr.hover ? 2 * Math.sin(t * 0.7) : 0;
    a.bodyYaw = approach(a.bodyYaw, bodyYawT, ENV.bodyYawDeg.maxSpeedDegPerSec, dt);

    rig.neckYaw.rotation.y = a.yaw * DEG;
    rig.neckPitch.rotation.x = a.pitch * DEG;
    rig.neckPitch.rotation.z = a.roll * DEG;
    rig.shoulderL.rotation.z = a.shL * DEG;
    rig.shoulderR.rotation.z = -a.shR * DEG;
    rig.body.rotation.y = a.bodyYaw * DEG;

    const cycleMs = ENV.hoverMm.cycleMs[0] + (ENV.hoverMm.cycleMs[1] - ENV.hoverMm.cycleMs[0]) / 2;
    const headWidth = 0.65; // model units, approx
    const amp = (ENV.hoverMm.amplitude / ENV.hoverMm.referenceHeadWidthMm) * headWidth;
    const targetY = pr.hover ? amp * Math.sin((t * 2 * Math.PI * 1000) / cycleMs) : 0;
    if (root.current) root.current.position.y += (targetY - root.current.position.y) * Math.min(1, dt * 6);
  });

  return (
    <>
      <Environment />
      <group ref={root}>
        <primitive object={rig.scene} />
      </group>
      <Halo visible={presentation.visible} />
    </>
  );
}

function Halo({ visible }: { visible: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    ref.current.visible = visible;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.75 + 0.2 * Math.sin(s.clock.elapsedTime * 1.6);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, -0.06, 0.02]}>
      <ringGeometry args={[0.26, 0.3, 96]} />
      <meshBasicMaterial color="#00B2FF" transparent opacity={0.8} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
