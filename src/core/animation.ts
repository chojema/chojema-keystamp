import type { Font } from "opentype.js";
import { backgroundRect, buildScene, openSvg, type SceneSpec } from "./scene";

export interface Motion {
  /** Time for one key to travel down or up, in milliseconds. */
  travel: number;
  /** Delay between one key and the next. */
  stagger: number;
  /** How long the whole combination stays held. */
  hold: number;
  /** Rest between repeats. */
  pause: number;
}

const LEAD_IN = 200;

export function duration(motion: Motion, count: number): number {
  const n = Math.max(1, count);
  return LEAD_IN + 2 * ((n - 1) * motion.stagger + motion.travel) + motion.hold + motion.pause;
}

function ease(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Press amount of a key at a time. Keys go down in order and come up in reverse. */
export function pressAt(motion: Motion, index: number, count: number, time: number): number {
  const n = Math.max(1, count);
  const down = LEAD_IN + index * motion.stagger;
  const releaseStart = LEAD_IN + (n - 1) * motion.stagger + motion.travel + motion.hold;
  const up = releaseStart + (n - 1 - index) * motion.stagger;
  return time < up ? ease((time - down) / motion.travel) : 1 - ease((time - up) / motion.travel);
}

export function pressStates(motion: Motion, count: number, time: number): number[] {
  return Array.from({ length: count }, (_, i) => pressAt(motion, i, count, time));
}

const round = (n: number, digits = 3) => String(Math.round(n * 10 ** digits) / 10 ** digits);

/**
 * Self-contained animated vector image with no script.
 * Keys move through CSS, so the file stays small at any display size.
 */
export function animatedSvg(spec: SceneSpec, font: Font, motion: Motion): string {
  const scene = buildScene(spec, font);
  const total = duration(motion, spec.keys.length);
  const samples = 48;
  let css = "";
  let body = "";
  scene.caps.forEach((cap, i) => {
    let move = "";
    let tint = "";
    for (let s = 0; s <= samples; s++) {
      const p = pressAt(motion, cap.index, spec.keys.length, (s / samples) * total);
      const pct = round((s / samples) * 100, 2);
      move += `${pct}%{transform:translate(${round(cap.offsetX * p)}px,${round(cap.offsetY * p)}px) scale(${round(1 + (cap.scale - 1) * p, 4)})}`;
      tint += `${pct}%{opacity:${round(p)}}`;
    }
    css += `@keyframes k${i}m{${move}}@keyframes k${i}t{${tint}}`;
    css += `.k${i}{transform-origin:${round(cap.originX)}px ${round(cap.originY)}px;animation:k${i}m ${total}ms linear infinite}`;
    css += `.k${i} .t{animation:k${i}t ${total}ms linear infinite}`;
    body += `<g class="k${i}">${cap.rest}<g class="t" opacity="0">${cap.tinted}</g></g>`;
  });
  css += "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
  return (
    openSvg(scene.viewBox, scene.width, scene.height) +
    `<style>${css}</style>` +
    (scene.defs ? `<defs>${scene.defs}</defs>` : "") +
    backgroundRect(scene.viewBox, spec.background) +
    scene.backdrop +
    body +
    scene.foreground +
    "</svg>"
  );
}

export function animatedHtml(spec: SceneSpec, font: Font, motion: Motion, title: string): string {
  const safeTitle = title.replace(/[<>&]/g, "");
  const page = spec.background ?? "transparent";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>html,body{height:100%;margin:0;background:${page}}body{display:grid;place-items:center}svg{max-width:100%;max-height:100%;height:auto}</style></head><body>${animatedSvg(spec, font, motion)}</body></html>
`;
}
