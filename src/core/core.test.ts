import { readFileSync } from "node:fs";
import { parse } from "opentype.js";
import { describe, expect, it } from "vitest";
import { animatedSvg, duration, pressAt } from "./animation";
import { bothToText, codeFromEvent, comboToText, keysFor, macComboToText, parseCombo } from "./keys";
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
    expect(codes("cmd-c")).toEqual(["lctrl", "c"]);
    expect(codes("⌘⇧Z")).toEqual(["lctrl", "lshift", "z"]);
    expect(codes("Win + E")).toEqual(["lmeta", "e"]);
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

describe("text output", () => {
  const texts = (input: string) => {
    const keys = parseCombo(input);
    return [comboToText(keys), macComboToText(keysFor(keys, "mac"))];
  };
  it("gives each platform its own shortcut", () => {
    expect(texts("Ctrl + C")).toEqual(["Ctrl + C", "⌘C"]);
    expect(texts("Ctrl + Shift + Z")).toEqual(["Ctrl + Shift + Z", "⇧⌘Z"]);
    expect(texts("⌘⇧Z")).toEqual(["Ctrl + Shift + Z", "⇧⌘Z"]);
    expect(texts("Ctrl + Alt + Delete")).toEqual(["Ctrl + Alt + Delete", "⌥⌘⌦"]);
    expect(texts("Win + E")).toEqual(["Win + E", "⌃E"]);
  });
  it("handles single keys and named keys", () => {
    expect(texts("C")).toEqual(["C", "C"]);
    expect(texts("Ctrl + Enter")).toEqual(["Ctrl + Enter", "⌘⏎"]);
    expect(texts("Ctrl + Space")).toEqual(["Ctrl + Space", "⌘Space"]);
  });
  it("joins both on one line", () => {
    expect(bothToText(parseCombo("Ctrl + C"))).toBe("Windows: Ctrl + C, Mac: ⌘C");
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
  it("draws the plus as a solid part in every view and leaves it out when off", () => {
    const fills = (svg: string) => new Set(svg.match(/fill="#[0-9a-f]{6}"/g)).size;
    const noShadow = { shadow: false, style: { profile: "low" as const, cap: "#808080", modifier: "#808080", legend: "#000000", accent: "#1f6feb", jamo: false } };
    const on = buildScene(spec("Ctrl + C", noShadow), font).svg;
    const off = buildScene(spec("Ctrl + C", { ...noShadow, showPlus: false }), font).svg;
    expect(on.length).toBeGreaterThan(off.length);
    expect(fills(on)).toBeGreaterThan(1);
    for (const tilt of [0, 30, 45, 60, 85]) {
      for (const yaw of [-180, -90, 0, 45, 90]) {
        expect(buildScene(spec("Ctrl + C", { view: { tilt, yaw, perspective: 0.5 } }), font).svg).not.toMatch(/NaN|Infinity/);
      }
    }
  });
  it("keeps the plus in the animated export", () => {
    const motion = { travel: 100, stagger: 50, hold: 200, pause: 300 };
    const on = animatedSvg(spec("Ctrl + C"), font, motion);
    const off = animatedSvg(spec("Ctrl + C", { showPlus: false }), font, motion);
    expect(on.length).toBeGreaterThan(off.length);
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
