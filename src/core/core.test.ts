import { readFileSync } from "node:fs";
import { parse } from "opentype.js";
import { describe, expect, it } from "vitest";
import { animatedSvg, duration, pressAt } from "./animation";
import { codeFromEvent, parseCombo } from "./keys";
import { layoutKeys } from "./layouts";
import { buildScene, type SceneSpec } from "./scene";

const file = readFileSync("node_modules/pretendard/dist/web/static/woff/Pretendard-SemiBold.woff");
const font = parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

const spec = (text: string, patch: Partial<SceneSpec> = {}): SceneSpec => ({
  keys: parseCombo(text),
  platform: "windows",
  view: { tilt: 45, yaw: -25, perspective: 0.3 },
  style: { profile: "sculpted", cap: "#e8e8e4", modifier: "#a9adb1", legend: "#22272b", accent: "#1f6feb", jamo: false },
  context: { enabled: false, layout: "ansi", reach: 1.5, blur: 6 },
  showPlus: true,
  shadow: true,
  background: null,
  ...patch,
});

const codes = (text: string) => parseCombo(text).map((k) => k.code);

describe("parseCombo", () => {
  it("reads common spellings", () => {
    expect(codes("Ctrl + Shift + Z")).toEqual(["lctrl", "lshift", "z"]);
    expect(codes("cmd-c")).toEqual(["lmeta", "c"]);
    expect(codes("⌘⇧Z")).toEqual(["lmeta", "lshift", "z"]);
    expect(codes("c")).toEqual(["c"]);
    expect(codes("F12")).toEqual(["f12"]);
  });
  it("treats plus and minus as keys when they stand alone", () => {
    expect(codes("Ctrl + +")).toEqual(["lctrl", "equal"]);
    expect(codes("Ctrl + -")).toEqual(["lctrl", "minus"]);
    expect(codes("+")).toEqual(["equal"]);
  });
  it("keeps Hangul key names and unknown labels", () => {
    expect(codes("한/영")).toEqual(["hangul"]);
    expect(codes("Ctrl + 저장")).toEqual(["lctrl", "custom:저장"]);
  });
  it("ignores repeats and empty text", () => {
    expect(codes("a + a")).toEqual(["a"]);
    expect(codes("  ")).toEqual([]);
  });
});

describe("codeFromEvent", () => {
  it("maps browser key codes", () => {
    expect(codeFromEvent("KeyC")).toBe("c");
    expect(codeFromEvent("Digit5")).toBe("5");
    expect(codeFromEvent("ControlLeft")).toBe("lctrl");
    expect(codeFromEvent("F13")).toBeNull();
  });
});

describe("layouts", () => {
  it.each(["ansi", "korean"] as const)("%s main rows span the same width", (id) => {
    const keys = layoutKeys(id, "windows");
    const widthOf = (top: string) => {
      const y = keys.find((k) => k.code === top)!.y;
      const row = keys.filter((k) => k.y === y && k.x < 15);
      return Math.max(...row.map((k) => k.x + k.w));
    };
    for (const code of ["backquote", "tab", "capslock", "lctrl"]) expect(widthOf(code)).toBe(15);
  });
  it("swaps command and option on Mac", () => {
    const find = (p: "mac" | "windows", code: string) => layoutKeys("ansi", p).find((k) => k.code === code)!.x;
    expect(find("mac", "lmeta")).toBe(find("windows", "lalt"));
  });
});

describe("buildScene", () => {
  it("produces paths only, with no font dependency", () => {
    const { svg, width, height } = buildScene(spec("C"), font);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("<text");
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(width).toBeGreaterThan(50);
    expect(height).toBeGreaterThan(50);
  });
  it.each([0, 30, 45, 60])("renders at %d degrees", (tilt) => {
    const { svg } = buildScene(spec("Ctrl + Shift + Z", { view: { tilt, yaw: 0, perspective: 0 } }), font);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
  it("keeps the frame size while a key is pressed", () => {
    const rest = buildScene(spec("C"), font);
    const pressed = buildScene(spec("C"), font, [1]);
    expect(pressed.viewBox).toEqual(rest.viewBox);
    expect(pressed.svg).not.toEqual(rest.svg);
  });
  it("shows surrounding keys only when asked", () => {
    expect(buildScene(spec("C"), font).svg).not.toContain("ks-mask");
    const context = spec("C", { context: { enabled: true, layout: "ansi", reach: 1.5, blur: 6 } });
    const { svg } = buildScene(context, font);
    expect(svg).toContain("ks-mask");
    expect(svg).toContain("feGaussianBlur");
  });
  it("falls back to a row for labels not on the layout", () => {
    const context = spec("저장", { context: { enabled: true, layout: "ansi", reach: 1.5, blur: 6 } });
    expect(buildScene(context, font).svg).not.toContain("ks-mask");
  });
});

describe("animation", () => {
  const motion = { travel: 100, stagger: 50, hold: 200, pause: 300 };
  it("presses in order, releases in reverse, and ends at rest", () => {
    const total = duration(motion, 2);
    expect(pressAt(motion, 0, 2, 0)).toBe(0);
    expect(pressAt(motion, 0, 2, 300)).toBe(1);
    expect(pressAt(motion, 1, 2, 300)).toBeLessThan(1);
    expect(pressAt(motion, 0, 2, total)).toBe(0);
    expect(pressAt(motion, 1, 2, total)).toBe(0);
    const release = 200 + 50 + 100 + 200;
    expect(pressAt(motion, 1, 2, release + 100)).toBe(0);
    expect(pressAt(motion, 0, 2, release + 50)).toBe(1);
  });
  it("exports vector animation for every key", () => {
    const svg = animatedSvg(spec("Ctrl + C"), font, motion);
    expect(svg).toContain("@keyframes k0m");
    expect(svg).toContain("@keyframes k1m");
    expect(svg).not.toContain("<script");
  });
});
