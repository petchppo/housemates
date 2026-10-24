"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { ApplianceId } from "@/domain/appliances";
import "./household-scene-3d.css";

type RegionTheme = "coastal" | "garden" | "tropical" | "urban" | "nordic" | "dry";
type ResidenceType = "apartment" | "townhouse" | "detached";
type WeatherKind = "clear" | "cloudy" | "rain" | "snow";
type Props = {
  selected: ApplianceId;
  onSelect: (id: ApplianceId) => void;
  hour: number;
  activeIds: ApplianceId[];
  scrollProgress: number;
  regionTheme?: RegionTheme;
  residenceType?: ResidenceType;
  visibleAppliances?: readonly ApplianceId[];
  construction?: { level: 0 | 1 | 2 | 3; replayKey: number };
  weatherKind?: WeatherKind;
  onConstructionComplete?: () => void;
};
type Command = "left" | "right" | "up" | "down" | "in" | "out" | "reset";
type Character = { entrance: THREE.Group; group: THREE.Group; eyes: THREE.Group; asleep: THREE.Group; ring: THREE.Mesh; indicator: THREE.Mesh; baseY: number; sleepBlend: number };
const names: Record<ApplianceId, string> = { evie: "Evie", bubbles: "Bubbles", chill: "Chill" };
const palette = { ink: 0x342b46, cream: 0xfff0d6, lilac: 0xbca1df, mint: 0xaed8a1, peach: 0xf3af88, roof: 0xa980aa, lawn: 0xb6cb87 };

function nightWeight(hour: number) {
  const localHour = ((hour % 24) + 24) % 24;
  if (localHour < 5 || localHour >= 21) return 1;
  if (localHour < 8) return 1 - THREE.MathUtils.smoothstep(localHour, 5, 8);
  return THREE.MathUtils.smoothstep(localHour, 18, 21);
}

/** Original procedural geometry. All displayed appliance activity is simulated. */
export function HouseholdScene3D({ selected, onSelect, hour, activeIds, scrollProgress, regionTheme, residenceType, visibleAppliances, construction, weatherKind, onConstructionComplete }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef<Props>({ selected, onSelect, hour, activeIds, scrollProgress, regionTheme, residenceType, visibleAppliances, construction, weatherKind, onConstructionComplete });
  const buildCommand = useRef<(action: "skip" | "replay") => void>(() => {});
  const command = useRef<(action: Command) => void>(() => {});
  const [unavailable, setUnavailable] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [focused, setFocused] = useState(false);
  const night = hour % 24 >= 20 || hour % 24 < 6;
  const twilight = (hour % 24 >= 5 && hour % 24 < 8) || (hour % 24 >= 18 && hour % 24 < 21);

  useEffect(() => { latest.current = { selected, onSelect, hour, activeIds, scrollProgress, regionTheme, residenceType, visibleAppliances, construction, weatherKind, onConstructionComplete }; }, [selected, onSelect, hour, activeIds, scrollProgress, regionTheme, residenceType, visibleAppliances, construction, weatherKind, onConstructionComplete]);

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { queueMicrotask(() => setUnavailable(true)); return; }
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Interactive 3D simulated household. Drag to turn the front view, use arrow keys to rotate, plus and minus to zoom, Home to reset. Select appliances with the buttons below.");
    canvas.setAttribute("role", "img");
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    mount.appendChild(canvas);
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    scene.add(world);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(12, 10, 16);
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enableZoom = false;
    controls.minDistance = 10;
    controls.maxDistance = 50;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI / 2.15;
    // Keep the appliance-facing facade visible, including during manual drag.
    controls.minAzimuthAngle = -0.2;
    controls.maxAzimuthAngle = 1.05;
    controls.update();
    controls.saveState();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motion.matches;
    const motionChange = () => { reduced = motion.matches; controls.enableDamping = !reduced; };
    motion.addEventListener("change", motionChange);
    motionChange();
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    const textures = new Set<THREE.Texture>();
    const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const value = new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true, ...extra });
      materials.add(value); return value;
    };
    const ink = mat(palette.ink), cream = mat(palette.cream), lilac = mat(palette.lilac), mint = mat(palette.mint);
    const evieGreen = mat(0xb9d681), chillBlue = mat(0xa9d4e2);
    const peach = mat(palette.peach), roof = mat(palette.roof), bark = mat(0x936a5d), green = mat(0x7ca66b);
    const darkGlass = mat(0x537981, { metalness: 0.25, roughness: 0.3 });
    const glass = mat(0xf6dda0, { emissive: 0xffbc65, emissiveIntensity: 0 });
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      geometries.add(geometry); const value = new THREE.Mesh(geometry, material);
      value.position.set(x, y, z); value.castShadow = true; value.receiveShadow = true; parent.add(value); return value;
    };
    const box = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
    const roundedBox = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, radius = 0.08) => mesh(new RoundedBoxGeometry(w, h, d, 1, radius), material, parent, x, y, z);
    const cylinder = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, r: number, h: number, sides = 8) => mesh(new THREE.CylinderGeometry(r, r, h, sides), material, parent, x, y, z);
    const ball = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, radius: number) => mesh(new THREE.IcosahedronGeometry(radius, 0), material, parent, x, y, z);
    const label = (text: string, color: string, width = 256) => {
      const sheet = document.createElement("canvas"); sheet.width = width; sheet.height = 96;
      const ctx = sheet.getContext("2d");
      if (ctx) { ctx.font = "bold 44px monospace"; ctx.textAlign = "center"; ctx.strokeStyle = color === "#342b46" ? "#fff9e9" : "#342b46"; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.strokeText(text, width / 2, 64); ctx.fillStyle = color; ctx.fillText(text, width / 2, 64); }
      const texture = new THREE.CanvasTexture(sheet); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false }); materials.add(material);
      const sprite = new THREE.Sprite(material); sprite.scale.set(width / 125, 0.77, 1); return sprite;
    };
    const grouped = (parent: THREE.Object3D = world) => { const value = new THREE.Group(); parent.add(value); return value; };
    const groundGroup = grouped(), pathGroup = grouped(), decorGroup = grouped();
    const landscapes = Object.fromEntries((["garden", "coastal", "tropical", "urban", "nordic", "dry"] as RegionTheme[]).map((key) => [key, grouped()])) as Record<RegionTheme, THREE.Group>;
    const lawnMaterial = mat(palette.lawn);
    // A floating, fully modeled garden island, not a billboard.
    box(groundGroup, mat(0x947d74), 0, -0.4, 0, 10.6, 0.65, 8.6);
    box(groundGroup, lawnMaterial, 0, -0.03, 0, 10.8, 0.18, 8.8);
    box(pathGroup, mat(0xd5c4a9), -2.8, 0.085, 2.1, 3.2, 0.08, 4.2);
    for (let i = 0; i < 5; i++) box(pathGroup, cream, -0.3, 0.1, 1.4 + i * 0.57, 0.8, 0.09, 0.38);
    const home = grouped(); home.position.set(0.25, 0, -1.6);
    const detachedRoof = grouped(); detachedRoof.position.copy(home.position);
    box(home, cream, 0, 1.2, 0, 4.1, 2.4, 3.1);
    box(home, mat(0xe7cfb8), 0, 0.2, 0, 4.3, 0.4, 3.3);
    // Gabled roof is an extruded triangle, with real back and side faces.
    const triangle = new THREE.Shape(); triangle.moveTo(-2.4, 0); triangle.lineTo(0, 1.55); triangle.lineTo(2.4, 0); triangle.closePath();
    const roofMesh = mesh(new THREE.ExtrudeGeometry(triangle, { depth: 3.7, bevelEnabled: false }), roof, detachedRoof, 0, 2.4, -1.85);
    roofMesh.castShadow = true;
    box(detachedRoof, peach, 1.15, 3.25, -0.9, 0.48, 1.45, 0.55);
    box(detachedRoof, ink, 1.15, 4, -0.9, 0.6, 0.13, 0.67);
    // Windows on every facade keep a full orbit rewarding.
    for (const z of [-1.57, 1.57]) for (const x of [-1.25, 1.25]) {
      box(home, ink, x, 1.48, z, 0.92, 1.05, 0.09);
      box(home, glass, x, 1.48, z * 1.035, 0.76, 0.87, 0.07);
      box(home, cream, x, 1.48, z * 1.065, 0.055, 0.9, 0.04);
      box(home, cream, x, 1.48, z * 1.065, 0.8, 0.055, 0.04);
    }
    for (const x of [-2.08, 2.08]) {
      box(home, ink, x, 1.48, 0, 0.09, 1.05, 1.2);
      box(home, glass, x * 1.025, 1.48, 0, 0.07, 0.87, 1.04);
      box(home, cream, x * 1.05, 1.48, 0, 0.04, 0.9, 0.06);
    }
    box(home, lilac, -0.05, 0.88, 1.59, 0.73, 1.65, 0.13);
    ball(home, ink, 0.16, 0.85, 1.69, 0.055);
    box(home, cream, -0.05, 0.14, 1.94, 1.15, 0.24, 0.6);
    // Solar cells follow the roof's right-hand slope.
    const panels = new THREE.Group(); panels.position.set(1.22, 3.24, -0.1); panels.rotation.z = -Math.atan(1.55 / 2.4); detachedRoof.add(panels);
    for (let x = 0; x < 2; x++) for (let z = 0; z < 3; z++) {
      box(panels, ink, (x - 0.5) * 0.67, 0, (z - 1) * 0.9, 0.62, 0.07, 0.85);
      box(panels, darkGlass, (x - 0.5) * 0.67, 0.045, (z - 1) * 0.9, 0.55, 0.03, 0.78);
    }
    for (const [x, z, size] of [[-4.3, -2.7, 1.1], [4.3, -2.6, 1.2], [4.65, -0.65, 0.65], [-4.4, 3.1, 0.55]]) {
      cylinder(landscapes.garden, bark, x, 0.8 * size, z, 0.16 * size, 1.6 * size);
      ball(landscapes.garden, green, x, 2 * size, z, 0.9 * size); ball(landscapes.garden, mint, x - 0.3 * size, 2.7 * size, z, 0.66 * size);
    }
    for (let i = 0; i < 13; i++) box(decorGroup, cream, -4.8 + i * 0.8, 0.48, -4, 0.14, 0.85, 0.14);
    for (const y of [0.3, 0.65]) box(decorGroup, cream, 0, y, -4, 9.8, 0.12, 0.1);
    for (let i = 0; i < 11; i++) {
      const x = 1.1 + (i % 5) * 0.63, z = 3.5 - Math.floor(i / 5) * 0.38;
      cylinder(decorGroup, green, x, 0.23, z, 0.025, 0.35, 4);
      ball(decorGroup, i % 2 ? lilac : peach, x, 0.43, z, 0.14);
      ball(decorGroup, cream, x, 0.53, z, 0.06);
    }
    // Regional silhouettes change the scene's geometry, not only its tint.
    const stone = mat(0xb4a99d), sand = mat(0xe9cf9f), evergreen = mat(0x668b79), concrete = mat(0xc6c6bd);
    const treeSites = [[-4.25, -2.7, 1], [4.25, -2.6, 1.1], [4.65, -0.65, 0.65], [-4.4, 3.1, 0.5]];
    for (const [x, z, size] of treeSites) {
      const palm = grouped(landscapes.tropical); palm.position.set(x, 0, z);
      const trunk = cylinder(palm, bark, 0, 1.2 * size, 0, 0.13 * size, 2.4 * size, 7); trunk.rotation.z = 0.1;
      for (let i = 0; i < 6; i++) {
        const frond = ball(palm, i % 2 ? green : mint, Math.sin(i * Math.PI / 3) * 0.55 * size, 2.5 * size, Math.cos(i * Math.PI / 3) * 0.55 * size, 0.7 * size);
        frond.scale.set(0.35, 0.12, 1.65); frond.rotation.y = i * Math.PI / 3;
      }
      ball(palm, bark, 0.16 * size, 2.35 * size, 0, 0.16 * size);
      const pine = grouped(landscapes.nordic); pine.position.set(x, 0, z);
      cylinder(pine, bark, 0, 0.55 * size, 0, 0.12 * size, 1.1 * size);
      for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry((0.88 - i * 0.19) * size, 1.25 * size, 6), i === 2 ? mint : evergreen, pine, 0, (1.1 + i * 0.65) * size, 0);
      const cityTree = grouped(landscapes.urban); cityTree.position.set(x, 0, z);
      box(cityTree, concrete, 0, 0.2, 0, 1.1 * size, 0.4, 1.1 * size);
      cylinder(cityTree, bark, 0, 1.1 * size, 0, 0.11, 1.8 * size);
      roundedBox(cityTree, green, 0, 2.05 * size, 0, 1.1 * size, 1.2 * size, 1.05 * size, 0.15);
      const coastalTree = grouped(landscapes.coastal); coastalTree.position.set(x, 0, z);
      const coastalTrunk = cylinder(coastalTree, bark, 0, 0.8 * size, 0, 0.11 * size, 1.6 * size); coastalTrunk.rotation.z = -0.15;
      const crown = ball(coastalTree, evergreen, 0.2 * size, 1.8 * size, 0, 0.9 * size); crown.scale.set(1.2, 0.48, 0.85);
      ball(coastalTree, stone, -0.4 * size, 0.13, 0.4 * size, 0.25 * size);
      const cactus = grouped(landscapes.dry); cactus.position.set(x, 0, z);
      cylinder(cactus, evergreen, 0, 0.9 * size, 0, 0.2 * size, 1.8 * size, 7);
      ball(cactus, evergreen, 0, 1.8 * size, 0, 0.2 * size);
      for (const side of [-1, 1]) {
        box(cactus, evergreen, side * 0.28 * size, (0.7 + (side + 1) * 0.15) * size, 0, 0.45 * size, 0.2 * size, 0.25 * size);
        cylinder(cactus, evergreen, side * 0.47 * size, (1 + (side + 1) * 0.15) * size, 0, 0.13 * size, 0.65 * size, 6);
      }
      const rock = ball(landscapes.dry, peach, x + 0.35, 0.2, z + 0.4, 0.35 * size); rock.scale.y = 0.6;
    }
    box(landscapes.coastal, sand, -4.8, 0.09, 0, 0.6, 0.05, 7.4);
    for (let i = 0; i < 5; i++) ball(landscapes.coastal, cream, -4.9, 0.16, -2 + i, 0.12);
    // Distinct city seating and a low Nordic log bench.
    for (const parent of [landscapes.urban, landscapes.nordic]) {
      box(parent, parent === landscapes.urban ? concrete : bark, -2.9, 0.44, -3.5, 1.5, 0.14, 0.55);
      for (const x of [-3.4, -2.4]) box(parent, ink, x, 0.23, -3.5, 0.12, 0.45, 0.4);
    }
    cylinder(landscapes.urban, ink, 3.4, 1.4, -3.5, 0.065, 2.8);
    box(landscapes.urban, cream, 3.4, 2.8, -3.5, 0.38, 0.35, 0.38);

    const residences: Record<ResidenceType, THREE.Group> = { detached: home, townhouse: grouped(), apartment: grouped() };
    const roofs: Record<ResidenceType, THREE.Group> = { detached: detachedRoof, townhouse: grouped(), apartment: grouped() };
    for (const kind of ["townhouse", "apartment"] as const) {
      const building = residences[kind], top = roofs[kind]; building.position.copy(home.position); top.position.copy(home.position);
      const height = kind === "apartment" ? 3.65 : 3.1;
      const width = kind === "apartment" ? 4.65 : 4.3;
      if (kind === "apartment") {
        box(building, cream, 0, height / 2, 0, width, height, 3.1);
        for (const y of [0.2, 1.35, 2.65]) box(building, concrete, 0, y, 0, width + 0.08, 0.12, 3.18);
        box(top, roof, 0, height + 0.12, 0, width + 0.3, 0.24, 3.4);
        box(top, cream, 0, height + 0.32, -1.55, width + 0.2, 0.3, 0.1);
        for (const x of [-1.5, 0, 1.5]) {
          box(building, cream, x, 2.15, 1.85, 1.1, 0.13, 0.65);
          box(building, ink, x, 2.5, 2.15, 1.1, 0.055, 0.04);
          for (const dx of [-0.45, 0, 0.45]) box(building, ink, x + dx, 2.34, 2.15, 0.035, 0.35, 0.035);
        }
      } else {
        for (const side of [-1, 1]) {
          box(building, side === -1 ? peach : cream, side * 1.1, height / 2, 0, 2.15, height, 3.1);
          const gable = new THREE.Shape(); gable.moveTo(-1.23, 0); gable.lineTo(0, 0.85); gable.lineTo(1.23, 0); gable.closePath();
          mesh(new THREE.ExtrudeGeometry(gable, { depth: 3.5, bevelEnabled: false }), side === -1 ? roof : lilac, top, side * 1.1, height, -1.75);
          box(building, side === -1 ? lilac : peach, side * 1.1, 0.72, 1.59, 0.7, 1.4, 0.1);
        }
      }
      const columns = kind === "apartment" ? [-1.5, 0, 1.5] : [-1.1, 1.1];
      for (const x of columns) for (const z of [-1.58, 1.58]) for (const y of [1.1, 2.65]) {
        if (kind === "townhouse" && y === 1.1 && z > 0) continue;
        box(building, ink, x, y, z, 0.82, 0.85, 0.08);
        box(building, glass, x, y, z * 1.025, 0.68, 0.71, 0.05);
        box(building, cream, x, y, z * 1.05, 0.045, 0.76, 0.03);
      }
      for (const side of [-1, 1]) for (const y of [1.1, 2.65]) {
        box(building, ink, side * (width / 2 + 0.02), y, -0.1, 0.05, 0.85, 0.9);
        box(building, glass, side * (width / 2 + 0.05), y, -0.1, 0.035, 0.71, 0.76);
      }
      if (kind === "apartment") {
        box(building, lilac, 0, 0.72, 1.61, 0.85, 1.4, 0.1);
        for (const x of [-1.4, 0.5]) box(top, darkGlass, x, height + 0.3, 0, 1.25, 0.1, 1.1);
      }
      box(building, cream, 0, 0.12, 1.9, width - 0.5, 0.2, 0.55);
    }
    const weatherGroups = Object.fromEntries((["clear", "cloudy", "rain", "snow"] as WeatherKind[]).map((key) => [key, grouped()])) as Record<WeatherKind, THREE.Group>;
    const moonColor = new THREE.Color(0xe8e4f1);
    const sunshine = mat(0xf3cf84, { emissive: 0xecc998, emissiveIntensity: 0.3 });
    ball(weatherGroups.clear, sunshine, -3.35, 3.8, -1.3, 0.38);
    const cloudMaterial = mat(0xe4e3ec);
    const weatherParticles: { object: THREE.Mesh; kind: "rain" | "snow"; seed: number }[] = [];
    for (const kind of ["cloudy", "rain", "snow"] as const) {
      const weather = weatherGroups[kind];
      for (let i = 0; i < 4; i++) {
        const cloud = ball(weather, cloudMaterial, -3.7 + i * 0.35, 3.8 + (i % 2) * 0.14, -1.1, 0.4); cloud.scale.set(1.2, 0.7, 0.75);
      }
      if (kind === "cloudy") continue;
      for (let i = 0; i < 18; i++) {
        const geometry = kind === "rain" ? new THREE.CylinderGeometry(0.018, 0.018, 0.22, 4) : new THREE.OctahedronGeometry(0.06, 0);
        const particle = mesh(geometry, kind === "rain" ? chillBlue : cream, weather, -4.1 + (i % 6) * 0.28, 0.7 + (i % 5) * 0.5, -0.9 + Math.floor(i / 6) * 0.2);
        weatherParticles.push({ object: particle, kind, seed: i * 0.173 });
      }
    }

    // Character faces have open and closed geometry, rather than texture swaps.
    const characters = {} as Record<ApplianceId, Character>;
    const makeCharacter = (id: ApplianceId, x: number, z: number, faceY: number, faceZ: number) => {
      const entrance = grouped();
      const group = grouped(entrance); group.position.set(x, 0.16, z); group.userData.applianceId = id;
      const eyes = new THREE.Group(), asleep = new THREE.Group(); group.add(eyes, asleep);
      const sleepyInk = mat(palette.ink, { transparent: true });
      for (const ex of [-0.2, 0.2]) {
        box(eyes, ink, ex, faceY, faceZ, 0.09, 0.16, 0.055);
        const lid = box(asleep, sleepyInk, ex, faceY, faceZ, 0.19, 0.045, 0.055); lid.rotation.z = ex < 0 ? -0.15 : 0.15;
      }
      const sleep = label("z Z", "#fff1ce", 160); sleep.position.set(0.75, faceY + 1.6, 0); asleep.add(sleep);
      const mouth = box(group, ink, 0, faceY - 0.2, faceZ, 0.13, 0.04, 0.045); mouth.rotation.z = 0.08;
      const ring = mesh(new THREE.RingGeometry(0.8, 0.87, 40), mat(0x74608f, { side: THREE.DoubleSide }), group, 0, 0.02, 0); ring.rotation.x = -Math.PI / 2;
      const indicator = ball(group, mint, 0.36, faceY + 0.38, faceZ, 0.07);
      const name = label(names[id], "#342b46"); name.position.set(0, faceY + 0.9, 0); group.add(name);
      characters[id] = { entrance, group, eyes, asleep, ring, indicator, baseY: 0.16, sleepBlend: 0 };
      return group;
    };
    const ev = makeCharacter("evie", -2.8, 2.05, 0.95, 1.18);
    roundedBox(ev, evieGreen, 0, 0.62, 0, 1.5, 0.65, 2.35);
    roundedBox(ev, evieGreen, 0, 1.05, -0.16, 1.3, 0.55, 1.35);
    box(ev, darkGlass, 0, 1.18, 0.54, 1.08, 0.36, 0.035);
    box(ev, darkGlass, 0, 1.18, -0.85, 1.08, 0.35, 0.035);
    for (const side of [-1, 1]) {
      box(ev, darkGlass, side * 0.66, 1.18, -0.15, 0.035, 0.33, 1.05);
      for (const z of [-0.7, 0.72]) { const wheel = cylinder(ev, ink, side * 0.78, 0.34, z, 0.29, 0.18, 12); wheel.rotation.z = Math.PI / 2; }
      box(ev, cream, side * 0.5, 0.7, 1.2, 0.2, 0.13, 0.04);
      box(ev, peach, side * 0.5, 0.7, -1.2, 0.2, 0.13, 0.04);
    }
    box(ev, ink, 0, 0.44, 1.22, 1.25, 0.11, 0.08);
    const washer = makeCharacter("bubbles", 0.8, 1.85, 1.05, 0.57);
    roundedBox(washer, peach, 0, 0.75, 0, 1.14, 1.45, 1.08);
    roundedBox(washer, cream, 0, 0.71, 0.56, 0.98, 1.1, 0.05);
    box(washer, ink, 0, 1.37, 0.57, 0.83, 0.12, 0.045);
    for (const x of [-0.42, 0.42]) for (const z of [-0.4, 0.4]) box(washer, ink, x, 0.05, z, 0.14, 0.18, 0.14);
    const ac = makeCharacter("chill", 3.2, 0.9, 1.12, 0.48);
    roundedBox(ac, chillBlue, 0, 0.85, 0, 1.5, 1.6, 0.9);
    for (let i = 0; i < 5; i++) box(ac, cream, 0, 0.28 + i * 0.1, 0.48, 1.2, 0.035, 0.05);
    for (const x of [-0.79, 0.79]) for (let i = 0; i < 5; i++) box(ac, ink, x, 0.6 + i * 0.12, 0, 0.025, 0.04, 0.6);
    // Simple rear fan makes the AC dimensional from the reverse angle too.
    const fan = mesh(new THREE.TorusGeometry(0.43, 0.045, 5, 18), ink, ac, 0, 0.88, -0.48);
    for (let i = 0; i < 4; i++) { const blade = box(ac, cream, 0, 0.88, -0.49, 0.6, 0.11, 0.04); blade.rotation.z = i * Math.PI / 4; }
    fan.castShadow = false;
    type DropState = { object: THREE.Group; base: THREE.Vector3; scale: THREE.Vector3; requested: boolean; started: number; done: boolean };
    const dropStates = new Map<THREE.Group, DropState>();
    const stagedGroups = [groundGroup, pathGroup, decorGroup, ...Object.values(landscapes), ...Object.values(residences), ...Object.values(roofs), ...Object.values(weatherGroups), ...Object.values(characters).map((character) => character.entrance)];
    for (const object of stagedGroups) dropStates.set(object, { object, base: object.position.clone(), scale: object.scale.clone(), requested: false, started: 0, done: false });
    let localReplay = 0, skipBuild = false, previousBuildKey = "", previousSignature = "", completedSignature = "";
    buildCommand.current = (action) => { if (action === "skip") skipBuild = true; else localReplay++; };
    const bounceOut = (value: number) => {
      if (value < 1 / 2.75) return 7.5625 * value * value;
      if (value < 2 / 2.75) return 7.5625 * (value - 1.5 / 2.75) ** 2 + 0.75;
      if (value < 2.5 / 2.75) return 7.5625 * (value - 2.25 / 2.75) ** 2 + 0.9375;
      return 7.5625 * (value - 2.625 / 2.75) ** 2 + 0.984375;
    };
    const stageConstruction = (props: Props, time: number) => {
      const level = props.construction?.level ?? 3;
      const theme = props.regionTheme ?? "garden", residence = props.residenceType ?? "detached";
      const visibleIds = props.visibleAppliances ?? (["evie", "bubbles", "chill"] as const);
      const signature = `${props.construction?.replayKey ?? "legacy"}/${localReplay}/${level}/${theme}/${residence}/${props.weatherKind ?? "none"}/${visibleIds.join(",")}`;
      const buildKey = `${props.construction?.replayKey ?? "legacy"}/${localReplay}`;
      if (signature !== previousSignature) { skipBuild = false; previousSignature = signature; }
      if (buildKey !== previousBuildKey) {
        for (const state of dropStates.values()) { state.requested = false; state.done = false; }
        previousBuildKey = buildKey;
      }
      const immediate = reduced || !props.construction || skipBuild;
      const apply = (object: THREE.Group, requested: boolean, order: number) => {
        const state = dropStates.get(object)!;
        if (!requested) { object.visible = false; state.requested = false; state.done = false; object.position.copy(state.base); object.scale.copy(state.scale); return; }
        if (!state.requested) { state.started = time + order * 180; state.requested = true; state.done = false; }
        const progress = immediate ? 1 : THREE.MathUtils.clamp((time - state.started) / 700, 0, 1);
        object.visible = immediate || time >= state.started;
        const eased = bounceOut(progress);
        object.position.copy(state.base); object.position.y += (1 - eased) * 3.2;
        object.scale.copy(state.scale).multiplyScalar(0.93 + eased * 0.07);
        state.done = progress === 1;
      };
      apply(groundGroup, true, 0); apply(pathGroup, true, 1); apply(decorGroup, true, 2);
      for (const [key, object] of Object.entries(landscapes)) apply(object, key === theme, 2);
      for (const [key, object] of Object.entries(residences)) apply(object, level >= 1 && key === residence, 3);
      for (const [key, object] of Object.entries(roofs)) apply(object, level >= 1 && key === residence, 4);
      for (const [key, object] of Object.entries(weatherGroups)) apply(object, level >= 2 && Boolean(props.weatherKind) && key === props.weatherKind, 5);
      for (const [index, id] of (["evie", "bubbles", "chill"] as ApplianceId[]).entries()) apply(characters[id].entrance, level >= 3 && visibleIds.includes(id), 6 + index);
      lawnMaterial.color.setHex({ garden: palette.lawn, coastal: 0xd9d2a8, tropical: 0x9dbd81, urban: 0xb9c5ae, nordic: 0xc6d3bd, dry: 0xdac092 }[theme]);
      mount.dataset.constructionLevel = String(level);
      mount.dataset.region = theme; mount.dataset.residence = residence;
      mount.dataset.appliances = level >= 3 ? visibleIds.join(",") : "";
      const complete = [...dropStates.values()].every((state) => !state.requested || state.done);
      mount.dataset.buildState = complete ? "complete" : "building";
      if (props.construction && complete && completedSignature !== signature) { completedSignature = signature; props.onConstructionComplete?.(); }
    };

    const hemisphere = new THREE.HemisphereLight(0xf6f5ec, 0x7a7764, 2.5); scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xffe6c0, 3.2); sun.position.set(-5, 10, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -9; sun.shadow.camera.right = 9; sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9; sun.shadow.normalBias = 0.04; scene.add(sun);
    const porchLight = new THREE.PointLight(0xffbc70, 0, 9); porchLight.position.set(0, 2.2, 0.8); world.add(porchLight);
    let rotationAnchor = 0.5;
    let sceneRotation = THREE.MathUtils.clamp((latest.current.scrollProgress - rotationAnchor) * Math.PI / 6, -Math.PI / 12, Math.PI / 12);
    command.current = (action) => {
      if (action === "reset") { controls.reset(); rotationAnchor = latest.current.scrollProgress; sceneRotation = 0; world.rotation.y = 0; renderer.render(scene, camera); return; }
      const sphere = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      if (action === "left") sphere.theta -= 0.25;
      if (action === "right") sphere.theta += 0.25;
      if (action === "up") sphere.phi -= 0.16;
      if (action === "down") sphere.phi += 0.16;
      if (action === "in") sphere.radius *= 0.86;
      if (action === "out") sphere.radius *= 1.16;
      sphere.theta = THREE.MathUtils.clamp(sphere.theta, controls.minAzimuthAngle, controls.maxAzimuthAngle);
      sphere.phi = THREE.MathUtils.clamp(sphere.phi, controls.minPolarAngle, controls.maxPolarAngle);
      sphere.radius = THREE.MathUtils.clamp(sphere.radius, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sphere)); controls.update(); renderer.render(scene, camera);
    };
    const keydown = (event: KeyboardEvent) => {
      const mapping: Record<string, Command> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", "+": "in", "=": "in", "-": "out", Home: "reset" };
      if (mapping[event.key]) { event.preventDefault(); command.current(mapping[event.key]); }
      if (event.key === "Escape") canvas.blur();
    };
    const focus = () => { setFocused(true); };
    const blur = () => { setFocused(false); };
    let pointerStart: { x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY }; canvas.focus({ preventScroll: true }); };
    const raycaster = new THREE.Raycaster();
    const pointerUp = (event: PointerEvent) => {
      if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 7) return;
      const bounds = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
      const hits = raycaster.intersectObjects(world.children, true);
      for (const hit of hits) {
        let ancestor: THREE.Object3D | null = hit.object;
        let shown = true;
        while (ancestor) { if (!ancestor.visible) shown = false; ancestor = ancestor.parent; }
        if (!shown) continue;
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.applianceId) object = object.parent;
        if (object) { latest.current.onSelect(object.userData.applianceId as ApplianceId); break; }
        // Solid scenery occludes characters; sprites and selection rings do not.
        if (hit.object instanceof THREE.Mesh) break;
      }
      pointerStart = null;
    };
    let stopped = false, frame = 0, visible = true;
    const contextLost = (event: Event) => { event.preventDefault(); stopped = true; cancelAnimationFrame(frame); setUnavailable(true); };
    canvas.addEventListener("keydown", keydown); canvas.addEventListener("focus", focus); canvas.addEventListener("blur", blur);
    canvas.addEventListener("pointerdown", pointerDown); canvas.addEventListener("pointerup", pointerUp); canvas.addEventListener("webglcontextlost", contextLost);
    let fitDistance = 0;
    const resize = () => {
      const width = mount.clientWidth, height = mount.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height; camera.fov = width < 500 ? 48 : 36; camera.updateProjectionMatrix();
      // Fit the island with breathing room, retaining relative zoom on resize.
      const halfVertical = THREE.MathUtils.degToRad(camera.fov / 2);
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
      const nextFit = Math.max(7.1 / Math.tan(halfHorizontal), 5.1 / Math.tan(halfVertical)) * 1.14;
      const offset = camera.position.clone().sub(controls.target);
      const zoomRatio = fitDistance ? offset.length() / fitDistance : 1;
      fitDistance = nextFit;
      camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(nextFit * zoomRatio));
      controls.position0.copy(controls.target).add(new THREE.Vector3(12, 10, 16).normalize().multiplyScalar(nextFit));
      controls.update();
      // Resizing clears WebGL's drawing buffer, including in inactive tabs.
      // Always paint the fitted scene once; only continuous animation is paused.
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(resize); observer.observe(mount); resize();
    const daySun = new THREE.Color(0xffe6c0), duskSun = new THREE.Color(0xffc7af), nightSun = new THREE.Color(0xc7c4ef);
    const daySky = new THREE.Color(0xf6f5ec), nightSky = new THREE.Color(0xc7bce2);
    const dayGround = new THREE.Color(0x7a7764), nightGround = new THREE.Color(0x9282a0);
    let darkness = nightWeight(latest.current.hour), previousTime = 0;
    const render = (time: number, force = false) => {
      if (stopped || (!force && (!visible || document.hidden))) return;
      const props = latest.current;
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.1) : 0;
      previousTime = time;
      // Exponential easing is stable across refresh rates and rapid clock scrubs.
      // Roughly two seconds to settle; never switch sky or materials by a boolean.
      const blend = reduced ? 1 : 1 - Math.exp(-delta * 2);
      const sceneHour = props.construction && props.construction.level < 2 ? 12 : props.hour;
      darkness += (nightWeight(sceneHour) - darkness) * blend;
      const dusk = Math.sin(darkness * Math.PI);
      mount.style.setProperty("--night-tone", darkness.toFixed(4));
      mount.style.setProperty("--twilight-tone", dusk.toFixed(4));
      hemisphere.intensity = THREE.MathUtils.lerp(2.5, 1.55, darkness);
      hemisphere.color.copy(daySky).lerp(nightSky, darkness);
      hemisphere.groundColor.copy(dayGround).lerp(nightGround, darkness);
      const cloudy = (props.construction?.level ?? 3) >= 2 && props.weatherKind && props.weatherKind !== "clear";
      sun.intensity = THREE.MathUtils.lerp(3.2, 1.45, darkness) * (cloudy ? 0.8 : 1);
      sun.color.copy(daySun).lerp(nightSun, darkness).lerp(duskSun, dusk * 0.5);
      glass.emissiveIntensity = darkness * 1.35; porchLight.intensity = (props.construction?.level ?? 3) >= 1 ? darkness * 7 : 0;
      sunshine.color.setHex(0xf3cf84).lerp(moonColor, darkness);
      for (const particle of weatherParticles) {
        if (!reduced) particle.object.position.y = 3.45 - ((time * (particle.kind === "rain" ? 0.0007 : 0.00018) + particle.seed) % 1) * 2.6;
      }
      const rotationTarget = THREE.MathUtils.clamp((props.scrollProgress - rotationAnchor) * Math.PI / 6, -Math.PI / 12, Math.PI / 12);
      sceneRotation += (rotationTarget - sceneRotation) * (1 - Math.exp(-delta * 4));
      world.rotation.y = reduced ? 0 : sceneRotation;
      mount.dataset.rotationDegrees = (world.rotation.y * 180 / Math.PI).toFixed(2);
      for (const id of Object.keys(characters) as ApplianceId[]) {
        const character = characters[id], active = props.activeIds.includes(id) && id !== "chill";
        const sleepTarget = active ? 0 : THREE.MathUtils.smoothstep(darkness, 0.5, 0.95);
        character.sleepBlend += (sleepTarget - character.sleepBlend) * blend;
        character.eyes.visible = character.sleepBlend < 0.995;
        character.eyes.scale.y = Math.max(0.05, 1 - character.sleepBlend);
        // Keep the eye anchor fixed while the lids close.
        character.eyes.position.y = (id === "evie" ? 0.95 : id === "bubbles" ? 1.05 : 1.12) * (1 - character.eyes.scale.y);
        character.asleep.visible = character.sleepBlend > 0.005;
        character.asleep.scale.setScalar(0.94 + character.sleepBlend * 0.06);
        character.asleep.traverse((object) => {
          if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
            const material = object.material as THREE.Material;
            material.opacity = character.sleepBlend;
          }
        });
        character.ring.visible = props.selected === id;
        character.indicator.visible = active;
        character.group.position.y = character.baseY + (active && !reduced ? Math.sin(time * 0.003 + character.group.position.x) * 0.035 : 0);
      }
      stageConstruction(props, time);
      controls.update();
      mount.dataset.cameraAzimuthDegrees = (controls.getAzimuthalAngle() * 180 / Math.PI).toFixed(2);
      renderer.render(scene, camera);
      if (visible && !document.hidden) frame = requestAnimationFrame(render);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      if (!stopped && visible && !document.hidden) frame = requestAnimationFrame(render);
    };
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
    visibilityObserver.observe(mount);
    document.addEventListener("visibilitychange", resume);
    render(performance.now(), true);
    return () => {
      stopped = true; cancelAnimationFrame(frame); observer.disconnect(); visibilityObserver.disconnect(); document.removeEventListener("visibilitychange", resume); motion.removeEventListener("change", motionChange);
      canvas.removeEventListener("keydown", keydown); canvas.removeEventListener("focus", focus); canvas.removeEventListener("blur", blur);
      canvas.removeEventListener("pointerdown", pointerDown); canvas.removeEventListener("pointerup", pointerUp); canvas.removeEventListener("webglcontextlost", contextLost);
      controls.dispose(); geometries.forEach((item) => item.dispose()); materials.forEach((item) => item.dispose()); textures.forEach((item) => item.dispose()); renderer.dispose(); canvas.remove(); command.current = () => {}; buildCommand.current = () => {};
    };
  }, [generation]);

  return <div className={`hm3d ${night ? "hm3d-night" : ""} ${twilight ? "hm3d-twilight" : ""} ${construction ? "hm3d-constructing" : ""}`}>
    <div className="hm3d-topline"><span>YOUR LITTLE WORLD · REAL 3D</span><span>{twilight ? hour % 24 < 12 ? "☼ DAWN" : "◐ DUSK" : night ? "☾ NIGHT" : "☀ DAY"}</span></div>
    <div className="hm3d-stage" ref={host} />
    {unavailable && <div className="hm3d-fallback" role="status"><strong>The 3D view is taking a break.</strong><p>WebGL is unavailable or its context was lost. Appliance selection and the simulated planner still work.</p><button type="button" onClick={() => { setUnavailable(false); setGeneration((value) => value + 1); }}>Retry 3D view</button></div>}
    <div className="hm3d-toolbar" aria-label="3D view controls">
      <div className="hm3d-camera"><button type="button" aria-label="Rotate view left" onClick={() => command.current("left")}>↶</button><button type="button" aria-label="Rotate view right" onClick={() => command.current("right")}>↷</button><button type="button" aria-label="Zoom in" onClick={() => command.current("in")}>+</button><button type="button" aria-label="Zoom out" onClick={() => command.current("out")}>−</button><button type="button" onClick={() => command.current("reset")} aria-label="Reset camera view">Reset</button></div>
      {construction && <div className="hm3d-build-controls" aria-label="Household construction controls"><button type="button" onClick={() => buildCommand.current("skip")}>Finish build</button><button type="button" onClick={() => buildCommand.current("replay")}>Replay build</button></div>}
      <span className="hm3d-hint">{focused ? "+/− to zoom · Esc to release" : "Drag to turn · Scroll through the day"}</span>
    </div>
    <p className="hm3d-access sr-only">Keyboard: focus the scene, then arrows to orbit, + / − to zoom, Home to reset. Motion follows the demo clock, never real devices.</p>
  </div>;
}
