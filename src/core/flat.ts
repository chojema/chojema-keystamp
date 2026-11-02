import type { Font } from "opentype.js";
import { isModifier, legendFor, type KeyRef, type Platform } from "./keys";
import type { CapStyle } from "./scene";

export interface FlatImage {
  svg: string;
  width: number;
  height: number;
}

const KEY_HEIGHT = 100;
const FACE_HEIGHT = 90;
const MARGIN = 2;
const GAP = 10;
const PLUS_SPACE = 44;

function darken(hex: string, amount: number): string {
  const v = hex.replace("#", "");
  const channel = (i: number) =>
    Math.round(parseInt(v.slice(i, i + 2), 16) * amount).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

const n = (value: number) => String(Math.round(value * 100) / 100);

/** The four-pane Windows logo. */
function windowsLogo(cx: number, cy: number, ink: string): string {
  const pane = 19;
  const gap = 3;
  let out = "";
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx < 0 ? cx - gap / 2 - pane : cx + gap / 2;
    const y = sy < 0 ? cy - gap / 2 - pane : cy + gap / 2;
    out += `<rect x="${n(x)}" y="${n(y)}" width="${pane}" height="${pane}" fill="${ink}"/>`;
  }
  return out;
}

function labelOf(code: string, platform: Platform): string {
  if (code === "space") return "Space";
  return legendFor(code, platform, false).main;
}

/**
 * Flat keycaps sized to sit in a line of text. Keys are drawn straight on, so
 * they stay legible at small sizes.
 */
export function buildFlatImage(keys: KeyRef[], platform: Platform, font: Font, style: CapStyle, showPlus: boolean, heightPx: number): FlatImage {
  const parts = keys.map(({ code }) => {
    const windowsKey = platform === "windows" && code.endsWith("meta");
    const label = labelOf(code, platform);
    const size = [...label].length <= 1 ? 54 : 44;
    const box = font.getPath(label, 0, 0, size).getBoundingBox();
    const textWidth = box.x2 - box.x1;
    return { code, windowsKey, label, size, box, width: windowsKey ? KEY_HEIGHT : Math.max(KEY_HEIGHT, textWidth + 48) };
  });

  const gap = showPlus ? PLUS_SPACE : GAP;
  const total = parts.reduce((sum, part) => sum + part.width, 0) + gap * Math.max(0, parts.length - 1) + MARGIN * 2;
  const fullHeight = KEY_HEIGHT + MARGIN * 2;

  let x = MARGIN;
  let body = "";
  parts.forEach((part, i) => {
    const base = isModifier(part.code) ? style.modifier : style.cap;
    body += `<rect x="${n(x)}" y="${MARGIN}" width="${n(part.width)}" height="${KEY_HEIGHT}" rx="17" fill="${darken(base, 0.68)}"/>`;
    body += `<rect x="${n(x)}" y="${MARGIN}" width="${n(part.width)}" height="${FACE_HEIGHT}" rx="16" fill="${base}"/>`;
    const cx = x + part.width / 2;
    const cy = MARGIN + FACE_HEIGHT / 2;
    if (part.windowsKey) {
      body += windowsLogo(cx, cy, style.legend);
    } else {
      const textX = cx - (part.box.x1 + part.box.x2) / 2;
      const textY = cy - (part.box.y1 + part.box.y2) / 2;
      body += `<path fill="${style.legend}" d="${font.getPath(part.label, textX, textY, part.size).toPathData(2)}"/>`;
    }
    x += part.width;
    if (showPlus && i < parts.length - 1) {
      const px = x + gap / 2;
      const py = MARGIN + KEY_HEIGHT / 2;
      body += `<path d="M${n(px - 10)} ${n(py)}H${n(px + 10)}M${n(px)} ${n(py - 10)}V${n(py + 10)}" fill="none" stroke="#808890" stroke-width="6" stroke-linecap="round"/>`;
    }
    x += gap;
  });

  const scale = heightPx / fullHeight;
  const width = Math.max(1, Math.round(total * scale));
  const height = Math.max(1, Math.round(heightPx));
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${n(total)} ${fullHeight}">${body}</svg>`,
    width,
    height,
  };
}
