import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { cellsOf } from "./pieces";
import { ghostY, type Sim } from "./sim";
import type { Theme } from "./themes";
import { COLS, HIDDEN_ROWS, VISIBLE_ROWS, type PieceId } from "./types";

const MAX_SOLID = COLS * VISIBLE_ROWS + 8;
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
  draw: (sim: Sim | null, shake: number, theme: Theme) => void;
  punch: (amount: number) => void;
  sparkRows: (boardRows: number[], hexCol: string) => void;
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

  const back = new THREE.Mesh(new THREE.BoxGeometry(10.6, 20.8, 0.22), pitMat);
  back.position.set(0, 9.5, -0.72);
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

  const geo = new RoundedBoxGeometry(0.9, 0.9, 0.9, 2, 0.08);
  const solidMat = new THREE.MeshStandardMaterial({
    roughness: 0.22,
    metalness: 0.48,
    envMapIntensity: 1.05,
    emissive: 0x111111,
    emissiveIntensity: 0.18,
  });
  const ghostMat = new THREE.MeshStandardMaterial({
    roughness: 0.2,
    metalness: 0.15,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    emissive: 0xffffff,
    emissiveIntensity: 0.08,
  });
  const solids = new THREE.InstancedMesh(geo, solidMat, MAX_SOLID);
  solids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  solids.frustumCulled = false;
  const ghosts = new THREE.InstancedMesh(geo, ghostMat, MAX_GHOST);
  ghosts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ghosts.frustumCulled = false;
  scene.add(solids, ghosts);

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
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 2);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
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
  ) {
    const p = cellPos(col, row, z);
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.set(hexCol).multiplyScalar(lift);
    mesh.setColorAt(i, color);
  }

  function draw(sim: Sim | null, shake: number, theme: Theme) {
    if (theme.pit !== lastBg) {
      lastBg = theme.pit;
      const bg = hex(theme.pit).multiplyScalar(0.55);
      renderer.setClearColor(bg, 1);
      scene.background = bg;
      scene.fog = new THREE.FogExp2(bg.getHex(), 0.018);
      pitMat.color.copy(hex(theme.well).multiplyScalar(0.55));
      wallMat.color.copy(hex(theme.frame).multiplyScalar(0.45));
    }

    frameCamera();
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.035;
      camera.position.y += (Math.random() - 0.5) * shake * 0.035;
      camera.lookAt(0.05, 9.15 + punch * punch * 0.25, 0);
    }
    bloom.strength = bloomBase + punch * punch * 0.42;

    const now = performance.now();
    const dt = Math.min(0.05, (now - lastDraw) / 1000);
    lastDraw = now;
    if (!reduce) punch = Math.max(0, punch - dt * 3.4);
    else punch = 0;
    stepSparks(dt);

    let n = 0;
    if (sim) {
      for (let y = HIDDEN_ROWS; y < HIDDEN_ROWS + VISIBLE_ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const id = sim.board[y]![x];
          if (!id) continue;
          const row = y - HIDDEN_ROWS;
          const flashing = sim.phase === "clearing" && sim.clearRows.includes(y);
          place(
            solids,
            n++,
            x,
            row,
            0,
            flashing ? theme.flash : theme.fill[id as PieceId],
            flashing ? 0.97 : 1,
            flashing ? 1.8 : 1.12,
          );
        }
      }
      if (sim.piece && sim.phase !== "over" && sim.phase !== "clearing") {
        for (const c of cellsOf(sim.piece.id, sim.piece.rot, sim.piece.x, sim.piece.y)) {
          const row = c.y - HIDDEN_ROWS;
          if (row < 0 || row >= VISIBLE_ROWS) continue;
          place(solids, n++, c.x, row, 0.1, theme.fill[sim.piece.id], 1.03, 1.28);
        }
      }
    }
    solids.count = n;
    solids.instanceMatrix.needsUpdate = true;
    if (solids.instanceColor) solids.instanceColor.needsUpdate = true;

    let g = 0;
    if (sim?.piece && sim.phase !== "over") {
      const gy = ghostY(sim);
      if (gy !== sim.piece.y) {
        for (const c of cellsOf(sim.piece.id, sim.piece.rot, sim.piece.x, gy)) {
          const row = c.y - HIDDEN_ROWS;
          if (row < 0 || row >= VISIBLE_ROWS) continue;
          place(ghosts, g++, c.x, row, 0, theme.fill[sim.piece.id], 0.9, 1.4);
        }
      }
    }
    ghosts.count = g;
    ghosts.instanceMatrix.needsUpdate = true;
    if (ghosts.instanceColor) ghosts.instanceColor.needsUpdate = true;

    composer.render();
  }

  function punchCam(amount: number) {
    if (reduce) return;
    punch = Math.min(1.25, punch + amount);
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
            life: 0.38 + Math.random() * 0.28,
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
    geo.dispose();
    solidMat.dispose();
    ghostMat.dispose();
    wallMat.dispose();
    pitMat.dispose();
    trimMat.dispose();
    solids.dispose();
    ghosts.dispose();
    sparkGeo.dispose();
    sparkMat.dispose();
  }

  resize();
  return { resize, draw, punch: punchCam, sparkRows, clientToCell, dispose };
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
