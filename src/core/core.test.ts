import { readFileSync } from "node:fs";
import { parse } from "opentype.js";
import { describe, expect, it } from "vitest";
import { animatedSvg, duration, pressAt } from "./animation";
import { buildFlatImage } from "./flat";
import { bothToText, codeFromEvent, comboToText, macComboToText, parseCombo, windowsResultText } from "./keys";
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
    expect(codes("⌃C")).toEqual(["lctrl", "c"]);
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
    return [comboToText(keys), macComboToText(keys)];
  };
  it("gives each platform its own shortcut", () => {
    expect(texts("Ctrl + C")).toEqual(["Ctrl + C", "⌃C"]);
    expect(texts("Ctrl + Shift + Z")).toEqual(["Ctrl + Shift + Z", "⌃⇧Z"]);
    expect(texts("⌘⇧Z")).toEqual(["Win + Shift + Z", "⇧⌘Z"]);
    expect(texts("Cmd + E")).toEqual(["Win + E", "⌘E"]);
    expect(texts("Ctrl + Alt + Delete")).toEqual(["Ctrl + Alt + Delete", "⌃⌥⌦"]);
    expect(texts("Win + E")).toEqual(["Win + E", "⌘E"]);
  });
  it("keeps the Win word in the input field text", () => {
    expect(comboToText(parseCombo("Win + E"))).toBe("Win + E");
  });
  it("handles single keys and named keys", () => {
    expect(texts("C")).toEqual(["C", "C"]);
    expect(texts("Ctrl + Enter")).toEqual(["Ctrl + Enter", "⌃⏎"]);
    expect(texts("Ctrl + Space")).toEqual(["Ctrl + Space", "⌃Space"]);
  });
  it("brackets Windows keys and uses the Windows key character", () => {
    expect(windowsResultText(parseCombo("Ctrl + C"))).toBe("[Ctrl]+[C]");
    expect(windowsResultText(parseCombo("Ctrl + Shift + Z"))).toBe("[Ctrl]+[Shift]+[Z]");
    expect(windowsResultText(parseCombo("Win + E"))).toBe("⊞+[E]");
    expect(windowsResultText(parseCombo("⊞ + E"))).toBe("⊞+[E]");
    expect(windowsResultText(parseCombo("C"))).toBe("[C]");
    expect(windowsResultText(parseCombo("Ctrl + Space"))).toBe("[Ctrl]+[Space]");
  });
  it("joins both on one line", () => {
    expect(bothToText(parseCombo("Ctrl + C"))).toBe("Windows: [Ctrl]+[C], Mac: ⌃C");
  });
});

describe("buildFlatImage", () => {
  const style = spec("C").style;
  const flat = (text: string, platform: "windows" | "mac", plus = true, height = 32) =>
    buildFlatImage(parseCombo(text), platform, font, style, plus, height);
  it("matches the requested height and has no live text", () => {
    const image = flat("Ctrl + Shift + Z", "windows");
    expect(image.height).toBe(32);
    expect(image.svg).not.toContain("<text");
    expect(image.svg).not.toMatch(/NaN|Infinity/);
    expect(flat("C", "windows", true, 96).height).toBe(96);
  });
  it("is square-ish for one key and wider for a combination", () => {
    expect(flat("C", "windows").width).toBeLessThanOrEqual(34);
    expect(flat("Ctrl + C", "windows").width).toBeGreaterThan(flat("C", "windows").width * 2);
  });
  it("draws the four-pane Windows logo only on Windows", () => {
    const rects = (svg: string) => (svg.match(/<rect /g) ?? []).length;
    expect(rects(flat("Win", "windows").svg)).toBe(6);
    expect(rects(flat("Win", "mac").svg)).toBe(2);
  });
  it("leaves out the plus when asked", () => {
    expect(flat("Ctrl + C", "windows", false).width).toBeLessThan(flat("Ctrl + C", "windows", true).width);
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
  it("draws the Windows logo on the Win key instead of text", () => {
    const legendPath = (platform: "windows" | "mac", code: string) => {
      const { svg } = buildScene(spec(code, { platform, keys: [{ code: "lmeta" }] }), font);
      return svg.match(/fill="#22272b" d="([^"]+)"/g) ?? [];
    };
    const logo = legendPath("windows", "Win");
    expect(logo).toHaveLength(1);
    expect((logo[0]!.match(/M/g) ?? []).length).toBe(4);
    expect(logo[0]!).not.toMatch(/[QC]/);
    expect(legendPath("mac", "Win").length).toBeGreaterThan(1);
  });
  it("places the letter and jamo in the corners each platform uses", () => {
    const centre = (d: string) => {
      const values = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const xs = values.filter((_, i) => i % 2 === 0);
      const ys = values.filter((_, i) => i % 2 === 1);
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as const;
    };
    const place = (platform: "windows" | "mac") => {
      const base = spec("C");
      const { svg } = buildScene({ ...base, platform, view: { tilt: 0, yaw: 0, perspective: 0 }, style: { ...base.style, jamo: true } }, font);
      const letter = /fill="#22272b" d="([^"]+)"/.exec(svg)![1]!;
      const jamo = /fill="#22272b" fill-opacity="[^"]+" d="([^"]+)"/.exec(svg)![1]!;
      return { letter: centre(letter), jamo: centre(jamo) };
    };
    const windows = place("windows");
    expect(windows.letter[0]).toBeLessThan(0);
    expect(windows.letter[1]).toBeLessThan(0);
    expect(windows.jamo[0]).toBeGreaterThan(0);
    expect(windows.jamo[1]).toBeGreaterThan(0);
    const mac = place("mac");
    expect(mac.letter[0]).toBeGreaterThan(0);
    expect(mac.letter[1]).toBeLessThan(0);
    expect(mac.jamo[0]).toBeLessThan(0);
    expect(mac.jamo[1]).toBeGreaterThan(0);
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

describe("full keyboard", () => {
  const options = (highlight: boolean, numpad = false) => ({ keyboard: { enabled: true, numpad, highlight } });
  const face = /<path fill="(#[0-9a-f]{6})" stroke=/g;
  it("draws without any chosen key", () => {
    const { svg, caps } = buildScene(spec("", options(true)), font);
    expect(caps).toHaveLength(0);
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(svg.length).toBeGreaterThan(50000);
    expect(svg).not.toContain("ks-mask");
    expect(svg).not.toContain("feGaussianBlur stdDeviation=\"7");
  });
  it("adds the number pad only when asked", () => {
    const off = buildScene(spec("", options(true)), font);
    const on = buildScene(spec("", options(true, true)), font);
    expect(on.width).toBeGreaterThan(off.width + 300);
    expect(layoutKeys("ansi", "windows", true).filter((k) => k.code.startsWith("num"))).toHaveLength(17);
    expect(layoutKeys("ansi", "windows").some((k) => k.code.startsWith("num"))).toBe(false);
  });
  it("keeps number pad rows inside the keyboard and free of overlaps", () => {
    const keys = layoutKeys("ansi", "windows", true);
    for (const a of keys) {
      for (const b of keys) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.code} ${b.code}`).toBe(false);
      }
    }
    expect(Math.max(...keys.map((k) => k.y + k.h))).toBe(6.25);
  });
  it("highlights chosen keys only when asked", () => {
    const colours = (svg: string) => new Set([...svg.matchAll(face)].map((m) => m[1]));
    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16) - parseInt(hex.slice(1, 3), 16) > 40;
    const on = [...colours(buildScene(spec("Ctrl + C", options(true)), font).svg)].some((c) => blue(c!));
    const off = [...colours(buildScene(spec("Ctrl + C", options(false)), font).svg)].some((c) => blue(c!));
    expect(on).toBe(true);
    expect(off).toBe(false);
  });
  it("shows Mac keys, jamo, and keeps its frame while pressed", () => {
    const base = spec("C", options(true));
    const windows = buildScene(base, font);
    const mac = buildScene({ ...base, platform: "mac" }, font);
    expect(mac.svg).not.toEqual(windows.svg);
    const jamo = buildScene({ ...base, style: { ...base.style, jamo: true } }, font);
    expect(jamo.svg).toContain("fill-opacity");
    const pressed = buildScene(base, font, [1]);
    expect(pressed.viewBox).toEqual(windows.viewBox);
    expect(pressed.svg).not.toEqual(windows.svg);
  });
  it("keeps its filter when drawn again from the cache", () => {
    const base = spec("C", options(true));
    buildScene(base, font);
    expect(buildScene(base, font).svg).toContain('id="ks-shadow"');
  });
  it("exports animation of the chosen keys", () => {
    const svg = animatedSvg(spec("Ctrl + C", options(true)), font, { travel: 100, stagger: 50, hold: 200, pause: 300 });
    expect(svg).toContain("@keyframes k1m");
  });
  it("reads number pad names back as the same key", () => {
    for (const text of ["Num1", "NumEnter", "NumAdd", "NumLock"]) {
      expect(comboToText(parseCombo(text))).toBe(text);
    }
    expect(codeFromEvent("Numpad5")).toBe("num5");
    expect(codeFromEvent("NumpadEnter")).toBe("numenter");
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
