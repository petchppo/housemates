import * as THREE from "three";

export type LandmarkTheme = "coastal" | "garden" | "tropical" | "urban" | "nordic" | "dry";
export const CITY_LANDMARK_IDS: Record<LandmarkTheme, string> = {
  coastal: "golden-gate-bridge", garden: "elizabeth-tower", tropical: "grand-palace-pavilion",
  urban: "tokyo-tower", nordic: "oslo-opera-house", dry: "sydney-opera-house",
};

/** Original procedural miniatures: representative silhouettes, not architectural reconstructions.
 * The caller owns disposal of the group's geometries/materials through its existing scene lifecycle.
 */
export function createCityLandmark(theme: LandmarkTheme): THREE.Group {
  const group = new THREE.Group();
  group.name = CITY_LANDMARK_IDS[theme];
  const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  const white = material(0xfff3dc), stone = material(0xd6b98b), dark = material(0x4e5267);
  const red = material(0xd76f50), gold = material(0xe9b956), green = material(0x82977a), water = material(0x9abfc8);
  const add = (geometry: THREE.BufferGeometry, paint: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, paint); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const box = (paint: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number) => add(new THREE.BoxGeometry(width, height, depth), paint, x, y, z);
  const cone = (paint: THREE.Material, x: number, y: number, z: number, radius: number, height: number, sides = 4) => add(new THREE.ConeGeometry(radius, height, sides), paint, x, y, z);
  const beam = (paint: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, radius = 0.025) => {
    const delta = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(0.5);
    const mesh = add(new THREE.CylinderGeometry(radius, radius, delta.length(), 5), paint, center.x, center.y, center.z);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return mesh;
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  box(stone, 0, 0.08, 0, 2.55, 0.16, 1.65);
  box(theme === "coastal" || theme === "nordic" || theme === "dry" ? water : green, 0, 0.18, 0, 2.45, 0.05, 1.55);

  if (theme === "coastal") {
    box(dark, 0, 0.61, 0, 2.8, 0.09, 0.49);
    box(white, 0, 0.665, 0, 2.75, 0.012, 0.025);
    for (const x of [-0.82, 0.82]) {
      for (const z of [-0.3, 0.3]) box(red, x, 1.08, z, 0.1, 1.86, 0.1);
      for (const y of [0.75, 1.27, 1.84]) box(red, x, y, 0, 0.11, 0.09, 0.69);
      box(stone, x, 0.33, 0, 0.27, 0.28, 0.81);
    }
    const cableHeight = (x: number) => Math.abs(x) <= 0.82 ? 1.03 + 0.85 * (x / 0.82) ** 2 : 1.88 - (Math.abs(x) - 0.82) * 2.05;
    for (const z of [-0.3, 0.3]) {
      for (let i = 0; i < 28; i++) {
        const x = -1.4 + i * 0.1; beam(red, v(x, cableHeight(x), z), v(x + 0.1, cableHeight(x + 0.1), z), 0.021);
      }
      for (let i = 0; i < 13; i++) { const x = -1.2 + i * 0.2; beam(red, v(x, 0.65, z), v(x, cableHeight(x), z), 0.012); }
    }
  } else if (theme === "garden") {
    box(stone, 0, 1.14, 0, 0.74, 1.9, 0.7);
    for (const y of [0.3, 0.75, 1.54, 2.08]) box(white, 0, y, 0, 0.87, 0.1, 0.83);
    for (const x of [-0.22, 0, 0.22]) {
      box(dark, x, 1.12, 0.36, 0.065, 0.55, 0.018);
      box(dark, 0.38, 1.12, x, 0.018, 0.55, 0.065);
    }
    // Four modeled clock faces and hands remain recognizable from either front angle.
    for (let side = 0; side < 4; side++) {
      const clock = new THREE.Group(); clock.position.y = 1.81; clock.rotation.y = side * Math.PI / 2; group.add(clock);
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.035, 16), white); face.rotation.x = Math.PI / 2; face.position.z = 0.375; clock.add(face);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 5, 16), gold); rim.position.z = 0.4; clock.add(rim);
      for (const [width, height, x, y] of [[0.025, 0.18, 0, 0.06], [0.15, 0.025, 0.055, 0]]) {
        const hand = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.02), dark); hand.position.set(x, y, 0.415); clock.add(hand);
      }
    }
    cone(green, 0, 2.43, 0, 0.55, 0.65).rotation.y = Math.PI / 4;
    cone(gold, 0, 2.9, 0, 0.07, 0.43, 6);
    for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) cone(gold, x, 2.3, z, 0.07, 0.45, 4);
    box(stone, -0.78, 0.45, -0.13, 0.65, 0.5, 0.75);
    cone(green, -0.78, 0.86, -0.13, 0.5, 0.36).rotation.y = Math.PI / 4;
  } else if (theme === "tropical") {
    box(white, 0, 0.32, 0, 1.6, 0.25, 1.12);
    for (const x of [-0.61, 0.61]) for (const z of [-0.36, 0.36]) box(gold, x, 0.77, z, 0.085, 0.8, 0.085);
    box(white, 0, 0.69, -0.15, 0.94, 0.7, 0.55);
    box(dark, 0, 0.68, 0.14, 0.31, 0.5, 0.03);
    for (let tier = 0; tier < 3; tier++) {
      const width = 1.05 - tier * 0.19, height = 0.64 - tier * 0.1;
      const shape = new THREE.Shape(); shape.moveTo(-width, 0); shape.lineTo(0, height); shape.lineTo(width, 0); shape.closePath();
      const roof = add(new THREE.ExtrudeGeometry(shape, { depth: 1.15 - tier * 0.16, bevelEnabled: false }), tier % 2 ? green : red, 0, 1.03 + tier * 0.28, -0.58 + tier * 0.08);
      roof.castShadow = true;
      for (const side of [-1, 1]) beam(gold, v(side * width, 1.05 + tier * 0.28, 0.57 - tier * 0.08), v(side * (width + 0.07), 1.3 + tier * 0.28, 0.57 - tier * 0.08), 0.025);
    }
    for (const x of [-0.94, 0.94]) {
      box(white, x, 0.37, -0.42, 0.34, 0.35, 0.34);
      cone(gold, x, 0.91, -0.42, 0.25, 0.8, 8); cone(gold, x, 1.52, -0.42, 0.055, 0.65, 6);
    }
    cone(gold, 0, 2.19, -0.05, 0.13, 0.8, 6);
  } else if (theme === "urban") {
    const towerWidth = (y: number) => 0.68 * (1 - y / 2.6) + 0.05;
    for (const xSign of [-1, 1]) for (const zSign of [-1, 1]) {
      beam(red, v(xSign * 0.73, 0.22, zSign * 0.73), v(xSign * 0.15, 2.2, zSign * 0.15), 0.06);
      box(stone, xSign * 0.72, 0.24, zSign * 0.72, 0.3, 0.12, 0.3);
    }
    for (let layer = 0; layer < 4; layer++) {
      const y = 0.36 + layer * 0.43, next = y + 0.43, a = towerWidth(y), b = towerWidth(next);
      for (const sign of [-1, 1]) {
        beam(layer % 2 ? white : red, v(-a, y, sign * a), v(b, next, sign * b), 0.022);
        beam(red, v(a, y, sign * a), v(-b, next, sign * b), 0.022);
        beam(red, v(sign * a, y, -a), v(sign * b, next, b), 0.022);
        beam(white, v(sign * a, y, a), v(sign * b, next, -b), 0.022);
      }
    }
    box(white, 0, 1.45, 0, 0.85, 0.18, 0.85); box(dark, 0, 1.48, 0, 0.86, 0.065, 0.86);
    box(red, 0, 2.13, 0, 0.39, 0.19, 0.39);
    cone(white, 0, 2.43, 0, 0.13, 0.52, 6); cone(red, 0, 2.82, 0, 0.06, 0.5, 6);
  } else if (theme === "nordic") {
    box(dark, 0.05, 0.58, -0.3, 1.82, 0.74, 0.83);
    box(white, 0.05, 0.99, -0.3, 2.02, 0.13, 0.99);
    const slope = box(white, 0.05, 0.48, 0.35, 2.2, 0.11, 1.32); slope.rotation.x = 0.53;
    const sideSlope = box(white, -0.94, 0.57, -0.05, 0.47, 0.1, 1.15); sideSlope.rotation.z = 0.36;
    for (let i = 0; i < 7; i++) box(white, -0.68 + i * 0.23, 0.58, 0.13, 0.025, 0.65, 0.025);
    box(white, 0.25, 1.12, -0.41, 0.77, 0.2, 0.59);
  } else {
    box(stone, 0, 0.3, 0, 2.22, 0.2, 1.25);
    const shell = new THREE.Shape(); shell.moveTo(0, 0); shell.quadraticCurveTo(0.16, 0.95, 0.91, 1.52); shell.quadraticCurveTo(0.83, 0.45, 1.22, 0); shell.closePath();
    for (const row of [-1, 1]) for (let i = 0; i < 3; i++) {
      const sail = add(new THREE.ExtrudeGeometry(shell, { depth: 0.31, bevelEnabled: false, curveSegments: 7 }), white, -1.03 + i * 0.63, 0.41, row * 0.25 - 0.16);
      const scale = 0.91 - i * 0.15; sail.scale.set(scale, scale, 1); sail.rotation.z = -0.08;
    }
    box(dark, -0.05, 0.45, 0.56, 1.88, 0.12, 0.05);
  }
  // Small museum-like plinth keeps these clearly miniature, stylized landmarks.
  group.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
  return group;
}
