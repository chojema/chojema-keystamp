import type { Font } from "opentype.js";
import { isModifier, legendFor, rowWidth, type KeyRef, type Legend, type Platform } from "./keys";
import { layoutKeys, type LayoutId } from "./layouts";
import { buildCap, buildCase, buildPlus, keyTravel, UNIT, type CapMesh, type Profile, type Vec3 } from "./mesh";

export interface View {
  /** Degrees away from straight down: 0 is the top view. */
  tilt: number;
  /** Degrees of rotation around the vertical axis. */
  yaw: number;
  /** 0 is parallel projection; 1 is strong perspective. */
  perspective: number;
}

export interface CapStyle {
  profile: Profile;
  cap: string;
  /** Colour of modifier keys. */
  modifier: string;
  legend: string;
  /** Colour a key takes on while pressed. */
  accent: string;
  jamo: boolean;
}

export interface ContextOptions {
  enabled: boolean;
  layout: LayoutId;
  /** How far surrounding keys reach, in key units. */
  reach: number;
  /** Blur strength at the outer edge. */
  blur: number;
}

export interface KeyboardOptions {
  /** Show the whole keyboard rather than only the chosen keys. */
  enabled: boolean;
  numpad: boolean;
  /** Colour the chosen keys and quieten all the others. */
  highlight: boolean;
}

export interface SceneSpec {
  keyboard?: KeyboardOptions;
  keys: KeyRef[];
  platform: Platform;
  view: View;
  style: CapStyle;
  context: ContextOptions;
  showPlus: boolean;
  shadow: boolean;
  /** Hex colour, or null for a transparent background. */
  background: string | null;
}

interface KeyInstance {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  selected: boolean;
  distance: number;
}

/* colour */

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const v = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as Rgb;
}

function toHex([r, g, b]: Rgb): string {
  const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/* camera */

class Camera {
  private sinY: number;
  private cosY: number;
  private sinT: number;
  private cosT: number;
  private distance: number;
  readonly viewDir: Vec3;

  constructor(view: View, extent: number) {
    const yaw = (view.yaw * Math.PI) / 180;
    const tilt = (view.tilt * Math.PI) / 180;
    this.sinY = Math.sin(yaw);
    this.cosY = Math.cos(yaw);
    this.sinT = Math.sin(tilt);
    this.cosT = Math.cos(tilt);
    this.distance = view.perspective <= 0.001 ? Infinity : extent * 0.6 + 260 / view.perspective;
    this.viewDir = [this.sinT * this.sinY, this.sinT * this.cosY, this.cosT];
  }

  project([x, y, z]: Vec3): [number, number] {
    const rx = x * this.cosY - y * this.sinY;
    const ry = x * this.sinY + y * this.cosY;
    const sy = ry * this.cosT - z * this.sinT;
    const depth = ry * this.sinT + z * this.cosT;
    const s = this.distance === Infinity ? 1 : this.distance / (this.distance - depth);
    return [rx * s, sy * s];
  }

  depth([x, y, z]: Vec3): number {
    const ry = x * this.sinY + y * this.cosY;
    return ry * this.sinT + z * this.cosT;
  }
}

/* shading */

function normalize([x, y, z]: Vec3): Vec3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

const LIGHT: Vec3 = normalize([-0.42, 0.34, 0.84]);

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function faceNormal(p: Vec3[]): Vec3 {
  const u: Vec3 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const v: Vec3 = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
  return normalize([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
}

function shade(base: Rgb, n: Vec3, viewDir: Vec3): Rgb {
  const diffuse = Math.max(0, dot(n, LIGHT));
  const half = normalize([LIGHT[0] + viewDir[0], LIGHT[1] + viewDir[1], LIGHT[2] + viewDir[2]]);
  const spec = Math.pow(Math.max(0, dot(n, half)), 40) * 0.1;
  const k = 0.56 + 0.5 * diffuse;
  return mix([base[0] * k, base[1] * k, base[2] * k], [255, 255, 255], Math.min(spec, 0.4));
}

/* svg helpers */

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const pathOf = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("L")}Z`;

function signedArea(pts: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a;
}

class Bounds {
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;
  add([x, y]: [number, number], margin = 0) {
    this.x0 = Math.min(this.x0, x - margin);
    this.y0 = Math.min(this.y0, y - margin);
    this.x1 = Math.max(this.x1, x + margin);
    this.y1 = Math.max(this.y1, y + margin);
  }
}

/* key placement */

const PLUS_GAP = 0.5;

function placeRow(spec: SceneSpec): { keys: KeyInstance[]; plus: Vec3[] } {
  const plus: Vec3[] = [];
  const gap = spec.showPlus ? PLUS_GAP : 0.08;
  const total = spec.keys.reduce((sum, k) => sum + rowWidth(k.code), 0) + gap * Math.max(0, spec.keys.length - 1);
  let x = -total / 2;
  const keys = spec.keys.map(({ code }, i) => {
    const w = rowWidth(code);
    const inst: KeyInstance = { code, x, y: -0.5, w, h: 1, selected: true, distance: 0 };
    x += w;
    if (spec.showPlus && i < spec.keys.length - 1) plus.push([(x + gap / 2) * UNIT, 0, 0]);
    x += gap;
    return inst;
  });
  return { keys, plus };
}

function placeFull(spec: SceneSpec): KeyInstance[] {
  const layout = layoutKeys(spec.context.layout, spec.platform, spec.keyboard?.numpad ?? false);
  const wanted = new Set(spec.keys.map((k) => k.code));
  const maxX = Math.max(...layout.map((k) => k.x + k.w));
  const maxY = Math.max(...layout.map((k) => k.y + k.h));
  const out: KeyInstance[] = layout.map((k) => ({ ...k, selected: wanted.has(k.code), distance: 0 }));

  // Custom labels and keys missing from this layout sit in a row under the keyboard.
  let x = 0;
  for (const k of spec.keys) {
    if (layout.some((placed) => placed.code === k.code)) continue;
    const w = rowWidth(k.code);
    out.push({ code: k.code, x, y: maxY + 0.5, w, h: 1, selected: true, distance: 0 });
    x += w + 0.1;
  }
  return out.map((k) => ({ ...k, x: k.x - maxX / 2, y: k.y - maxY / 2 }));
}

/** Keeps the keyboard's unmoving keys ready, so animation frames only redraw pressed keys. */
const keyboardCache = new Map<string, { backdrop: string; foreground: string; x0: number; y0: number; x1: number; y1: number }>();

function placeInLayout(spec: SceneSpec): KeyInstance[] | null {
  const layout = layoutKeys(spec.context.layout, spec.platform, spec.keyboard?.numpad ?? false);
  const wanted = new Set(spec.keys.map((k) => k.code));
  const chosen = layout.filter((k) => wanted.has(k.code));
  if (chosen.length === 0) return null;

  const out: KeyInstance[] = [];
  for (const key of layout) {
    const selected = wanted.has(key.code);
    let distance = 0;
    if (!selected) {
      distance = Infinity;
      for (const s of chosen) {
        const dx = Math.max(s.x - (key.x + key.w), key.x - (s.x + s.w), 0);
        const dy = Math.max(s.y - (key.y + key.h), key.y - (s.y + s.h), 0);
        distance = Math.min(distance, Math.hypot(dx, dy));
      }
      if (distance > spec.context.reach) continue;
    }
    out.push({ ...key, selected, distance });
  }

  // Custom labels have no place on a layout, so they sit beside it.
  const maxX = Math.max(...chosen.map((s) => s.x + s.w));
  let x = maxX + spec.context.reach + 0.5;
  for (const k of spec.keys) {
    if (chosen.some((s) => s.code === k.code)) continue;
    const w = rowWidth(k.code);
    out.push({ code: k.code, x, y: chosen[0].y, w, h: 1, selected: true, distance: 0 });
    x += w + 0.1;
  }

  const cx = (Math.min(...chosen.map((s) => s.x)) + maxX) / 2;
  const cy = (Math.min(...chosen.map((s) => s.y)) + Math.max(...chosen.map((s) => s.y + s.h))) / 2;
  return out.map((k) => ({ ...k, x: k.x - cx, y: k.y - cy }));
}

/* drawing */

function capFaces(mesh: { quads: Vec3[][]; top: Vec3[]; quadLayers?: number[] }, base: Rgb, camera: Camera, dz: number, bounds?: Bounds): string {
  const faces: { depth: number; fill: string; d: string }[] = [];
  const LAYER = 1e6;
  const addFace = (points: Vec3[], normal: Vec3, layer: number) => {
    const moved = points.map((p): Vec3 => [p[0], p[1], p[2] - dz]);
    const projected = moved.map((p) => camera.project(p));
    if (signedArea(projected) <= 0) return;
    faces.push({
      depth: layer * LAYER + moved.reduce((sum, p) => sum + camera.depth(p), 0) / moved.length,
      fill: toHex(shade(base, normal, camera.viewDir)),
      d: pathOf(projected),
    });
    if (bounds) projected.forEach((p) => bounds.add(p));
  };
  mesh.quads.forEach((quad, i) => addFace(quad, faceNormal(quad), mesh.quadLayers?.[i] ?? 0));
  // A plus has concave corners, so its faces draw from the ground up with the top last.
  addFace(mesh.top, [0, 0, 1], mesh.quadLayers ? mesh.quadLayers.length : 0);
  faces.sort((a, b) => a.depth - b.depth);

  // Each face is stroked in its own colour so no seams show between faces.
  let out = "";
  let run = "";
  let fill = "";
  const flush = () => {
    if (run) out += `<path fill="${fill}" stroke="${fill}" d="${run}"/>`;
    run = "";
  };
  for (const face of faces) {
    if (face.fill !== fill) {
      flush();
      fill = face.fill;
    }
    run += face.d;
  }
  flush();
  return out;
}

function glyphPath(font: Font, text: string, size: number, toScreen: (x: number, y: number) => [number, number]): string {
  const pt = (x: number, y: number) => {
    const [sx, sy] = toScreen(x, y);
    return `${fmt(sx)} ${fmt(sy)}`;
  };
  let d = "";
  for (const c of font.getPath(text, 0, 0, size).commands) {
    if (c.type === "M") d += `M${pt(c.x, c.y)}`;
    else if (c.type === "L") d += `L${pt(c.x, c.y)}`;
    else if (c.type === "Q") d += `Q${pt(c.x1, c.y1)} ${pt(c.x, c.y)}`;
    else if (c.type === "C") d += `C${pt(c.x1, c.y1)} ${pt(c.x2, c.y2)} ${pt(c.x, c.y)}`;
    else d += "Z";
  }
  return d;
}

function legendPaths(font: Font, legend: Legend, mesh: CapMesh, camera: Camera, dz: number, ink: string): string {
  const place = (text: string, wanted: number, align: "center" | "left" | "right", fx: number, fy: number, opacity = 1): string => {
    if (!text) return "";
    const first = font.getPath(text, 0, 0, wanted).getBoundingBox();
    const size = wanted * Math.min(1, mesh.legendW / Math.max(first.x2 - first.x1, 1));
    const box = font.getPath(text, 0, 0, size).getBoundingBox();
    const width = box.x2 - box.x1;
    const anchorX = mesh.cx + fx * mesh.legendW;
    const anchorY = mesh.cy + fy * mesh.legendD;
    const ox = (align === "center" ? anchorX - width / 2 : align === "left" ? anchorX : anchorX - width) - box.x1;
    const oy = anchorY - (box.y1 + box.y2) / 2;
    const d = glyphPath(font, text, size, (x, y) => {
      const wx = x + ox;
      const wy = y + oy;
      return camera.project([wx, wy, mesh.surfaceZ(wx, wy) + 0.2 - dz]);
    });
    return `<path fill="${ink}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ""} d="${d}"/>`;
  };

  const min = Math.min(mesh.legendW, mesh.legendD);
  if (legend.windowsLogo) {
    const pane = min * 0.21;
    const gap = min * 0.035;
    let d = "";
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const near = gap / 2;
      const far = near + pane;
      const x0 = mesh.cx + sx * near;
      const x1 = mesh.cx + sx * far;
      const y0 = mesh.cy + sy * near;
      const y1 = mesh.cy + sy * far;
      const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      d += pathOf(corners.map(([x, y]) => camera.project([x, y, mesh.surfaceZ(x, y) + 0.2 - dz])));
    }
    return `<path fill="${ink}" d="${d}"/>`;
  }
  if (legend.word) return place(legend.main, min * 0.42, "center", 0, -0.13) + place(legend.word, min * 0.2, "center", 0, 0.31);
  if (legend.shift) return place(legend.shift, min * 0.36, "center", 0, -0.25) + place(legend.main, min * 0.36, "center", 0, 0.25);
  const chars = [...legend.main].length;
  const size = chars <= 1 ? min * 0.62 : chars <= 3 ? min * 0.38 : min * 0.27;
  if (legend.jamo) {
    // Windows reads top left to bottom right; Mac mirrors it, with the letter top right.
    const mac = legend.platform === "mac";
    return (
      place(legend.main, min * 0.42, mac ? "right" : "left", mac ? 0.46 : -0.46, -0.25) +
      place(legend.jamo, min * 0.36, mac ? "left" : "right", mac ? -0.46 : 0.46, 0.27, 0.8)
    );
  }
  return place(legend.main, size, "center", 0, 0);
}

/* scene */

export interface AnimatedCap {
  /** Position of this key in the pressed sequence. */
  index: number;
  /** Static parts that sit behind this key. */
  before: string;
  rest: string;
  tinted: string;
  originX: number;
  originY: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface RenderedScene {
  svg: string;
  width: number;
  height: number;
  /** Pieces reused by the animated export. */
  defs: string;
  backdrop: string;
  foreground: string;
  caps: AnimatedCap[];
  viewBox: [number, number, number, number];
}

const TINT = 0.55;

/** Renders a scene. `press` holds a 0-1 amount per key in `spec.keys`. */
export function buildScene(spec: SceneSpec, font: Font, press: number[] = []): RenderedScene {
  const full = spec.keyboard?.enabled ?? false;
  const layoutPlaced = full ? placeFull(spec) : spec.context.enabled ? placeInLayout(spec) : null;
  const { keys, plus } = layoutPlaced ? { keys: layoutPlaced, plus: [] as Vec3[] } : placeRow(spec);

  const extent = keys.reduce((m, k) => Math.max(m, Math.abs(k.x), Math.abs(k.x + k.w), Math.abs(k.y), Math.abs(k.y + k.h)), 0) * UNIT * 2;
  const camera = new Camera(spec.view, extent);
  const travel = keyTravel(spec.style.profile);
  const bounds = new Bounds();
  const capBase = parseHex(spec.style.cap);
  const modBase = parseHex(spec.style.modifier);
  const accent = parseHex(spec.style.accent);

  const meshOf = (k: KeyInstance, detail: "full" | "lite") =>
    buildCap((k.x + k.w / 2) * UNIT, (k.y + k.h / 2) * UNIT, k.w, k.h, spec.style.profile, detail);
  const depthOf = (k: KeyInstance) => camera.depth([(k.x + k.w / 2) * UNIT, (k.y + k.h / 2) * UNIT, 0]);
  const colorOf = (code: string) => (isModifier(code) ? modBase : capBase);

  let defs = "";
  let backdrop = "";
  let foreground = "";

  const others = keys.filter((k) => !k.selected).sort((a, b) => depthOf(a) - depthOf(b));
  const emphasise = full && (spec.keyboard?.highlight ?? false) && keys.some((k) => k.selected);

  /* The whole keyboard, sharp and in depth order, on its body. */
  if (full) {
    const cacheKey = JSON.stringify(spec);
    let cached = keyboardCache.get(cacheKey);
    if (!cached) {
      const region = new Bounds();
      const ex0 = Math.min(...keys.map((k) => k.x)) * UNIT;
      const ex1 = Math.max(...keys.map((k) => k.x + k.w)) * UNIT;
      const ey0 = Math.min(...keys.map((k) => k.y)) * UNIT;
      const ey1 = Math.max(...keys.map((k) => k.y + k.h)) * UNIT;
      const body = buildCase((ex0 + ex1) / 2, (ey0 + ey1) / 2, ex1 - ex0 + 44, ey1 - ey0 + 44);
      const bodyColor = mix(modBase, [0, 0, 0], 0.5);
      let cachedBackdrop = "";
      if (spec.shadow) {
        const pts = body.base.map(([x, y]) => camera.project([x + 8, y + 12, -36]));
        pts.forEach((p) => region.add(p, 30));
        defs += `<filter id="ks-shadow" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="12"/></filter>`;
        cachedBackdrop += `<path d="${pathOf(pts)}" fill="#000" fill-opacity=".34" filter="url(#ks-shadow)"/>`;
      }
      cachedBackdrop += capFaces(body, bodyColor, camera, 0, region);
      const chosenKeys = keys.filter((k) => k.selected);
      let cachedForeground = "";
      for (const k of others) {
        const mesh = meshOf(k, "lite");
        const color = emphasise ? mix(colorOf(k.code), bodyColor, 0.3) : colorOf(k.code);
        const ink = emphasise ? toHex(mix(parseHex(spec.style.legend), color, 0.42)) : spec.style.legend;
        const legend = legendFor(k.code, spec.platform, spec.style.jamo);
        const markup = capFaces(mesh, color, camera, 0, region) + legendPaths(font, legend, mesh, camera, 0, ink);
        // A key nearer the viewer than the chosen key next to it draws over that key.
        const near = chosenKeys.some((c) => Math.abs(c.x + c.w / 2 - (k.x + k.w / 2)) + Math.abs(c.y + c.h / 2 - (k.y + k.h / 2)) < 2.5 && depthOf(k) > depthOf(c));
        if (near) cachedForeground += markup;
        else cachedBackdrop += markup;
      }
      cached = { backdrop: cachedBackdrop, foreground: cachedForeground, x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1 };
      if (keyboardCache.size >= 6) keyboardCache.clear();
      keyboardCache.set(cacheKey, cached);
    } else if (spec.shadow) {
      defs += `<filter id="ks-shadow" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="12"/></filter>`;
    }
    backdrop += cached.backdrop;
    foreground = cached.foreground;
    bounds.add([cached.x0, cached.y0]);
    bounds.add([cached.x1, cached.y1]);
  }

  /* Surrounding keys: blur grows with distance, and the outer edge fades away. */
  if (!full && others.length > 0) {
    const tiers = [0.34, 0.67, 1];
    const blurAttr = tiers.map((t, i) => {
      const sd = spec.context.blur * t;
      if (sd <= 0.05) return "";
      defs += `<filter id="ks-blur${i}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${fmt(sd)}"/></filter>`;
      return ` filter="url(#ks-blur${i})"`;
    });
    const chosenKeys = keys.filter((k) => k.selected);
    const centre = (k: KeyInstance): [number, number] => [k.x + k.w / 2, k.y + k.h / 2];
    const nearestChosen = (k: KeyInstance) => {
      const [x, y] = centre(k);
      return chosenKeys.reduce((best, c) => {
        const [bx, by] = centre(best);
        const [cx2, cy2] = centre(c);
        return Math.hypot(cx2 - x, cy2 - y) < Math.hypot(bx - x, by - y) ? c : best;
      });
    };
    // Keys nearer the viewer than the chosen key are drawn over it, so it sits in the keyboard.
    let behind = "";
    let inFront = "";
    const region = new Bounds();
    for (const k of others) {
      const mesh = meshOf(k, "lite");
      const faces = capFaces(mesh, colorOf(k.code), camera, 0, region);
      const tier = tiers.findIndex((t) => k.distance <= t * spec.context.reach);
      const markup = `<g${blurAttr[tier === -1 ? 2 : tier]}>${faces}${legendPaths(font, legendFor(k.code, spec.platform, false), mesh, camera, 0, spec.style.legend)}</g>`;
      if (depthOf(k) > depthOf(nearestChosen(k))) inFront += markup;
      else behind += markup;
    }
    const cx = (region.x0 + region.x1) / 2;
    const cy = (region.y0 + region.y1) / 2;
    const rx = (region.x1 - region.x0) / 2;
    const ry = (region.y1 - region.y0) / 2;
    defs += `<radialGradient id="ks-fade"><stop offset=".62" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    defs += `<mask id="ks-mask" maskUnits="userSpaceOnUse" x="${fmt(region.x0)}" y="${fmt(region.y0)}" width="${fmt(rx * 2)}" height="${fmt(ry * 2)}"><ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="url(#ks-fade)"/></mask>`;
    if (behind) backdrop += `<g mask="url(#ks-mask)">${behind}</g>`;
    if (inFront) foreground = `<g mask="url(#ks-mask)">${inFront}</g>`;
    bounds.add([region.x0, region.y0]);
    bounds.add([region.x1, region.y1]);
  }

  /* Chosen keys, back to front. */
  const chosen = keys
    .filter((k) => k.selected)
    .sort((a, b) => depthOf(a) - depthOf(b))
    .map((key) => ({ key, mesh: meshOf(key, "full"), index: spec.keys.findIndex((s) => s.code === key.code) }));

  const plusParts = plus.map((center) => ({ mesh: buildPlus(center[0], center[1]), depth: camera.depth(center) })).sort((a, b) => a.depth - b.depth);

  if (!full && spec.shadow && others.length === 0 && chosen.length > 0) {
    defs += `<filter id="ks-shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>`;
    let d = "";
    for (const { mesh } of chosen) {
      const pts = mesh.base.map(([x, y]) => camera.project([x + 5, y + 8, -1]));
      pts.forEach((p) => bounds.add(p, 22));
      d += pathOf(pts);
    }
    for (const { mesh } of plusParts) {
      d += pathOf(mesh.base.map(([x, y]) => camera.project([x + 2, y + 3, -1])));
    }
    backdrop += `<path d="${d}" fill="#000" fill-opacity=".32" filter="url(#ks-shadow)"/>`;
  }

  // Parts are woven between keys by depth, so a key behind a plus never covers it.
  const plusMarkup = plusParts.map((part) => ({ depth: part.depth, markup: capFaces(part.mesh, modBase, camera, 0, bounds) }));
  const takePlusBefore = (depth: number) => {
    let out = "";
    while (plusMarkup.length > 0 && plusMarkup[0].depth < depth) out += plusMarkup.shift()!.markup;
    return out;
  };

  const caps: AnimatedCap[] = [];
  let flat = "";
  for (const { key, mesh, index } of chosen) {
    const before = takePlusBefore(depthOf(key));
    flat += before;
    const amount = press[index] ?? 0;
    const plain = colorOf(key.code);
    const base = emphasise ? mix(plain, accent, 0.88) : plain;
    const pressedColor = emphasise ? mix(base, [0, 0, 0], 0.28) : mix(base, accent, TINT);
    const capInk = emphasise ? (0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2] > 150 ? "#14181b" : "#ffffff") : spec.style.legend;
    const legend = legendFor(key.code, spec.platform, spec.style.jamo);
    const draw = (color: Rgb, dz: number) => capFaces(mesh, color, camera, dz) + legendPaths(font, legend, mesh, camera, dz, capInk);

    // Bounds cover both resting and pressed poses so frames never shift.
    capFaces(mesh, base, camera, 0, bounds);
    capFaces(mesh, base, camera, travel, bounds);

    const rest = draw(base, 0);
    flat += amount > 0 ? draw(mix(base, pressedColor, amount), travel * amount) : rest;

    const [ox, oy] = camera.project([mesh.cx, mesh.cy, mesh.height]);
    const [px, py] = camera.project([mesh.cx, mesh.cy, mesh.height - travel]);
    const edge = camera.project([mesh.cx + mesh.w / 2, mesh.cy, mesh.height]);
    const edgeDown = camera.project([mesh.cx + mesh.w / 2, mesh.cy, mesh.height - travel]);
    caps.push({
      index,
      before,
      rest,
      tinted: draw(pressedColor, 0),
      originX: ox,
      originY: oy,
      offsetX: px - ox,
      offsetY: py - oy,
      scale: Math.hypot(edgeDown[0] - px, edgeDown[1] - py) / Math.max(1e-6, Math.hypot(edge[0] - ox, edge[1] - oy)),
    });
  }

  foreground = plusMarkup.map((part) => part.markup).join("") + foreground;

  const pad = 26;
  if (bounds.x0 === Infinity) {
    bounds.add([0, 0]);
  }
  const viewBox: [number, number, number, number] = [
    bounds.x0 - pad,
    bounds.y0 - pad,
    bounds.x1 - bounds.x0 + pad * 2,
    bounds.y1 - bounds.y0 + pad * 2,
  ];
  const width = Math.ceil(viewBox[2]);
  const height = Math.ceil(viewBox[3]);
  const svg = openSvg(viewBox, width, height) + (defs ? `<defs>${defs}</defs>` : "") + backgroundRect(viewBox, spec.background) + backdrop + flat + foreground + "</svg>";
  return { svg, width, height, defs, backdrop, foreground, caps, viewBox };
}

/** The scale that keeps an image inside a box, never going above the wanted scale. */
export function scaleWithin(width: number, height: number, wanted: number, maxWidth: number, maxHeight: number): number {
  return Math.min(wanted, maxWidth / width, maxHeight / height);
}

export function openSvg(viewBox: number[], width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox.map(fmt).join(" ")}" stroke-width=".5" stroke-linejoin="round">`;
}

export function backgroundRect(viewBox: number[], background: string | null): string {
  if (!background) return "";
  const [x, y, w, h] = viewBox.map(fmt);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${background}"/>`;
}
