import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { cellsOf } from "./pieces";
import { fitDpr } from "./device";
import { ghostY, inDanger, type Sim } from "./sim";
import type { Theme } from "./themes";
import type { PowerId } from "./shop";
import { COLS, HIDDEN_ROWS, VISIBLE_ROWS, CLEAR_TIME, LOCK_DELAY, PIECE_IDS, type PieceId } from "./types";

const MAX_SOLID = COLS * VISIBLE_ROWS + 8;
const MARK: Record<PieceId, [number, number][]> = {
  I: [
    [0, 0.2],
    [0, -0.2],
  ],
  O: [[0, 0]],
  T: [
    [0, 0.18],
    [-0.16, -0.12],
    [0.16, -0.12],
  ],
  S: [
    [-0.16, 0.12],
    [0.16, -0.12],
  ],
  Z: [
    [0.16, 0.12],
    [-0.16, -0.12],
  ],
  J: [
    [-0.16, 0.16],
    [-0.16, -0.16],
    [0.12, -0.16],
  ],
  L: [
    [0.16, 0.16],
    [0.16, -0.16],
    [-0.12, -0.16],
  ],
};
const MAX_GHOST = 8;

function hex(c: string) {
  return new THREE.Color(c);
}

function cellPos(col: number, row: number, z = 0) {
  return {
    x: col - (COLS - 1) / 2,
    y: VISIBLE_ROWS - 1 - row,
    z,
  };
}

export type Well3d = {
  resize: () => void;
  draw: (sim: Sim | null, shake: number, theme: Theme, showGhost?: boolean, showMarks?: boolean) => void;
  punch: (amount: number) => void;
  nod: (amount: number) => void;
  sparkRows: (boardRows: number[], hexCol: string) => void;
  lockThump: (cells: { x: number; y: number }[], hexCol: string) => void;
  shatter: (sim: Sim, theme: Theme) => void;
  sweep: (kind: "stack" | "tspin" | "clear" | "single" | "double" | "triple") => void;
  hardStreak: (
    piece: { id: PieceId; rot: number; x: number; y: number },
    toY: number,
    hexCol: string,
  ) => void;
  powerFx: (
    id: PowerId,
    cells?: { x: number; y: number; hexCol: string }[],
  ) => void;
  perfectBurst: () => void;
  softTrail: (piece: { id: PieceId; rot: number; x: number; y: number }, hexCol: string) => void;
  failBeat: () => void;
  clientToCell: (
    rect: DOMRect,
    clientX: number,
    clientY: number,
  ) => { col: number; row: number };
  dispose: () => void;
};

export function createWell3d(canvas: HTMLCanvasElement): Well3d {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x05060a, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = false;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.FogExp2(0x07080c, 0.018);
  scene.background = new THREE.Color(0x05060a);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 90);
  const BASE_FOV = 34;
  let punch = 0;
  let nodT = 0;
  let lastDraw = performance.now();
  const bloomBase = reduce ? 0.12 : mobile ? 0.32 : 0.48;

  function frameCamera() {
    const wellH = 21.6;
    const wellW = 11.6;
    const vFov = (camera.fov * Math.PI) / 180;
    const distH = wellH / 2 / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const distW = wellW / 2 / Math.tan(hFov / 2);
    const dist = Math.max(distH, distW) * 1.12;
    const p = punch * punch;
    camera.fov = BASE_FOV - p * 5;
    camera.updateProjectionMatrix();
    camera.position.set(1.15, 11.4 + p * 0.35, dist - p * 3.4);
    camera.lookAt(0.05, 9.15 + p * 0.25, 0);
  }

  scene.add(new THREE.HemisphereLight(0x8ea4c4, 0x1a1410, 0.55));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.55);
  key.position.set(7, 24, 16);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x6d88b8, 0.42);
  fill.position.set(-12, 8, 8);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xb7d4ff, 0.7);
  rim.position.set(-2, 16, -14);
  scene.add(rim);

  const shaft = new THREE.PointLight(0xffe4c4, 18, 28, 1.6);
  shaft.position.set(0, 20.4, 1.2);
  scene.add(shaft);
  const bounce = new THREE.PointLight(0x3d5a88, 8, 16, 1.8);
  bounce.position.set(0, 0.4, 1.1);
  scene.add(bounce);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x12151c,
    roughness: 0.55,
    metalness: 0.42,
    envMapIntensity: 0.7,
  });
  const pitMat = new THREE.MeshStandardMaterial({
    color: 0x08090d,
    roughness: 0.78,
    metalness: 0.22,
    envMapIntensity: 0.35,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xc8d0dc,
    roughness: 0.28,
    metalness: 0.85,
    envMapIntensity: 1.1,
  });

  const pitTex = makePitTexture();
  pitTex.colorSpace = THREE.SRGBColorSpace;
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(10.2, 20.4),
    new THREE.MeshBasicMaterial({ map: pitTex }),
  );
  back.position.set(0, 9.5, -0.7);
  scene.add(back);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.28, 20.8, 1.55), wallMat);
  left.position.set(-5.28, 9.5, 0.08);
  scene.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.28, 20.8, 1.55), wallMat);
  right.position.set(5.28, 9.5, 0.08);
  scene.add(right);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.28, 1.6), wallMat);
  floor.position.set(0, -0.68, 0.08);
  scene.add(floor);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.14, 0.38), trimMat);
  lip.position.set(0, 19.72, 0.42);
  scene.add(lip);

  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(10.2, 20.4),
    new THREE.MeshBasicMaterial({
      color: 0x6a88b0,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
    }),
  );
  haze.position.set(0, 9.5, -0.55);
  scene.add(haze);

  const grid = makeWellGrid();
  scene.add(grid);

  const geo = new RoundedBoxGeometry(0.94, 0.94, 0.88, 3, 0.15);
  const solidMat = new THREE.MeshPhysicalMaterial({
    roughness: 0.24,
    metalness: 0.5,
    clearcoat: mobile ? 0.4 : 0.8,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.2,
    emissive: 0x141414,
    emissiveIntensity: 0.2,
  });
  const ghostMat = new THREE.MeshPhysicalMaterial({
    roughness: 0.32,
    metalness: 0.28,
    clearcoat: mobile ? 0.2 : 0.45,
    clearcoatRoughness: 0.35,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    envMapIntensity: 0.55,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
  const solids = new THREE.InstancedMesh(geo, solidMat, MAX_SOLID);
  solids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  solids.frustumCulled = false;
  const ghosts = new THREE.InstancedMesh(geo, ghostMat, MAX_GHOST);
  ghosts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ghosts.frustumCulled = false;
  scene.add(solids, ghosts);

  const pipGeo = new THREE.BoxGeometry(0.14, 0.14, 0.05);
  const pipMat = new THREE.MeshBasicMaterial({ color: 0x141414 });
  const pips = new THREE.InstancedMesh(pipGeo, pipMat, MAX_SOLID * 3);
  pips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pips.frustumCulled = false;
  pips.count = 0;
  scene.add(pips);

  const MAX_SPARKS = 180;
  type Spark = {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    r: number;
    g: number;
    b: number;
  };
  const sparks: Spark[] = [];
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkCol = new Float32Array(MAX_SPARKS * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.22,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const sparkPts = new THREE.Points(sparkGeo, sparkMat);
  sparkPts.frustumCulled = false;
  scene.add(sparkPts);

  const MAX_SHARDS = 80;
  const shards = new THREE.InstancedMesh(geo, solidMat, MAX_SHARDS);
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shards.frustumCulled = false;
  shards.count = 0;
  shards.setColorAt(0, new THREE.Color(0xffffff));
  scene.add(shards);

  const MAX_STREAK = 28;
  const streaks = new THREE.InstancedMesh(geo, ghostMat, MAX_STREAK);
  streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  streaks.frustumCulled = false;
  streaks.count = 0;
  streaks.setColorAt(0, new THREE.Color(0xffffff));
  scene.add(streaks);

  const sweepMat = new THREE.MeshBasicMaterial({
    color: 0xf4f1ea,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sweepMesh = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 1.35), sweepMat);
  sweepMesh.position.set(0, 10, 0.55);
  sweepMesh.visible = false;
  scene.add(sweepMesh);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.9, 28), ringMat);
  ring.position.z = 0.42;
  ring.visible = false;
  scene.add(ring);

  const zapMat = new THREE.MeshBasicMaterial({
    color: 0xb8fff8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const zapMesh = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 0.42), zapMat);
  zapMesh.visible = false;
  scene.add(zapMesh);

  const slowMat = new THREE.MeshBasicMaterial({
    color: 0xe8c478,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const slowVeil = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 20.4), slowMat);
  slowVeil.position.set(0, 9.5, 0.62);
  scene.add(slowVeil);

  const dangerMat = new THREE.MeshBasicMaterial({
    color: 0xc23a3a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const dangerVeil = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 20.4), dangerMat);
  dangerVeil.position.set(0, 9.5, 0.58);
  dangerVeil.visible = false;
  scene.add(dangerVeil);

  const pcMat = new THREE.MeshBasicMaterial({
    color: 0xf2efe6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pcFlash = new THREE.Mesh(new THREE.PlaneGeometry(12, 22), pcMat);
  pcFlash.position.set(0, 9.5, 0.7);
  pcFlash.visible = false;
  scene.add(pcFlash);

  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x8ec8ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const shieldShell = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 20.8), shieldMat);
  shieldShell.position.set(0, 9.5, 0.7);
  scene.add(shieldShell);

  let zapT = 0;
  let zapY = 2;
  let quakeT = 0;
  let pickT = 0;
  let pcT = 0;
  let failT = 0;

  type Shard = {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    max: number;
    hexCol: string;
    spin: number;
  };
  const shardList: Shard[] = [];
  type Streak = { x: number; y: number; z: number; life: number; hexCol: string };
  const streakList: Streak[] = [];
  let lockPulse = 0;
  const lockKeys = new Set<string>();
  let sweepT = 0;
  let sweepKind: "stack" | "tspin" | "clear" | "single" | "double" | "triple" | null = null;
  let sparkLifeMul = 1;
  let bloomMul = 1;
  let idleT = 0;
  let lastThemeId = "";

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(512, 512),
    bloomBase,
    0.55,
    0.62,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const hitPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  let lastBg = "";

  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = fitDpr(w, h, mobile);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frameCamera();
  }

  function place(
    mesh: THREE.InstancedMesh,
    i: number,
    col: number,
    row: number,
    z: number,
    hexCol: string,
    scale = 1,
    lift = 1,
    squash = 1,
  ) {
    const p = cellPos(col, row, z);
    dummy.position.set(p.x, p.y - (1 - squash) * 0.18, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(scale * (2 - squash), scale * squash, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.set(hexCol).multiplyScalar(lift);
    mesh.setColorAt(i, color);
  }

  function draw(sim: Sim | null, shake: number, theme: Theme, showGhost = true, showMarks = false) {
    if (theme.id !== lastThemeId) {
      lastThemeId = theme.id;
      lastBg = "";
      const night = theme.id === "night" || theme.id === "neon" || theme.id === "molten";
      sparkLifeMul =
        theme.id === "neon" || theme.id === "molten" ? 1.7 : night ? 1.55 : theme.id === "ice" ? 1.4 : theme.id === "ink" ? 1 : 1.15;
      bloomMul =
        theme.id === "neon"
          ? 1.7
          : theme.id === "ice"
            ? 1.55
            : theme.id === "molten"
              ? 1.55
              : theme.id === "lcd" || theme.id === "monolith"
                ? 0.55
                : night
                  ? 1.35
                  : theme.id === "ink"
                    ? 0.92
                    : 1;
      const fogDen =
        theme.id === "molten" ? 0.034 : theme.id === "ice" ? 0.022 : theme.id === "lcd" ? 0.008 : night ? 0.028 : 0.018;
      scene.fog = new THREE.FogExp2(
        theme.id === "molten" ? 0x2a1208 : theme.id === "ice" ? 0x102028 : hex(theme.pit).getHex(),
        fogDen,
      );
      rim.color.set(
        theme.id === "sakura"
          ? 0xffb8d0
          : theme.id === "molten"
            ? 0xff8a40
            : theme.id === "ice"
              ? 0xc8f0ff
              : theme.id === "neon"
                ? 0xff40d0
                : theme.id === "lcd"
                  ? 0xd8d8b0
                  : night
                    ? 0x8eb4ff
                    : 0xb7d4ff,
      );
      rim.intensity = theme.id === "neon" ? 1.25 : theme.id === "ice" ? 1.05 : theme.id === "molten" ? 1.15 : theme.id === "lcd" ? 0.35 : night ? 0.95 : 0.7;
    }
    if (theme.pit !== lastBg) {
      lastBg = theme.pit;
      const bg =
        theme.id === "molten"
          ? hex("#1a0c06")
          : theme.id === "ice"
            ? hex("#0c141c")
            : hex(theme.pit).multiplyScalar(0.55);
      renderer.setClearColor(bg, 1);
      scene.background = bg;
      pitMat.color.copy(hex(theme.well).multiplyScalar(theme.id === "molten" ? 0.7 : 0.55));
      wallMat.color.copy(hex(theme.frame).multiplyScalar(0.45));
    }

    frameCamera();
    if (nodT > 0) camera.position.y -= nodT * 0.62;
    if (shake > 0 || quakeT > 0) {
      const rumble = shake * 0.035 + quakeT * 0.09;
      camera.position.x += (Math.random() - 0.5) * rumble;
      camera.position.y += (Math.random() - 0.5) * rumble;
      camera.lookAt(0.05, 9.15 + punch * punch * 0.25, 0);
    }
    bloom.strength =
      (bloomBase + punch * punch * 0.42) * bloomMul +
      (sweepT > 0 ? 0.28 : 0) +
      lockPulse * 0.18 +
      zapT * 0.55 +
      (sim && sim.slowT > 0 ? -0.08 : 0);

    const now = performance.now();
    const dt = Math.min(0.05, (now - lastDraw) / 1000);
    lastDraw = now;
    if (!reduce) punch = Math.max(0, punch - dt * 3.4);
    else punch = 0;
    nodT = Math.max(0, nodT - dt * 3.6);
    lockPulse = Math.max(0, lockPulse - dt * 4.6);
    zapT = Math.max(0, zapT - dt * 3.8);
    quakeT = Math.max(0, quakeT - dt * 2.4);
    pickT = Math.max(0, pickT - dt * 3.2);
    pcT = Math.max(0, pcT - dt * 1.8);
    failT = Math.max(0, failT - dt * 1.15);
    stepSparks(dt);
    stepShards(dt);
    stepStreaks(dt);
    stepSweep(dt);
    idleT += dt;

    const title = !sim || sim.phase === "title";
    const clearing = sim?.phase === "clearing";
    const clearEase = clearing
      ? 1 - Math.max(0, Math.min(1, sim.clearT / CLEAR_TIME))
      : 0;
    const settle = 1 - Math.pow(1 - clearEase, 3) + Math.sin(clearEase * Math.PI) * 0.1 * (1 - clearEase);
    const pinch = Math.max(0, 1 - clearEase);

    let n = 0;
    let pipN = 0;
    const stamp = (id: PieceId, col: number, row: number, z: number) => {
      if (!showMarks) return;
      for (const [ox, oy] of MARK[id]) {
        const p = cellPos(col, row, z);
        dummy.position.set(p.x + ox, p.y + oy, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        pips.setMatrixAt(pipN, dummy.matrix);
        pipN += 1;
      }
    };
    if (sim && !title) {
      for (let y = HIDDEN_ROWS; y < HIDDEN_ROWS + VISIBLE_ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const id = sim.board[y]![x];
          if (!id) continue;
          const row = y - HIDDEN_ROWS;
          const dyingRow = clearing && sim.clearRows.includes(y);
          if (dyingRow) {
            if (pinch <= 0.02) continue;
            place(
              solids,
              n++,
              x,
              row,
              0,
              theme.fill[id as PieceId],
              pinch,
              1.2,
              0.55 + pinch * 0.45,
            );
            continue;
          }
          let below = 0;
          if (clearing) {
            for (const cy of sim.clearRows) if (cy > y) below += 1;
          }
          const key = `${x},${y}`;
          const thump = lockKeys.has(key) && lockPulse > 0;
          const pop = thump ? 1 + 0.06 * Math.sin(lockPulse * Math.PI) : 1;
          const squash = thump ? 0.68 + 0.32 * (1 - lockPulse) : 1;
          const sink = failT > 0 ? failT * failT * (0.15 + row * 0.06) : 0;
          place(
            solids,
            n++,
            x,
            row + below * settle + sink,
            0,
            theme.fill[id as PieceId],
            pop,
            failT > 0 ? 0.45 + (1 - failT) * 0.3 : thump ? 1.45 : 1.12,
            squash,
          );
          if (showMarks) stamp(id as PieceId, x, row + below * settle + sink, 0.42);
        }
      }
      if (sim.piece && sim.phase !== "over" && sim.phase !== "clearing") {
        for (const c of cellsOf(sim.piece.id, sim.piece.rot, sim.piece.x, sim.piece.y)) {
          const row = c.y - HIDDEN_ROWS;
          if (row < 0 || row >= VISIBLE_ROWS) continue;
          place(solids, n++, c.x, row, 0.1, theme.fill[sim.piece.id], 1.03 + pickT * 0.22 + sim.lockSpark * 0.1, 1.28 + pickT * 0.5 + sim.lockSpark * 1.1);
          stamp(sim.piece.id, c.x, row, 0.48);
        }
      }
    } else if (!reduce) {
      const pid = PIECE_IDS[Math.floor(idleT / 5.2) % PIECE_IDS.length]!;
      const rot = Math.floor(idleT * 0.55) % 4;
      const bob = 7.2 + Math.sin(idleT * 0.7) * 1.4;
      for (const c of cellsOf(pid, rot as 0 | 1 | 2 | 3, 3, 0)) {
        const p = cellPos(c.x, 8, 0);
        dummy.position.set(p.x * 0.92, bob + (8 - c.y) * 0.95, Math.sin(idleT * 0.5) * 0.35);
        dummy.rotation.set(idleT * 0.35, idleT * 0.55, 0.15);
        dummy.scale.setScalar(1.04);
        dummy.updateMatrix();
        solids.setMatrixAt(n, dummy.matrix);
        color.set(theme.fill[pid]).multiplyScalar(1.2);
        solids.setColorAt(n, color);
        n += 1;
      }
    }
    solids.count = n;
    solids.instanceMatrix.needsUpdate = true;
    pips.count = pipN;
    pips.instanceMatrix.needsUpdate = true;
    if (solids.instanceColor) solids.instanceColor.needsUpdate = true;

    let g = 0;
    let ringOn = false;
    if (
      showGhost &&
      sim?.piece &&
      sim.phase !== "over" &&
      sim.phase !== "clearing" &&
      sim.phase !== "title"
    ) {
      const gy = ghostY(sim);
      const locking = sim.lockT > 0;
      const atRest = gy === sim.piece.y;
      if (!atRest || locking) {
        const pulse = locking
          ? 0.22 +
            0.7 *
              (0.5 +
                0.5 *
                  Math.sin(
                    now * (0.014 + (sim.lockT / LOCK_DELAY) * 0.05),
                  ))
          : 0.52 + 0.3 * (0.5 + 0.5 * Math.sin(now * 0.0036));
        ghostMat.opacity = pulse;
        const mine = theme.deep[sim.piece.id] ?? theme.fill[sim.piece.id];
        const nxt = sim.next[0] ? theme.fill[sim.next[0]] : mine;
        const tint = hex(mine).lerp(hex(nxt), 0.38).getStyle();
        for (const c of cellsOf(sim.piece.id, sim.piece.rot, sim.piece.x, gy)) {
          const row = c.y - HIDDEN_ROWS;
          if (row < 0 || row >= VISIBLE_ROWS) continue;
          place(ghosts, g++, c.x, row, 0.04, tint, 1, locking ? 1.15 : 1);
        }
      }
    }
    ring.visible = ringOn;
    ghosts.count = g;
    ghosts.instanceMatrix.needsUpdate = true;
    if (ghosts.instanceColor) ghosts.instanceColor.needsUpdate = true;

    if (zapT > 0) {
      zapMesh.visible = true;
      zapMesh.position.set(0, zapY, 0.5);
      zapMat.opacity = Math.min(1, zapT * 2.2) * 0.85;
    } else zapMesh.visible = false;

    const paused = sim?.phase === "paused";
    const danger = !!sim && sim.phase === "playing" && inDanger(sim);
    if (paused) {
      dangerVeil.visible = true;
      dangerMat.color.set(0x07080c);
      dangerMat.opacity = 0.42;
    } else {
      dangerMat.color.set(0xc23a3a);
      dangerVeil.visible = danger;
      if (danger) {
        dangerMat.opacity = 0.07 + 0.05 * (0.5 + 0.5 * Math.sin(now * 0.008));
      }
    }

    if (pcT > 0) {
      pcFlash.visible = true;
      pcMat.opacity = Math.min(1, pcT) * 0.55;
    } else pcFlash.visible = false;

    const slowOn = !!sim && sim.slowT > 0 && sim.phase !== "title";
    slowVeil.visible = slowOn;
    if (slowOn) {
      slowMat.opacity = 0.05 + 0.03 * (0.5 + 0.5 * Math.sin(now * 0.004));
    }
    if (paused) {
      shaft.color.set(0x8a8c94);
      shaft.intensity = 8;
    } else if (danger) {
      shaft.color.set(0xff6a5a);
      shaft.intensity = 24;
    } else if (slowOn) {
      shaft.color.set(0xffe0a0);
      shaft.intensity = 22;
    } else {
      shaft.color.set(0xffe4c4);
      shaft.intensity = 18;
    }

    const shieldOn = !!sim && sim.shield && sim.phase !== "title";
    shieldShell.visible = shieldOn;
    if (shieldOn) {
      const p = 0.5 + 0.5 * Math.sin(now * 0.006);
      shieldMat.opacity = 0.07 + p * 0.08;
    }

    composer.render();
  }

  function punchCam(amount: number) {
    if (reduce) return;
    punch = Math.min(1.25, punch + amount);
  }

  function nod(amount: number) {
    if (reduce) return;
    nodT = Math.min(1.1, nodT + amount);
  }

  function sparkRows(boardRows: number[], hexCol: string) {
    if (reduce) return;
    const c = hex(hexCol);
    for (const by of boardRows) {
      const row = by - HIDDEN_ROWS;
      if (row < 0 || row >= VISIBLE_ROWS) continue;
      const y = VISIBLE_ROWS - 1 - row;
      for (let x = 0; x < COLS; x++) {
        for (let k = 0; k < 2; k++) {
          sparks.push({
            x: x - (COLS - 1) / 2 + (Math.random() - 0.5) * 0.45,
            y: y + (Math.random() - 0.5) * 0.25,
            z: 0.35 + Math.random() * 0.2,
            vx: (Math.random() - 0.5) * 5,
            vy: 1.2 + Math.random() * 3.4,
            vz: 0.8 + Math.random() * 2.4,
            life: (0.38 + Math.random() * 0.28) * sparkLifeMul,
            r: c.r,
            g: c.g,
            b: c.b,
          });
        }
      }
    }
    while (sparks.length > MAX_SPARKS) sparks.shift();
  }

  function stepSparks(dt: number) {
    let i = 0;
    while (i < sparks.length) {
      const s = sparks[i]!;
      s.life -= dt;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      s.vy -= 9 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      i += 1;
    }
    const n = sparks.length;
    for (let k = 0; k < n; k++) {
      const s = sparks[k]!;
      sparkPos[k * 3] = s.x;
      sparkPos[k * 3 + 1] = s.y;
      sparkPos[k * 3 + 2] = s.z;
      const fade = Math.min(1, s.life * 3);
      sparkCol[k * 3] = s.r * fade;
      sparkCol[k * 3 + 1] = s.g * fade;
      sparkCol[k * 3 + 2] = s.b * fade;
    }
    sparkGeo.setDrawRange(0, n);
    sparkGeo.attributes.position!.needsUpdate = true;
    sparkGeo.attributes.color!.needsUpdate = true;
    sparkPts.visible = n > 0;
  }

  function lockThump(cells: { x: number; y: number }[], _hexCol: string) {
    if (reduce) return;
    lockKeys.clear();
    for (const c of cells) lockKeys.add(`${c.x},${c.y}`);
    lockPulse = 1;
    punchCam(0.18);
  }

  function shatter(sim: Sim, theme: Theme) {
    if (reduce) return;
    for (const by of sim.clearRows) {
      const row = by - HIDDEN_ROWS;
      if (row < 0 || row >= VISIBLE_ROWS) continue;
      for (let x = 0; x < COLS; x++) {
        const id = sim.board[by]![x] as PieceId | null;
        if (!id) continue;
        const p = cellPos(x, row, 0);
        shardList.push({
          x: p.x,
          y: p.y,
          z: 0.15,
          vx: (Math.random() - 0.5) * 3.2,
          vy: -1.2 - Math.random() * 3.8,
          vz: 0.4 + Math.random() * 1.6,
          life: 0.42 + Math.random() * 0.22 * sparkLifeMul,
          max: 0.55,
          hexCol: theme.fill[id],
          spin: (Math.random() - 0.5) * 8,
        });
      }
    }
    while (shardList.length > MAX_SHARDS) shardList.shift();
  }

  function sweep(kind: "stack" | "tspin" | "clear" | "single" | "double" | "triple") {
    if (reduce) return;
    sweepKind = kind;
    sweepT =
      kind === "single" ? 0.28 : kind === "double" ? 0.2 : kind === "triple" ? 0.32 : kind === "clear" ? 0.22 : 0.38;
    punchCam(kind === "stack" ? 0.35 : kind === "triple" ? 0.28 : 0.18);
  }

  function hardStreak(
    piece: { id: PieceId; rot: number; x: number; y: number },
    toY: number,
    hexCol: string,
  ) {
    if (reduce) return;
    const steps = Math.min(6, Math.max(2, Math.floor((toY - piece.y) / 2)));
    for (let s = 1; s <= steps; s++) {
      const y = piece.y + ((toY - piece.y) * s) / (steps + 1);
      for (const c of cellsOf(piece.id, piece.rot as 0 | 1 | 2 | 3, piece.x, Math.round(y))) {
        const row = c.y - HIDDEN_ROWS;
        if (row < 0 || row >= VISIBLE_ROWS) continue;
        const p = cellPos(c.x, row, 0.05);
        streakList.push({
          x: p.x,
          y: p.y,
          z: p.z,
          life: 0.16 + s * 0.03,
          hexCol,
        });
      }
    }
    while (streakList.length > MAX_STREAK) streakList.shift();
  }

  function burstCells(cells: { x: number; y: number; hexCol: string }[], down = true) {
    for (const c of cells) {
      const row = c.y - HIDDEN_ROWS;
      if (row < 0 || row >= VISIBLE_ROWS) continue;
      const p = cellPos(c.x, row, 0);
      shardList.push({
        x: p.x,
        y: p.y,
        z: 0.15,
        vx: (Math.random() - 0.5) * 3.4,
        vy: down ? -1.4 - Math.random() * 4 : 1.2 + Math.random() * 2.4,
        vz: 0.5 + Math.random() * 1.8,
        life: 0.4 + Math.random() * 0.22 * sparkLifeMul,
        max: 0.55,
        hexCol: c.hexCol,
        spin: (Math.random() - 0.5) * 8,
      });
    }
    while (shardList.length > MAX_SHARDS) shardList.shift();
  }

  function powerFx(
    id: PowerId,
    cells: { x: number; y: number; hexCol: string }[] = [],
  ) {
    if (reduce) return;
    if (id === "zap") {
      burstCells(cells);
      sparkRows(
        [...new Set(cells.map((c) => c.y))],
        "#b8fff8",
      );
      const row = cells[0] ? cells[0].y - HIDDEN_ROWS : 18;
      zapY = VISIBLE_ROWS - 1 - row;
      zapT = 1;
      punchCam(0.45);
    } else if (id === "quake") {
      burstCells(cells);
      sparkRows(
        [...new Set(cells.map((c) => c.y))],
        "#d8c4a0",
      );
      for (let k = 0; k < 28; k++) {
        sparks.push({
          x: (Math.random() - 0.5) * 9,
          y: -0.2 + Math.random() * 0.4,
          z: 0.3 + Math.random() * 0.4,
          vx: (Math.random() - 0.5) * 4,
          vy: 2 + Math.random() * 4,
          vz: Math.random() * 1.5,
          life: 0.45 + Math.random() * 0.25,
          r: 0.82,
          g: 0.72,
          b: 0.52,
        });
      }
      quakeT = 1;
      punchCam(0.85);
    } else if (id === "slow") {
      punchCam(0.12);
    } else if (id === "shield") {
      punchCam(0.2);
      shieldMat.opacity = 0.28;
    } else if (id === "pick") {
      pickT = 1;
      lockThump(cells, cells[0]?.hexCol ?? "#f4e4b0");
      for (const c of cells) {
        const row = c.y - HIDDEN_ROWS;
        if (row < 0 || row >= VISIBLE_ROWS) continue;
        const p = cellPos(c.x, row, 0.2);
        sparks.push({
          x: p.x,
          y: p.y,
          z: p.z,
          vx: (Math.random() - 0.5) * 3,
          vy: 1.5 + Math.random() * 2,
          vz: 0.6 + Math.random() * 1.2,
          life: 0.35 + Math.random() * 0.2,
          r: 0.96,
          g: 0.86,
          b: 0.55,
        });
      }
      punchCam(0.22);
    }
    while (sparks.length > MAX_SPARKS) sparks.shift();
  }

  function stepShards(dt: number) {
    let i = 0;
    while (i < shardList.length) {
      const s = shardList[i]!;
      s.life -= dt;
      if (s.life <= 0) {
        shardList.splice(i, 1);
        continue;
      }
      s.vy -= 18 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      i += 1;
    }
    const n = Math.min(shardList.length, MAX_SHARDS);
    for (let k = 0; k < n; k++) {
      const s = shardList[k]!;
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(s.spin * (s.max - s.life), s.spin * 0.6, 0);
      dummy.scale.setScalar(Math.max(0.15, s.life / s.max));
      dummy.updateMatrix();
      shards.setMatrixAt(k, dummy.matrix);
      color.set(s.hexCol).multiplyScalar(1.25);
      shards.setColorAt(k, color);
    }
    shards.count = n;
    shards.instanceMatrix.needsUpdate = true;
    if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
  }

  function stepStreaks(dt: number) {
    let i = 0;
    while (i < streakList.length) {
      const s = streakList[i]!;
      s.life -= dt;
      if (s.life <= 0) {
        streakList.splice(i, 1);
        continue;
      }
      i += 1;
    }
    const n = Math.min(streakList.length, MAX_STREAK);
    for (let k = 0; k < n; k++) {
      const s = streakList[k]!;
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.82);
      dummy.updateMatrix();
      streaks.setMatrixAt(k, dummy.matrix);
      color.set(s.hexCol).multiplyScalar(0.7 * Math.min(1, s.life * 6));
      streaks.setColorAt(k, color);
    }
    streaks.count = n;
    streaks.instanceMatrix.needsUpdate = true;
    if (streaks.instanceColor) streaks.instanceColor.needsUpdate = true;
  }

  function stepSweep(dt: number) {
    if (sweepT <= 0 || !sweepKind) {
      sweepMesh.visible = false;
      return;
    }
    const max =
      sweepKind === "single"
        ? 0.28
        : sweepKind === "double"
          ? 0.2
          : sweepKind === "triple"
            ? 0.32
            : sweepKind === "clear"
              ? 0.22
              : 0.38;
    sweepT = Math.max(0, sweepT - dt);
    const u = 1 - sweepT / max;
    sweepMesh.visible = true;
    sweepMesh.position.y = 19.2 - u * 20.4;
    const fade = 1 - u;
    sweepMat.opacity =
      sweepKind === "stack"
        ? 0.5 * fade
        : sweepKind === "triple"
          ? 0.38 * fade
          : sweepKind === "double"
            ? 0.3 * fade
            : 0.2 * fade;
    sweepMat.color.set(
      sweepKind === "tspin"
        ? 0xc9d6ea
        : sweepKind === "stack"
          ? 0xf7f4ee
          : sweepKind === "triple"
            ? 0xd4c4f0
            : sweepKind === "double"
              ? 0xe8d4a0
              : 0xa8b4c4,
    );
  }

  function softTrail(
    piece: { id: PieceId; rot: number; x: number; y: number },
    hexCol: string,
  ) {
    if (reduce) return;
    for (const c of cellsOf(piece.id, piece.rot as 0 | 1 | 2 | 3, piece.x, piece.y)) {
      const row = c.y - HIDDEN_ROWS - 1;
      if (row < 0 || row >= VISIBLE_ROWS) continue;
      const p = cellPos(c.x, row, 0.04);
      streakList.push({
        x: p.x,
        y: p.y,
        z: p.z,
        life: 0.12,
        hexCol,
      });
    }
    while (streakList.length > MAX_STREAK) streakList.shift();
  }

  function failBeat() {
    failT = 1;
    punchCam(0.55);
  }

  function perfectBurst() {
    if (reduce) return;
    pcT = 1;
    punchCam(0.7);
    sweep("stack");
  }

  function clientToCell(rect: DOMRect, clientX: number, clientY: number) {
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(hitPlane, hit)) {
      return { col: -1, row: -1 };
    }
    const col = Math.round(hit.x + (COLS - 1) / 2);
    const row = Math.round(VISIBLE_ROWS - 1 - hit.y);
    return { col, row };
  }

  function dispose() {
    composer.dispose();
    renderer.dispose();
    envTex.dispose();
    pitTex.dispose();
    back.geometry.dispose();
    (back.material as THREE.Material).dispose();
    geo.dispose();
    solidMat.dispose();
    ghostMat.dispose();
    wallMat.dispose();
    pitMat.dispose();
    trimMat.dispose();
    solids.dispose();
    ghosts.dispose();
    pipGeo.dispose();
    pipMat.dispose();
    pips.dispose();
    sparkGeo.dispose();
    sparkMat.dispose();
    sweepMat.dispose();
    sweepMesh.geometry.dispose();
    ringMat.dispose();
    ring.geometry.dispose();
    zapMat.dispose();
    zapMesh.geometry.dispose();
    slowMat.dispose();
    slowVeil.geometry.dispose();
    dangerMat.dispose();
    dangerVeil.geometry.dispose();
    pcMat.dispose();
    pcFlash.geometry.dispose();
    shieldMat.dispose();
    shieldShell.geometry.dispose();
    shards.dispose();
    streaks.dispose();
  }

  resize();
  return {
    resize,
    draw,
    punch: punchCam,
    nod,
    sparkRows,
    lockThump,
    shatter,
    sweep,
    hardStreak,
    powerFx,
    perfectBurst,
    softTrail,
    failBeat,
    clientToCell,
    dispose,
  };
}

function makeWellGrid() {
  const pts: number[] = [];
  const z = -0.58;
  for (let x = 0; x <= COLS; x++) {
    const px = x - COLS / 2;
    pts.push(px, 0, z, px, VISIBLE_ROWS, z);
  }
  for (let y = 0; y <= VISIBLE_ROWS; y++) {
    pts.push(-COLS / 2, y, z, COLS / 2, y, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.LineBasicMaterial({
    color: 0x3a4a62,
    transparent: true,
    opacity: 0.38,
  });
  return new THREE.LineSegments(g, m);
}

function makePitTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0a0b10";
  ctx.fillRect(0, 0, w, h);
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, "#161920");
  wash.addColorStop(0.4, "#0c0d12");
  wash.addColorStop(1, "#07080c");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  const moon = ctx.createRadialGradient(w * 0.7, h * 0.2, 6, w * 0.7, h * 0.2, w * 0.4);
  moon.addColorStop(0, "rgba(220, 216, 204, 0.38)");
  moon.addColorStop(0.4, "rgba(168, 166, 156, 0.12)");
  moon.addColorStop(1, "rgba(10, 11, 16, 0)");
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(190, 186, 176, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const y = h * 0.54 + i * 13;
    ctx.beginPath();
    ctx.moveTo(10, y);
    for (let x = 10; x < w - 10; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.07 + i) * 1.2);
    }
    ctx.stroke();
  }
  const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.7);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  return new THREE.CanvasTexture(c);
}
