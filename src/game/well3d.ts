import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cellsOf } from "./pieces";
import { ghostLook, pieceTone } from "./piece-tone";
import { fitDpr } from "./device";
import { DANGER_ROWS, ghostY, headroom, type Sim } from "./sim";
import type { Theme } from "./themes";
import type { PowerId } from "./shop";
import { COLS, HIDDEN_ROWS, ROWS, VISIBLE_ROWS, CLEAR_TIME, LOCK_DELAY, PIECE_IDS, type PieceId } from "./types";

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
const MAX_GLOW = 16;
const MAX_MEM = COLS * VISIBLE_ROWS;

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

export type ClearKind = "single" | "double" | "triple" | "stack" | "tspin";

export type Well3d = {
  resize: () => void;
  draw: (sim: Sim | null, shake: number, theme: Theme, showGhost?: boolean, showMarks?: boolean) => void;
  punch: (amount: number, force?: boolean) => void;
  nod: (amount: number, force?: boolean) => void;
  setAsh: (board: import("./sim").Board | null) => void;
  setStain: (cells: { x: number; y: number }[] | null) => void;
  setClear: (on: boolean) => void;
  sparkRows: (boardRows: number[], hexCol: string) => void;
  lockThump: (cells: { x: number; y: number }[], hexCol: string, slam?: boolean) => void;
  clearFlash: (boardRows: number[], kind: ClearKind) => void;
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
  teachTrail: (cells: { x: number; y: number }[], hexCol: string) => void;
  failBeat: (overflowRow?: number) => void;
  clientToCell: (
    rect: DOMRect,
    clientX: number,
    clientY: number,
  ) => { col: number; row: number };
  /** Client point of a visible cell's front face, for QA sampling. */
  cellToClient: (rect: DOMRect, col: number, row: number) => { x: number; y: number };
  /** Stack cells drawn last frame at full size, with their (possibly mid-drop) row. */
  stackCells: () => { x: number; y: number; id: PieceId }[];
  lost: () => boolean;
  cellsDrawn: () => number;
  sampleLuma: () => number;
  setCalm: (on: boolean) => void;
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
  // ACES bleaches saturated minos toward white; Neutral keeps each piece's hue.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = false;

  const EXPOSURE = 1.18;
  const HEMI_I = 0.62;
  const KEY_I = 1.7;
  const FILL_I = 0.38;
  const RIM_I = 0.85;
  const ENV_I = reduce ? 0.4 : 0.92;
  const FOG_D = 0.012;
  const LIP_GLOW = 0.7;
  const TRIM_GLOW = mobile ? 0.4 : 0.32;
  /** Clear well keeps a softer glow than the full look, but a glow. */
  const CLEAR_BLOOM = reduce ? 0.12 : 0.3;
  /** HDR luminance of the hidden glow cells behind the live piece and fresh locks. */
  const GLOW_LUMA = 1.5;
  const PLACED_LIFT = 1;
  const LIVE_LIFT = 1.15;
  const POP_LIFT = 1.35;

  let dead = false;
  let lastCells = 0;
  let calm = false;
  let useComposer = true;
  let drawN = 0;
  const onContextLost = (e: Event) => {
    e.preventDefault();
    dead = true;
  };
  const onContextRestored = () => {
    dead = true;
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.environmentIntensity = reduce ? 0.4 : 0.92;
  scene.fog = new THREE.FogExp2(0x0a0c12, 0.012);
  scene.background = new THREE.Color(0x08090e);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 90);
  const BASE_FOV = 34;
  let punch = 0;
  let nodT = 0;
  let ashBoard: import("./sim").Board | null = null;
  let ashT = 0;
  let stainCells: { x: number; y: number }[] = [];
  let lastDraw = performance.now();
  // Phones keep real bloom: minos draw after it, so it only costs frame time.
  const bloomBase = reduce ? 0.14 : mobile ? 0.5 : 0.62;
  let clearLook = false;

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

  const hemi = new THREE.HemisphereLight(0xb8c0cc, 0x121018, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff6e0, 1.85);
  key.position.set(5.5, 22, 14);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x6a7a90, 0.32);
  fill.position.set(-14, 9, 9);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xe8c46a, 0.7);
  rim.position.set(-2, 18, -16);
  scene.add(rim);

  const shaft = new THREE.PointLight(0xffe8b0, 14, 28, 1.5);
  shaft.position.set(0, 20.6, 1.4);
  scene.add(shaft);
  const bounce = new THREE.PointLight(0x2a3040, 7, 16, 1.7);
  bounce.position.set(0, 0.2, 1.4);
  scene.add(bounce);
  const jewel = new THREE.PointLight(0xffffff, 9, 12, 2);
  jewel.position.set(0, 6, 3.2);
  scene.add(jewel);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x8a909c,
    roughness: 0.38,
    metalness: 0.88,
    envMapIntensity: 1.15,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xe8c46a,
    roughness: 0.22,
    metalness: 0.92,
    emissive: 0x5a3c08,
    emissiveIntensity: 0.22,
    envMap: envTex,
    envMapIntensity: 1.5,
  });
  const themeTrim = new THREE.Color(0xa8f0ff);
  const themeShaft = new THREE.Color(0xd8e4f0);
  const accent = new THREE.Color(0xa8f0ff);
  const accentGoal = new THREE.Color(0xa8f0ff);

  const pitTex = makePitTexture();
  pitTex.colorSpace = THREE.SRGBColorSpace;
  const backMat = new THREE.MeshBasicMaterial({ map: pitTex });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 20.4), backMat);
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
  // The lip sits right over the spawn rows, so a mirror finish there blooms
  // straight across the falling piece. It glows in the trim colour instead.
  const lipMat = new THREE.MeshStandardMaterial({
    roughness: 0.4,
    metalness: 0.5,
    envMap: envTex,
    envMapIntensity: 0.15,
  });
  const lip = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.14, 0.38), lipMat);
  lip.position.set(0, 19.72, 0.42);
  scene.add(lip);
  const leftGold = new THREE.Mesh(new THREE.BoxGeometry(0.07, 20.6, 1.2), trimMat);
  leftGold.position.set(-5.08, 9.5, 0.38);
  scene.add(leftGold);
  const rightGold = new THREE.Mesh(new THREE.BoxGeometry(0.07, 20.6, 1.2), trimMat);
  rightGold.position.set(5.08, 9.5, 0.38);
  scene.add(rightGold);
  const floorGold = new THREE.Mesh(new THREE.BoxGeometry(10.7, 0.08, 1.2), trimMat);
  floorGold.position.set(0, -0.48, 0.38);
  scene.add(floorGold);

  const godMat = new THREE.MeshBasicMaterial({
    map: makeShaftTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const god = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 18.5), godMat);
  god.position.set(0.4, 10.2, 0.35);
  god.visible = !reduce;
  scene.add(god);

  const hazeMat = new THREE.MeshBasicMaterial({
    color: 0xe8c46a,
    transparent: true,
    opacity: 0.04,
    depthWrite: false,
  });
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 20.4), hazeMat);
  haze.position.set(0, 9.5, -0.55);
  scene.add(haze);

  const grid = makeWellGrid();
  scene.add(grid);
  const gridTint = new THREE.Color(0xb8923a);

  /** A cyan grid vanishes on a pale skin, so light pits get dark lines instead. */
  function applyWellLines(theme?: Theme) {
    if (theme) {
      const pale = hex(theme.well).getHSL({ h: 0, s: 0, l: 0 }).l > 0.35;
      if (pale) gridTint.copy(hex(theme.grid)).multiplyScalar(0.5);
      else gridTint.set(0x4ad4e8);
    }
    const gm = grid.material as THREE.LineBasicMaterial;
    gm.opacity = clearLook ? 0.12 : 0.38;
    if (clearLook) gm.color.set(0x2a3038);
    else gm.color.copy(gridTint);
    hazeMat.color.copy(gridTint);
  }
  const ticks = makeSprintTicks();
  ticks.visible = false;
  scene.add(ticks);

  const geo = new RoundedBoxGeometry(0.94, 0.94, 0.88, 3, 0.15);
  // Minos, the ghost and the piece marks are drawn in their own pass straight
  // to the screen, after bloom and tone mapping, with no lights, fog or
  // environment. Their face colour is exactly pieceTone(), so no skin, light,
  // veil, bloom setting or GPU can wash them out.
  const front = new THREE.Scene();
  const gemMat = makeGemMaterial();
  const overlayMat = new THREE.MeshPhysicalMaterial({
    roughness: 0.22,
    metalness: 0.18,
    clearcoat: mobile ? 0.25 : 0.55,
    clearcoatRoughness: 0.22,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    envMapIntensity: 0.55,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
  // Each overlay owns its material: opacity is per-material, so sharing one
  // would let whichever layer drew last flatten the others.
  // Ash and stains must never read as playable cells: flat, dim, no highlight.
  const memMat = overlayMat.clone();
  memMat.opacity = 0.16;
  memMat.clearcoat = 0;
  memMat.roughness = 0.6;
  memMat.envMapIntensity = 0.15;
  const streakMat = overlayMat.clone();
  streakMat.opacity = 0.5;
  // A clean outline with nothing inside, so the ghost never passes for a locked mino.
  const ghostEdgeMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
  });
  const ghostEdgeGeo = makeCellOutline(0.92, 0.11, 0.08);

  const solids = new THREE.InstancedMesh(geo, gemMat, MAX_SOLID);
  solids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  solids.frustumCulled = false;
  const live = new THREE.InstancedMesh(geo, gemMat, MAX_GHOST);
  live.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  live.frustumCulled = false;
  live.count = 0;
  // Bright copies of the live piece and fresh locks, only in the bloomed scene:
  // bloom spreads them into a halo in the piece colour, and the mino drawn on
  // top in the front pass hides the copy itself, so the face never brightens.
  const glowMat = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false });
  const glowCells = new THREE.InstancedMesh(geo, glowMat, MAX_GLOW);
  glowCells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glowCells.frustumCulled = false;
  glowCells.count = 0;
  scene.add(glowCells);
  const ghosts = new THREE.InstancedMesh(ghostEdgeGeo, ghostEdgeMat, MAX_GHOST);
  ghosts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ghosts.frustumCulled = false;
  ghosts.renderOrder = 1;
  const memory = new THREE.InstancedMesh(geo, memMat, MAX_MEM);
  memory.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  memory.frustumCulled = false;
  memory.count = 0;
  scene.add(memory);
  front.add(solids, live, ghosts);

  const pipGeo = new THREE.BoxGeometry(0.14, 0.14, 0.05);
  const pipMat = new THREE.MeshBasicMaterial({ color: 0x141414, toneMapped: false });
  const pips = new THREE.InstancedMesh(pipGeo, pipMat, MAX_SOLID * 3);
  pips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pips.frustumCulled = false;
  pips.count = 0;
  front.add(pips);

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
  // Always in the draw list (empty draw range when idle): hiding it pushed the
  // PointsMaterial compile onto the first zap or top-out.
  sparkGeo.setDrawRange(0, 0);
  scene.add(sparkPts);

  const MAX_SHARDS = 80;
  const shards = new THREE.InstancedMesh(geo, gemMat, MAX_SHARDS);
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shards.frustumCulled = false;
  shards.count = 0;
  shards.setColorAt(0, new THREE.Color(0xffffff));
  front.add(shards);

  const MAX_STREAK = 28;
  const streaks = new THREE.InstancedMesh(geo, streakMat, MAX_STREAK);
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

  // Line clears: a glow behind each cleared row and one blade across it, all in
  // one additive draw. Per-cell shards and sparks were the phone's worst frames.
  // It stays in the scene at count 0 so its shader compiles before the first clear.
  const MAX_CLEAR_ROWS = 4;
  const clearFxMat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const clearFx = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), clearFxMat, MAX_CLEAR_ROWS * 2);
  clearFx.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  clearFx.frustumCulled = false;
  clearFx.count = 0;
  clearFx.setColorAt(0, new THREE.Color(0x000000));
  scene.add(clearFx);
  const clearTint = new THREE.Color();
  const clearYs: number[] = [];
  let clearFxT = 0;
  let clearFxMax = 0;
  let clearFxKind: ClearKind = "single";

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
  let teachT = 0;
  let teachHex = "#8aa0b8";
  let teachCells: { x: number; y: number }[] = [];

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
  let sweepKind: "stack" | "tspin" | "clear" | null = null;
  let sparkLifeMul = 1;
  let bloomMul = 1;
  let idleT = 0;
  let lastThemeId = "";

  const composer = useComposer ? new EffectComposer(renderer) : null;
  const bloom = useComposer
    ? new UnrealBloomPass(new THREE.Vector2(512, 512), bloomBase, 0.42, 0.72)
    : null;
  if (composer && bloom) {
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const hitPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  let lastBg = "";
  const drawnStack: { x: number; y: number; id: PieceId }[] = [];

  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = fitDpr(w, h, mobile);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    if (composer && bloom) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      // Full-canvas bloom is what stalled the phone; a capped buffer still glows.
      bloom.resolution.set(Math.min(w, mobile ? 384 : 640), Math.min(h, mobile ? 384 : 640));
    }
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
    ox = 0,
  ) {
    const cap = mesh.instanceMatrix.array.length / 16;
    if (i < 0 || i >= cap) return;
    const p = cellPos(col, row, z);
    dummy.position.set(p.x + ox, p.y - (1 - squash) * 0.18, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(scale * (2 - squash), scale * squash, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    toneInto(hexCol, lift);
    mesh.setColorAt(i, color);
  }

  function toneInto(hexCol: string, lift: number) {
    const t = pieceTone(hexCol, lift);
    color.setRGB(t.r, t.g, t.b, THREE.SRGBColorSpace);
  }

  function draw(sim: Sim | null, shake: number, theme: Theme, showGhost = true, showMarks = false) {
    if (dead) return;
    try {
    if ((++drawN & 31) === 0) {
      try {
        if (renderer.getContext().isContextLost()) {
          dead = true;
          return;
        }
      } catch {
        dead = true;
        return;
      }
    }
    if (theme.id !== lastThemeId) {
      lastThemeId = theme.id;
      lastBg = "";
      const night = theme.id === "night" || theme.id === "neon" || theme.id === "molten";
      sparkLifeMul =
        theme.id === "neon" || theme.id === "molten" ? 1.7 : night ? 1.55 : theme.id === "ice" ? 1.4 : theme.id === "ink" ? 1 : 1.15;
      bloomMul =
        theme.id === "neon" && !clearLook
          ? 1.2
          : theme.id === "night" && !clearLook
            ? 1.05
            : theme.id === "ice" && !clearLook
              ? 0.7
              : theme.id === "molten" && !clearLook
                ? 0.7
                : theme.id === "lcd" || theme.id === "monolith"
                  ? 0.4
                  : 0.48;
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
      rim.intensity = theme.id === "neon" ? 1.45 : theme.id === "ice" ? 1.25 : theme.id === "molten" ? 1.35 : theme.id === "lcd" ? 0.4 : night ? 1.15 : 0.85;
      if (theme.id === "neon") {
        hemi.color.set(0x88c8ff);
        hemi.groundColor.set(0x180818);
        key.color.set(0xe8f4ff);
        fill.color.set(0xff48c8);
        shaft.color.set(0x66f0ff);
        bounce.color.set(0xff40b8);
        jewel.color.set(0xb8ffff);
        trimMat.color.set(0xc8f8ff);
        godMat.opacity = reduce ? 0.12 : 0.26;
      } else if (theme.id === "molten") {
        hemi.color.set(0xffc090);
        hemi.groundColor.set(0x1a0804);
        key.color.set(0xffd0a0);
        fill.color.set(0xff6020);
        shaft.color.set(0xff8a40);
        bounce.color.set(0xff4010);
        jewel.color.set(0xffe0b0);
        trimMat.color.set(0xffb070);
        godMat.opacity = 0.14;
      } else if (theme.id === "ice") {
        hemi.color.set(0xd0f0ff);
        hemi.groundColor.set(0x081018);
        key.color.set(0xf4fcff);
        fill.color.set(0x80c8e8);
        shaft.color.set(0xc8f0ff);
        bounce.color.set(0x6090b0);
        jewel.color.set(0xffffff);
        trimMat.color.set(0xe0f4ff);
        godMat.opacity = 0.1;
      } else if (theme.id === "lcd") {
        hemi.color.set(0xc8c8a8);
        hemi.groundColor.set(0x18180e);
        key.color.set(0xd8d8b0);
        fill.color.set(0x6a7048);
        shaft.color.set(0xb8b890);
        bounce.color.set(0x4a5038);
        jewel.color.set(0xe8e8c8);
        trimMat.color.set(0xd0d0b0);
        godMat.opacity = 0.04;
      } else if (theme.id === "citrine") {
        hemi.color.set(0xffe8a8);
        hemi.groundColor.set(0x181208);
        key.color.set(0xffe8c0);
        fill.color.set(0xc89030);
        shaft.color.set(0xffd24a);
        bounce.color.set(0x8a7030);
        jewel.color.set(0xfff0c8);
        trimMat.color.set(0xffe08a);
        godMat.opacity = 0.12;
      } else if (theme.id === "blood") {
        hemi.color.set(0xffa0a8);
        hemi.groundColor.set(0x140408);
        key.color.set(0xffd0d0);
        fill.color.set(0xc02838);
        shaft.color.set(0xff6070);
        bounce.color.set(0x801020);
        jewel.color.set(0xffc0c0);
        trimMat.color.set(0xff8890);
        godMat.opacity = 0.12;
      } else {
        hemi.color.set(0x9aa8bc);
        hemi.groundColor.set(0x141018);
        key.color.set(0xf2f4f8);
        fill.color.set(0x6a7a98);
        shaft.color.set(0xd8e4f0);
        bounce.color.set(0x3a4a62);
        jewel.color.set(0xffffff);
        trimMat.color.set(0xa8f0ff);
        godMat.opacity = reduce ? 0.05 : 0.1;
      }
      applyWellLines(theme);
      themeTrim.copy(trimMat.color);
      themeShaft.copy(shaft.color);
    }
    if (theme.pit !== lastBg) {
      lastBg = theme.pit;
      const bg =
        theme.id === "molten"
          ? hex("#24140c")
          : theme.id === "ice"
            ? hex("#141c26")
            : hex(theme.pit).multiplyScalar(0.88);
      renderer.setClearColor(bg, 1);
      scene.background = bg;
      // The pit art is greyscale, so the skin's frame colour is what you see.
      backMat.color.copy(hex(theme.frame)).multiplyScalar(2.2);
      wallMat.color.copy(hex(theme.frame).multiplyScalar(0.7));
    }

    ticks.visible = sim?.mode === "sprint" && sim.phase !== "title";
    const liveId = sim?.piece?.id;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastDraw) / 1000);
    lastDraw = now;

    // The cabinet, lip, shaft and jewel light take the falling piece's colour
    // and hold it until the next one spawns. Minos are drawn after this pass,
    // so none of it can reach a mino face.
    if (!sim || sim.phase === "title") accentGoal.copy(themeTrim);
    else if (sim.piece && sim.phase !== "over") {
      const t = pieceTone(sim.omenOn ? "#e8c46a" : theme.fill[sim.piece.id], LIVE_LIFT);
      accentGoal.setRGB(t.r, t.g, t.b, THREE.SRGBColorSpace);
    }
    accent.lerp(accentGoal, reduce ? 1 : 1 - Math.exp(-dt * 9));
    trimMat.color.copy(accent).multiplyScalar(mobile ? 0.5 : 0.62);
    trimMat.emissive.copy(accent);
    trimMat.emissiveIntensity = TRIM_GLOW;
    trimMat.envMapIntensity = mobile ? 0.55 : 0.8;
    lipMat.color.copy(accent).multiplyScalar(0.45);
    lipMat.emissive.copy(accent);
    lipMat.emissiveIntensity = LIP_GLOW;
    jewel.color.copy(accent);
    godMat.color.copy(accent);
    if (!clearLook) (grid.material as THREE.LineBasicMaterial).color.copy(gridTint).lerp(accent, 0.45);

    frameCamera();
    if (nodT > 0) camera.position.y -= nodT * 0.62;
    if (shake > 0 || quakeT > 0) {
      const rumble = shake * 0.035 + quakeT * 0.09;
      camera.position.x += (Math.random() - 0.5) * rumble;
      camera.position.y += (Math.random() - 0.5) * rumble;
      camera.lookAt(0.05, 9.15 + punch * punch * 0.25, 0);
    }
    if (bloom) {
      bloom.strength =
        (clearLook ? CLEAR_BLOOM : Math.max(CLEAR_BLOOM, bloomBase * bloomMul)) +
        punch * punch * (clearLook ? 0.14 : 0.42) * bloomMul +
        (sweepT > 0 ? 0.1 : 0) +
        lockPulse * 0.18 +
        zapT * 0.55 +
        (sim && sim.slowT > 0 ? -0.08 : 0);
    }

    if (!reduce) punch = Math.max(0, punch - dt * 3.4);
    else punch = 0;
    nodT = Math.max(0, nodT - dt * 3.6);
    lockPulse = Math.max(0, lockPulse - dt * 4.6);
    zapT = Math.max(0, zapT - dt * 3.8);
    quakeT = Math.max(0, quakeT - dt * 2.4);
    pickT = Math.max(0, pickT - dt * 3.2);
    pcT = Math.max(0, pcT - dt * 1.8);
    failT = Math.max(0, failT - dt * 0.8);
    teachT = Math.max(0, teachT - dt * 1.15);
    stepSparks(dt);
    stepShards(dt);
    stepStreaks(dt);
    stepSweep(dt);
    stepClearFx(dt);
    idleT += dt;

    const title = !sim || sim.phase === "title";
    const clearing = sim?.phase === "clearing";
    const clearEase = clearing
      ? 1 - Math.max(0, Math.min(1, sim.clearT / CLEAR_TIME))
      : 0;
    const flatten = Math.max(0, 1 - clearEase * 1.25);
    const dropT = Math.max(0, (clearEase - 0.38) / 0.62);
    const settle = 1 - Math.pow(1 - dropT, 3);

    let n = 0;
    let liveN = 0;
    let pipN = 0;
    let glowN = 0;
    const glow = (col: number, row: number, z: number, hexCol: string, k: number) => {
      if (glowN >= MAX_GLOW || k <= 0.01) return;
      const p = cellPos(col, row, z);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.92);
      dummy.updateMatrix();
      glowCells.setMatrixAt(glowN, dummy.matrix);
      toneInto(hexCol, LIVE_LIFT);
      const l = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
      color.multiplyScalar((k * GLOW_LUMA) / Math.max(l, 0.08));
      glowCells.setColorAt(glowN, color);
      glowN += 1;
    };
    drawnStack.length = 0;
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
            if (flatten <= 0.04) continue;
            place(
              solids,
              n++,
              x,
              row,
              0.04,
              theme.fill[id as PieceId],
              flatten,
              POP_LIFT,
              1,
              0,
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
            failT > 0 ? 0.45 + (1 - failT) * 0.3 : thump ? PLACED_LIFT + (POP_LIFT - PLACED_LIFT) * lockPulse : PLACED_LIFT,
            squash,
          );
          if (showMarks) stamp(id as PieceId, x, row + below * settle + sink, 0.42);
          if (thump) glow(x, row + below * settle + sink, 0, theme.fill[id as PieceId], lockPulse);
          drawnStack.push({ x, y: row + below * settle + sink, id: id as PieceId });
        }
      }
      if (sim.piece && sim.phase !== "over" && sim.phase !== "clearing") {
        const omen = !!sim.omenOn;
        const liveHex = omen ? "#e8c46a" : theme.fill[sim.piece.id];
        const liveLift = LIVE_LIFT + (POP_LIFT - LIVE_LIFT) * Math.min(1, pickT + sim.lockSpark);
        for (const c of cellsOf(sim.piece.id, sim.piece.rot, sim.piece.x, sim.piece.y)) {
          const row = c.y - HIDDEN_ROWS;
          if (row < 0 || row >= VISIBLE_ROWS) continue;
          place(live, liveN++, c.x, row, 0.1, liveHex, 1.06 + pickT * 0.22 + sim.lockSpark * 0.1 + (omen ? 0.08 : 0), liveLift);
          glow(c.x, row, 0.1, liveHex, 0.7 + 0.3 * Math.min(1, pickT + sim.lockSpark));
          stamp(sim.piece.id, c.x, row, 0.48);
        }
        for (const c of cellsOf(sim.piece.id, sim.piece.rot, sim.piece.x, sim.piece.y)) {
          const row = c.y - HIDDEN_ROWS;
          if (row < 0 || row >= VISIBLE_ROWS) continue;
          if (n >= MAX_SOLID) break;
          place(solids, n++, c.x, row, 0.02, theme.fill[sim.piece.id], 1.14, 0.55);
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
        toneInto(theme.fill[pid], 1.2);
        solids.setColorAt(n, color);
        n += 1;
      }
    }
    solids.count = n;
    solids.instanceMatrix.needsUpdate = true;
    glowCells.count = glowN;
    glowCells.instanceMatrix.needsUpdate = true;
    if (glowCells.instanceColor) glowCells.instanceColor.needsUpdate = true;
    live.count = liveN;
    live.instanceMatrix.needsUpdate = true;
    if (live.instanceColor) live.instanceColor.needsUpdate = true;
    pips.count = pipN;
    pips.instanceMatrix.needsUpdate = true;
    if (solids.instanceColor) solids.instanceColor.needsUpdate = true;

    let m = 0;
    if (!title) {
      for (const c of stainCells) {
        if (m >= MAX_MEM) break;
        place(memory, m++, c.x, c.y, -0.08, "#2a2018", 1, 0.55);
      }
      if (ashBoard && ashT > 0 && sim?.phase === "over") {
        ashT = Math.max(0, ashT - dt * 0.14);
        for (let y = HIDDEN_ROWS; y < ROWS && m < MAX_MEM; y++) {
          const row = y - HIDDEN_ROWS;
          for (let x = 0; x < COLS; x++) {
            const id = ashBoard[y]?.[x];
            if (!id) continue;
            if (m >= MAX_MEM) break;
            place(memory, m++, x, row, -0.02, theme.deep[id] ?? "#333", 1, 0.5 * ashT);
          }
        }
      }
      if (teachT > 0 && sim?.phase !== "over") {
        for (const c of teachCells) {
          if (m >= MAX_MEM) break;
          const row = c.y - HIDDEN_ROWS;
          if (row < 0 || row >= VISIBLE_ROWS) continue;
          place(memory, m++, c.x, row, 0.05, teachHex, 1, 0.28 + 0.35 * teachT);
        }
      }
    }
    memory.count = m;
    memory.instanceMatrix.needsUpdate = true;
    if (memory.instanceColor) memory.instanceColor.needsUpdate = true;

    let g = 0;
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
        const look = ghostLook(theme.fill[sim.piece.id], theme.pit, now, locking ? sim.lockT / LOCK_DELAY : null);
        ghostEdgeMat.opacity = look.edge;
        color.setRGB(look.tone.r, look.tone.g, look.tone.b, THREE.SRGBColorSpace);
        for (const c of cellsOf(sim.piece.id, sim.piece.rot, sim.piece.x, gy)) {
          const row = c.y - HIDDEN_ROWS;
          if (row < 0 || row >= VISIBLE_ROWS || g >= MAX_GHOST) continue;
          const p = cellPos(c.x, row, 0.4);
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          ghosts.setMatrixAt(g, dummy.matrix);
          ghosts.setColorAt(g, color);
          g += 1;
        }
      }
    }
    ghosts.count = g;
    ghosts.instanceMatrix.needsUpdate = true;
    if (ghosts.instanceColor) ghosts.instanceColor.needsUpdate = true;
    if (zapT > 0) {
      zapMesh.visible = true;
      zapMesh.position.set(0, zapY, 0.5);
      zapMat.opacity = Math.min(1, zapT * 2.2) * 0.85;
    } else zapMesh.visible = false;

    const paused = sim?.phase === "paused";
    // 0 while there is room, 1 when the stack is at the lip.
    const heat =
      sim && sim.phase === "playing"
        ? Math.max(0, Math.min(1, (DANGER_ROWS - headroom(sim)) / DANGER_ROWS))
        : 0;
    const danger = heat > 0;
    const dying = failT > 0 && sim?.phase === "over";
    if (paused) {
      dangerVeil.visible = true;
      dangerMat.color.set(0x07080c);
      dangerMat.opacity = 0.42;
    } else if (dying) {
      // The red does not blink out at the moment it was finally right.
      dangerVeil.visible = true;
      dangerMat.color.set(0xd8402c);
      dangerMat.opacity = 0.34 * failT;
    } else {
      dangerMat.color.set(0xc23a3a);
      dangerVeil.visible = danger;
      if (danger) {
        // Behind the stack now, so it can carry more red without touching a mino.
        const beat = 0.008 + heat * 0.014;
        dangerMat.opacity =
          0.08 + heat * 0.18 + (0.04 + heat * 0.08) * (0.5 + 0.5 * Math.sin(now * beat));
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
    const lushShaft = !clearLook && (theme.id === "night" || theme.id === "neon");
    if (paused) {
      shaft.color.set(0x8a8c94);
      shaft.intensity = 6;
    } else if (dying) {
      shaft.color.set(0xff5040);
      shaft.intensity = (lushShaft ? 22 : 12) * failT;
    } else if (danger) {
      shaft.color.set(0xff6a5a);
      shaft.intensity = (lushShaft ? 18 : 9) * (0.55 + heat * 0.45);
    } else if (slowOn) {
      shaft.color.set(0xffe0a0);
      shaft.intensity = lushShaft ? 16 : 8;
    } else if (liveId) {
      shaft.color.copy(themeShaft).lerp(accent, 0.6);
      shaft.intensity = lushShaft ? 16 : 7;
    } else {
      shaft.color.set(0xffe4c4);
      shaft.intensity = lushShaft ? 12 : 6;
    }

    const shieldOn = !!sim && sim.shield && sim.phase !== "title";
    shieldShell.visible = shieldOn;
    if (shieldOn) {
      const p = 0.5 + 0.5 * Math.sin(now * 0.006);
      shieldMat.opacity = 0.07 + p * 0.08;
    }

    lastCells = n + liveN;
    if (calm) {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1.22;
      hemi.intensity = 1.28;
      key.intensity = 2.85;
      fill.intensity = 0.9;
      rim.intensity = 1.5;
      scene.environmentIntensity = reduce ? 0.8 : 1.5;
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.0028;
      shaft.intensity *= 2.05;
      jewel.intensity = 20;
      bounce.intensity = 18;
      godMat.opacity = reduce ? 0.12 : 0.24;
      hazeMat.opacity = 0.12;
    } else {
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = EXPOSURE;
      hemi.intensity = HEMI_I;
      key.intensity = KEY_I;
      fill.intensity = FILL_I;
      rim.intensity = RIM_I;
      scene.environmentIntensity = ENV_I;
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density = FOG_D;
      jewel.intensity = 8;
      bounce.intensity = 8;
    }
    renderFrame();
    } catch {
      try {
        useComposer = false;
        renderFrame();
      } catch {
        dead = true;
      }
    }
  }

  function renderFrame() {
    if (calm || !useComposer || !composer) renderer.render(scene, camera);
    else composer.render();
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(front, camera);
    renderer.autoClear = true;
  }

  function punchCam(amount: number, force = false) {
    if (calm && !force) return;
    if (reduce && !force) return;
    punch = Math.min(1.25, punch + amount);
  }

  function nod(amount: number, force = false) {
    if (reduce && !force) return;
    nodT = Math.min(1.1, nodT + amount);
  }

  function sparkRows(boardRows: number[], hexCol: string) {
    if (reduce || calm) return;
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
  }

  function lockThump(cells: { x: number; y: number }[], _hexCol: string, slam = true) {
    lockKeys.clear();
    for (const c of cells) lockKeys.add(`${c.x},${c.y}`);
    lockPulse = slam ? 1 : 0.28;
    if (slam) punchCam(0.28, true);
  }

  function clearFlash(boardRows: number[], kind: ClearKind) {
    clearYs.length = 0;
    for (const by of boardRows) {
      const row = by - HIDDEN_ROWS;
      if (row < 0 || row >= VISIBLE_ROWS || clearYs.length >= MAX_CLEAR_ROWS) continue;
      clearYs.push(VISIBLE_ROWS - 1 - row);
    }
    clearFxKind = kind;
    const big = kind === "stack" || kind === "tspin";
    clearFxMax = CLEAR_TIME + (big ? 0.14 : 0.04);
    clearFxT = clearYs.length ? clearFxMax : 0;
    clearTint.set(
      kind === "stack" ? 0xfff4e0 : kind === "tspin" || kind === "triple" ? 0xdccef8 : 0xf2e8cc,
    );
  }

  function stepClearFx(dt: number) {
    if (clearFxT <= 0) {
      clearFx.count = 0;
      return;
    }
    clearFxT = Math.max(0, clearFxT - dt);
    const u = 1 - clearFxT / clearFxMax;
    const big = clearFxKind === "stack" || clearFxKind === "tspin";
    // Reduced motion gets one soft swell on the rows and no moving blade.
    const soft = reduce || calm;
    // Peaks stay under the bloom threshold so the glow does not spill onto the
    // stack; only the blade is allowed to bloom.
    const glow = soft
      ? 0.34 * Math.sin(Math.PI * u)
      : (big ? 0.84 : clearFxKind === "triple" ? 0.76 : 0.68) * (1 - u) * (1 - u);
    let k = 0;
    for (let i = 0; i < clearYs.length; i++) {
      const y = clearYs[i]!;
      dummy.position.set(0, y, -0.5);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(COLS, 0.96, 1);
      dummy.updateMatrix();
      clearFx.setMatrixAt(k, dummy.matrix);
      color.copy(clearTint).multiplyScalar(glow);
      clearFx.setColorAt(k, color);
      k += 1;
      if (soft) continue;
      // Rows cascade so a Tetris reads as one cut through the stack, not four.
      const lag = i * (big ? 0.07 : 0.05);
      const s = Math.max(0, Math.min(1, (u - lag) / 0.62));
      if (s <= 0 || s >= 1) continue;
      const travel = 1 - (1 - s) * (1 - s);
      const dir = clearFxKind === "tspin" ? -1 : 1;
      const half = COLS / 2 + 0.4;
      dummy.position.set(dir * (-half + travel * half * 2), y, 0.5);
      dummy.scale.set(big ? 0.36 : 0.24, 1.02, 1);
      dummy.updateMatrix();
      clearFx.setMatrixAt(k, dummy.matrix);
      color.copy(clearTint).multiplyScalar((big ? 1.9 : 1.3) * (1 - s * 0.55));
      clearFx.setColorAt(k, color);
      k += 1;
    }
    clearFx.count = k;
    clearFx.instanceMatrix.needsUpdate = true;
    if (clearFx.instanceColor) clearFx.instanceColor.needsUpdate = true;
  }

  function sweep(kind: "stack" | "tspin" | "clear" | "single" | "double" | "triple") {
    if (reduce || calm) return;
    // Smaller clears already get clearFlash's blade; a second band over the
    // whole well only reads as clutter there.
    if (kind === "stack" || kind === "tspin" || kind === "clear") {
      sweepKind = kind;
      sweepT = kind === "clear" ? 0.22 : 0.36;
    }
    punchCam(
      kind === "tspin" ? 0.38 : kind === "stack" ? 0.34 : kind === "triple" ? 0.14 : kind === "double" ? 0.1 : 0.06,
    );
  }

  function hardStreak(
    piece: { id: PieceId; rot: number; x: number; y: number },
    toY: number,
    hexCol: string,
  ) {
    if (calm) return;
    const steps = Math.min(8, Math.max(2, Math.floor((toY - piece.y) / 2) || 2));
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
      toneInto(s.hexCol, POP_LIFT);
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
    const max = sweepKind === "clear" ? 0.22 : 0.38;
    sweepT = Math.max(0, sweepT - dt);
    const u = 1 - sweepT / max;
    sweepMesh.visible = true;
    sweepMesh.position.y = 19.2 - u * 20.4;
    const fade = 1 - u;
    sweepMat.opacity = sweepKind === "stack" ? 0.5 * fade : 0.2 * fade;
    sweepMat.color.set(sweepKind === "tspin" ? 0xc9d6ea : sweepKind === "stack" ? 0xf7f4ee : 0xa8b4c4);
  }

  function teachTrail(cells: { x: number; y: number }[], hexCol: string) {
    if (reduce || cells.length === 0) return;
    teachCells = cells.slice(0, 40);
    teachHex = hexCol;
    teachT = 1;
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

  /** `overflowRow` is the board row the stack died on, so the sparks land there. */
  function failBeat(overflowRow?: number) {
    failT = 1;
    punchCam(0.55);
    nod(0.6);
    if (overflowRow != null) sparkRows([overflowRow], "#ff6a5a");
  }

  function perfectBurst() {
    if (reduce) return;
    pcT = 1;
    punchCam(0.38);
    sweep("clear");
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

  function cellToClient(rect: DOMRect, col: number, row: number) {
    const p = cellPos(col, row, 0.44);
    const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  }

  function dispose() {
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    composer?.dispose();
    renderer.dispose();
    envTex.dispose();
    pitTex.dispose();
    back.geometry.dispose();
    (back.material as THREE.Material).dispose();
    geo.dispose();
    gemMat.dispose();
    glowMat.dispose();
    glowCells.dispose();
    overlayMat.dispose();
    ghostEdgeMat.dispose();
    ghostEdgeGeo.dispose();
    memMat.dispose();
    streakMat.dispose();
    wallMat.dispose();
    trimMat.dispose();
    lipMat.dispose();
    solids.dispose();
    live.dispose();
    ghosts.dispose();
    memory.dispose();
    pipGeo.dispose();
    pipMat.dispose();
    pips.dispose();
    sparkGeo.dispose();
    sparkMat.dispose();
    sweepMat.dispose();
    sweepMesh.geometry.dispose();
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
    clearFx.geometry.dispose();
    clearFxMat.dispose();
    clearFx.dispose();
  }

  resize();
  return {
    resize,
    draw,
    punch: punchCam,
    nod,
    setAsh: (board) => {
      ashBoard = board;
      ashT = board ? 1 : 0;
    },
    setStain: (cells) => {
      stainCells = cells ?? [];
    },
    setClear: (on: boolean) => {
      if (clearLook === on) return;
      clearLook = on;
      lastThemeId = "";
      applyWellLines();
    },
    sparkRows,
    lockThump,
    clearFlash,
    sweep,
    hardStreak,
    powerFx,
    perfectBurst,
    softTrail,
    teachTrail,
    failBeat,
    clientToCell,
    cellToClient,
    stackCells: () => drawnStack.slice(),
    lost: () => {
      if (dead) return true;
      try {
        return renderer.getContext().isContextLost();
      } catch {
        return true;
      }
    },
    cellsDrawn: () => lastCells,
    sampleLuma: () => {
      if (dead) return 0;
      try {
        renderFrame();
        const gl = renderer.getContext();
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        if (w < 16 || h < 16) return 0;
        const sw = Math.min(12, w);
        const sh = Math.min(8, h);
        const buf = new Uint8Array(4 * sw * sh);
        let best = 0;
        for (const ny of [0.1, 0.18, 0.28, 0.4, 0.52]) {
          const x = Math.max(0, Math.floor(w * 0.5 - sw / 2));
          const y = Math.max(0, Math.min(h - sh, Math.floor(h * ny)));
          gl.readPixels(x, y, sw, sh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          let sum = 0;
          const n = sw * sh;
          for (let i = 0; i < n; i++) {
            const o = i * 4;
            sum += 0.2126 * buf[o] + 0.7152 * buf[o + 1] + 0.0722 * buf[o + 2];
          }
          if (n) best = Math.max(best, sum / n);
        }
        return best;
      } catch {
        return 0;
      }
    },
    setCalm: (on: boolean) => {
      if (on === calm) return;
      if (on) {
        sparks.length = 0;
        shardList.length = 0;
        streakList.length = 0;
        clearFxT = 0;
        punch = 0;
        nodT = 0;
      }
      calm = on;
    },
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
    color: 0x4ad4e8,
    transparent: true,
    opacity: 0.38,
  });
  return new THREE.LineSegments(g, m);
}

/**
 * Unlit bevelled gem. The front face is the instance colour exactly; bevels
 * only darken (below) or brighten a little (above), and a small glint sits on
 * the upper bevel, never the face. Not tone mapped, not fogged.
 */
function makeGemMaterial() {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    fog: false,
    lights: false,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vCol;
      varying float vFaceY;
      void main() {
        mat4 im = mat4(1.0);
        #ifdef USE_INSTANCING
          im = instanceMatrix;
        #endif
        vCol = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #endif
        vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
        vFaceY = position.y / 0.47;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * im * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vCol;
      varying float vFaceY;
      void main() {
        vec3 n = normalize(vN);
        float face = smoothstep(0.92, 0.99, n.z);
        float bevel = mix(0.6, 0.98, clamp(n.z, 0.0, 1.0)) + 0.26 * n.y;
        float sheen = 1.0 + 0.07 * vFaceY;
        float shade = mix(bevel, sheen, face);
        vec3 col = vCol * pow(max(shade, 0.0), 2.2);
        float glint = pow(max(dot(n, normalize(vec3(-0.35, 0.75, 0.55))), 0.0), 18.0) * (1.0 - face);
        col += glint * 0.22;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** A square frame around one cell, facing the camera. */
function makeCellOutline(size: number, bar: number, depth: number) {
  const h = size / 2 - bar / 2;
  const bars = [
    [0, h, size, bar],
    [0, -h, size, bar],
    [-h, 0, bar, size - bar * 2],
    [h, 0, bar, size - bar * 2],
  ].map(([x, y, w, ht]) => new THREE.BoxGeometry(w, ht, depth).translate(x!, y!, 0));
  const merged = mergeGeometries(bars)!;
  for (const b of bars) b.dispose();
  return merged;
}

function makeSprintTicks() {
  const pts: number[] = [];
  const z = -0.52;
  for (const y of [5, 10, 15]) {
    pts.push(-COLS / 2, y, z, COLS / 2, y, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.LineBasicMaterial({
    color: 0xe8c46a,
    transparent: true,
    opacity: 0.45,
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
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, "#141820");
  wash.addColorStop(0.45, "#0c1018");
  wash.addColorStop(1, "#080a10");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h * 0.12, 8, w / 2, h * 0.12, w * 0.55);
  glow.addColorStop(0, "rgba(232, 196, 106, 0.16)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.72);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  return new THREE.CanvasTexture(c);
}

function makeShaftTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(w / 2, 0, w / 2, h);
  g.addColorStop(0, "rgba(255, 255, 255, 0.45)");
  g.addColorStop(0.28, "rgba(220, 220, 220, 0.12)");
  g.addColorStop(1, "rgba(20, 24, 40, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const side = ctx.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, "rgba(0,0,0,0.85)");
  side.addColorStop(0.45, "rgba(0,0,0,0)");
  side.addColorStop(0.55, "rgba(0,0,0,0)");
  side.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
