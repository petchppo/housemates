"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import "./guide-mascot.css";

type GuideMascotProps = {
  talking?: boolean;
  mood?: "welcome" | "thinking" | "celebrate";
  className?: string;
};

function GuideFallback() {
  return <svg viewBox="0 0 240 240" aria-hidden="true" className="hm-guide-fallback">
    <ellipse cx="120" cy="207" rx="83" ry="20" fill="#d7cbe8"/>
    <path d="M37 195v12c0 25 166 25 166 0v-12" fill="#c5d795"/>
    <ellipse cx="120" cy="195" rx="83" ry="20" fill="#f5edda"/>
    <path d="m76 159-15 21m103-21 15-21" stroke="#b9a0d5" strokeWidth="16" strokeLinecap="round"/>
    <path d="M98 64V43m45 21V43" stroke="#d0e89a" strokeWidth="16" strokeLinecap="round"/>
    <rect x="72" y="61" width="99" height="119" rx="33" fill="#b49ad4" stroke="#715a90" strokeWidth="3"/>
    <path d="M88 80c12-13 39-13 54-7" stroke="#d7c2ed" strokeWidth="8" strokeLinecap="round"/>
    <ellipse cx="101" cy="119" rx="7" ry="10" fill="#382b4a"/><ellipse cx="144" cy="119" rx="7" ry="10" fill="#382b4a"/>
    <circle cx="103" cy="116" r="2.5" fill="#fffaf0"/><circle cx="146" cy="116" r="2.5" fill="#fffaf0"/>
    <path d="M113 140q10 10 19 0" fill="none" stroke="#382b4a" strokeWidth="4" strokeLinecap="round"/>
    <ellipse cx="87" cy="134" rx="7" ry="4" fill="#e9b7c8"/><ellipse cx="157" cy="134" rx="7" ry="4" fill="#e9b7c8"/>
    <path d="M93 181v8m56-8v8" stroke="#a3bd71" strokeWidth="20" strokeLinecap="round"/>
    <path d="m189 71 4-10 4 10 10 4-10 4-4 10-4-10-10-4z" fill="#d1e699"/>
  </svg>;
}

/** Original procedural guide character. It represents no physical appliance. */
export function GuideMascot({ talking = false, mood = "welcome", className = "" }: GuideMascotProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ talking, mood });
  const redraw = useRef<() => void>(() => {});
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => { latest.current = { talking, mood }; redraw.current(); }, [talking, mood]);
  useEffect(() => {
    const mount = host.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); }
    catch { queueMicrotask(() => setStatus("unavailable")); return; }
    let disposed = false;
    let visible = true;
    let lost = false;
    let frame = 0;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    mount.appendChild(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 30);
    camera.position.set(3.2, 2.8, 6.5);
    camera.lookAt(0, 1.05, 0);
    scene.add(new THREE.HemisphereLight(0xfff7e5, 0x9f85bd, 2.5));
    const light = new THREE.DirectionalLight(0xffedda, 3.5);
    light.position.set(-3, 6, 5);
    scene.add(light);
    const rim = new THREE.DirectionalLight(0xc5c9ff, 2);
    rim.position.set(3, 3, -3);
    scene.add(rim);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    function material(color: number, roughness = .72) {
      const result = new THREE.MeshStandardMaterial({ color, roughness });
      materials.add(result);
      return result;
    }
    const lilac = material(0xb59ad5), lime = material(0xcde596), ink = material(0x32253e);
    const cream = material(0xfff5df), blush = material(0xe6b2c4), purple = material(0x8b72a8);
    function mesh(geometry: THREE.BufferGeometry, surface: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) {
      geometries.add(geometry);
      const result = new THREE.Mesh(geometry, surface);
      result.position.set(x, y, z);
      parent.add(result);
      return result;
    }
    const round = (parent: THREE.Object3D, surface: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, radius = .12) => mesh(new RoundedBoxGeometry(w, h, d, 3, radius), surface, parent, x, y, z);
    const ball = (parent: THREE.Object3D, surface: THREE.Material, x: number, y: number, z: number, r: number) => mesh(new THREE.SphereGeometry(r, 16, 12), surface, parent, x, y, z);
    mesh(new THREE.CylinderGeometry(1.14, 1.2, .17, 48), lime, scene, 0, .12, 0);
    mesh(new THREE.CylinderGeometry(1.14, 1.14, .08, 48), cream, scene, 0, .24, 0);
    const shadow = mesh(new THREE.CircleGeometry(.68, 40), new THREE.MeshBasicMaterial({ color: 0x9c8bab, transparent: true, opacity: .23 }), scene, 0, .286, 0);
    materials.add(shadow.material);
    shadow.rotation.x = -Math.PI / 2;
    const creature = new THREE.Group();
    scene.add(creature);
    creature.position.y = .36;
    round(creature, lilac, 0, .83, 0, 1.12, 1.35, .85, .28);
    round(creature, lime, -.28, 1.65, -.04, .17, .46, .18, .07);
    round(creature, lime, .28, 1.65, -.04, .17, .46, .18, .07);
    round(creature, lime, -.3, .02, .12, .37, .21, .47, .1);
    round(creature, lime, .3, .02, .12, .37, .21, .47, .1);
    const eyes = new THREE.Group();
    creature.add(eyes);
    eyes.position.set(0, .94, .424);
    for (const x of [-.25, .25]) {
      const eye = ball(eyes, ink, x, 0, 0, .085);
      eye.scale.set(.8, 1.25, .45);
      ball(eyes, cream, x + .02, .035, .035, .022);
      const cheek = ball(creature, blush, x * 1.42, .73, .42, .07);
      cheek.scale.set(1.1, .5, .3);
    }
    const mouth = mesh(new THREE.TorusGeometry(.095, .022, 8, 20, Math.PI), ink, creature, 0, .73, .44);
    mouth.rotation.z = Math.PI;
    const badge = mesh(new THREE.BoxGeometry(.19, .19, .035), cream, creature, 0, .39, .442);
    badge.rotation.z = Math.PI / 4;
    const armLeft = new THREE.Group();
    armLeft.position.set(-.59, .76, 0);
    creature.add(armLeft);
    round(armLeft, purple, -.11, -.13, 0, .17, .37, .17, .075);
    ball(armLeft, lilac, -.16, -.3, .03, .17);
    const armRight = new THREE.Group();
    armRight.position.set(.59, .9, 0);
    creature.add(armRight);
    round(armRight, purple, .12, .14, 0, .17, .37, .17, .075);
    ball(armRight, lilac, .17, .33, .03, .17);
    const sparkles = new THREE.Group();
    scene.add(sparkles);
    for (const [x, y, z] of [[-1, 1.8, 0], [.95, 2.15, 0], [.7, .55, .3]]) {
      mesh(new THREE.OctahedronGeometry(.085), lime, sparkles, x, y, z);
    }

    function draw(time: number) {
      frame = 0;
      if (disposed || lost || !visible || document.hidden) return;
      const reduced = media.matches;
      const { talking: speaking, mood: expression } = latest.current;
      const t = time / 1000;
      const celebrate = expression === "celebrate";
      creature.position.y = .36 + (reduced ? 0 : Math.sin(t * (celebrate ? 3 : 1.6)) * (celebrate ? .055 : .025));
      creature.rotation.z = expression === "thinking" ? -.09 : reduced ? 0 : Math.sin(t * 1.1) * .025;
      armRight.rotation.z = expression === "thinking" ? -.9 : -.15 + (reduced ? 0 : Math.sin(t * (celebrate ? 5 : 2.1)) * .17);
      armLeft.rotation.z = celebrate ? -.9 : .1;
      const blink = !reduced && t % 4.3 > 4.12;
      eyes.scale.y = blink ? .12 : 1;
      mouth.scale.y = speaking && !reduced ? 1 + Math.sin(t * 11) * .35 : 1;
      sparkles.visible = celebrate;
      sparkles.rotation.y = reduced ? 0 : Math.sin(t) * .15;
      renderer.render(scene, camera);
      if (!reduced) frame = requestAnimationFrame(draw);
    }
    function resume() {
      cancelAnimationFrame(frame);
      if (!disposed && !lost && visible && !document.hidden) frame = requestAnimationFrame(draw);
    }
    function resize() {
      const width = Math.max(1, mount!.clientWidth);
      const height = Math.max(1, mount!.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      resume();
    }
    function contextLost(event: Event) {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(frame);
      setStatus("unavailable");
    }
    redraw.current = resume;
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
    intersection.observe(mount);
    media.addEventListener("change", resume);
    document.addEventListener("visibilitychange", resume);
    canvas.addEventListener("webglcontextlost", contextLost);
    resize();
    queueMicrotask(() => { if (!disposed) setStatus("ready"); });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      redraw.current = () => {};
      resizeObserver.disconnect();
      intersection.disconnect();
      media.removeEventListener("change", resume);
      document.removeEventListener("visibilitychange", resume);
      canvas.removeEventListener("webglcontextlost", contextLost);
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(surface => surface.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div className={`hm-guide-mascot ${className}`} role="img" aria-label="Your friendly lilac household guide" data-mood={mood} data-renderer={status}>
    <div ref={host} className="hm-guide-canvas" hidden={status === "unavailable"}/>
    {status !== "ready" && <GuideFallback/>}
  </div>;
}
