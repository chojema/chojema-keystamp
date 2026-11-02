import { parse, type Font } from "opentype.js";
import fontUrl from "pretendard/dist/web/static/woff/Pretendard-SemiBold.woff?url";
import { animatedHtml, duration, pressStates, type Motion } from "../core/animation";
import { buildFlatImage } from "../core/flat";
import { bothToText, codeFromEvent, comboToText, isModifier, legendFor, macComboToText, parseCombo, windowsResultText, type KeyRef, type Platform } from "../core/keys";
import { layoutKeys, type LayoutId } from "../core/layouts";
import type { Profile } from "../core/mesh";
import { buildScene, scaleWithin, type SceneSpec } from "../core/scene";
import { t, type Strings } from "./i18n";
import { copyImage, copyText, saveFile } from "./native";
import { encodeApng, encodeGif, pngBlob, rasterize, type Frame } from "./raster";
import notices from "./notices.txt?raw";
import "./styles.css";

type Display = "both" | Platform;
type Scope = "keys" | "nearby" | "full";

interface Theme {
  name: string;
  cap: string;
  modifier: string;
  legend: string;
  accent: string;
}

const THEMES: Theme[] = [
  { name: "Paper", cap: "#ebe9e2", modifier: "#b9bcb8", legend: "#23282c", accent: "#2563c9" },
  { name: "Graphite", cap: "#3a3f45", modifier: "#25292d", legend: "#f1f2f0", accent: "#e8833a" },
  { name: "Retro", cap: "#d9d2bd", modifier: "#8f8a7b", legend: "#2a2820", accent: "#c8452f" },
  { name: "Ocean", cap: "#1f5f7a", modifier: "#134257", legend: "#e9f6f7", accent: "#f2c14e" },
  { name: "Mint", cap: "#c9e4d6", modifier: "#7fb49c", legend: "#17352a", accent: "#2f6fd0" },
];

const initial = {
  text: "Ctrl + C",
  platform: (navigator.userAgent.includes("Mac") ? "mac" : "windows") as Platform,
  tilt: 45,
  yaw: -25,
  perspective: 0.15,
  profile: "sculpted" as Profile,
  ...THEMES[0],
  jamo: false,
  showPlus: true,
  shadow: true,
  transparent: true,
  background: "#ffffff",
  context: false,
  layout: "korean" as LayoutId,
  reach: 1.5,
  blur: 7,
  travel: 110,
  stagger: 90,
  hold: 450,
  pause: 700,
  fps: 30,
  scale: 4,
  inlineHeight: 32,
  display: "both" as Display,
  scope: "keys" as Scope,
  keyboardPlatform: "windows" as Platform,
  numpad: false,
  highlight: true,
};

type State = typeof initial;
const STORAGE_KEY = "keystamp-settings";

function loadState(): State {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    // Earlier versions stored the surrounding keys choice as a checkbox.
    if (saved.context && !saved.scope) saved.scope = "nearby";
    return { ...initial, ...saved };
  } catch {
    return { ...initial };
  }
}

const state = loadState();
let keys: KeyRef[] = parseCombo(state.text);
let font: Font | null = null;
let playing = false;
let playStart = 0;
let frameHandle = 0;

/* small DOM helpers */

type Attrs = Record<string, string | boolean | ((event: Event) => void)>;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "function") node.addEventListener(key, value);
    else if (key === "class") node.className = String(value);
    else if (typeof value === "boolean") (node as unknown as Record<string, boolean>)[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function update(patch: Partial<State>) {
  Object.assign(state, patch);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Settings simply are not remembered when storage is unavailable.
  }
  syncControls();
  draw();
}

const syncers: (() => void)[] = [];
function syncControls() {
  syncers.forEach((fn) => fn());
}

type NumericKey = { [K in keyof State]: State[K] extends number ? K : never }[keyof State];
type BooleanKey = { [K in keyof State]: State[K] extends boolean ? K : never }[keyof State];
type ColorKey = "cap" | "modifier" | "legend" | "accent" | "background";

function slider(label: string, key: NumericKey, min: number, max: number, step: number, unit = "") {
  const output = el("output");
  const input = el("input", {
    type: "range", min: String(min), max: String(max), step: String(step),
    "aria-label": label,
    input: () => update({ [key]: Number(input.value) } as Partial<State>),
  });
  syncers.push(() => {
    input.value = String(state[key]);
    output.textContent = `${Math.round(state[key] * 100) / 100}${unit}`;
  });
  return el("label", { class: "row slider" }, el("span", {}, label), input, output);
}

function toggle(label: string, key: BooleanKey) {
  const input = el("input", {
    type: "checkbox",
    change: () => update({ [key]: input.checked } as Partial<State>),
  });
  syncers.push(() => {
    input.checked = state[key];
  });
  return el("label", { class: "row check" }, input, el("span", {}, label));
}

function segmented<V extends string>(label: string, options: [V, string][], get: () => V, set: (v: V) => void) {
  const buttons = options.map(([value, text]) => {
    const button = el("button", { type: "button", click: () => set(value) }, text);
    syncers.push(() => button.setAttribute("aria-pressed", String(get() === value)));
    return button;
  });
  return el("div", { class: "row" }, el("span", {}, label), el("div", { class: "segments", role: "group", "aria-label": label }, ...buttons));
}

function color(label: string, key: ColorKey) {
  const input = el("input", {
    type: "color",
    "aria-label": label,
    input: () => update({ [key]: input.value } as Partial<State>),
  });
  syncers.push(() => {
    input.value = state[key];
  });
  return el("label", { class: "swatch" }, input, el("span", {}, label));
}

function section(title: string, ...children: Node[]) {
  return el("section", {}, el("h2", {}, title), ...children);
}

/* scene */

const shownDisplay = (): Display => (state.scope === "full" ? state.keyboardPlatform : state.display);
const exportPlatform = (): Platform => (state.scope === "full" ? state.keyboardPlatform : state.platform);

function sceneSpec(platform: Platform = exportPlatform()): SceneSpec {
  return {
    keys,
    platform,
    view: { tilt: state.tilt, yaw: state.yaw, perspective: state.perspective },
    style: { profile: state.profile, cap: state.cap, modifier: state.modifier, legend: state.legend, accent: state.accent, jamo: state.jamo },
    context: { enabled: state.scope === "nearby", layout: state.layout, reach: state.reach, blur: state.blur },
    keyboard: { enabled: state.scope === "full", numpad: state.numpad, highlight: state.highlight },
    showPlus: state.showPlus,
    shadow: state.shadow,
    background: state.transparent ? null : state.background,
  };
}

const motion = (): Motion => ({ travel: state.travel, stagger: state.stagger, hold: state.hold, pause: state.pause });

const PLATFORMS: Platform[] = ["windows", "mac"];
const isShown = (platform: Platform) => shownDisplay() === "both" || shownDisplay() === platform;
const stage = el("div", { class: "stage", tabindex: "0", role: "img" });
const emptyNote = el("p", { class: "empty" }, t.empty);
const views = PLATFORMS.map((platform) => {
  const image = el("div", { class: "pane-image" });
  const chip = el(
    "button",
    {
      type: "button",
      class: "pane-chip",
      title: t.platform,
      pointerdown: (event) => event.stopPropagation(),
      click: () => update({ platform }),
    },
    t[platform],
  );
  syncers.push(() => chip.setAttribute("aria-pressed", String(state.platform === platform)));
  const pane = el("div", { class: "pane" }, chip, image);
  stage.append(pane);
  return { platform, pane, image };
});
stage.append(emptyNote);

const windowsText = el("input", { type: "text", readonly: "", "aria-label": `${t.windows} ${t.textResult}` });
const macText = el("input", { type: "text", readonly: "", "aria-label": `${t.mac} ${t.textResult}` });

const flatPreviews: Record<Platform, HTMLElement> = {
  windows: el("div", { class: "flat-preview" }),
  mac: el("div", { class: "flat-preview" }),
};

function flatImage(platform: Platform) {
  return buildFlatImage(keys, platform, font!, sceneSpec(platform).style, state.showPlus, state.inlineHeight);
}

function draw() {
  windowsText.value = windowsResultText(keys);
  macText.value = macComboToText(keys);
  if (!font) return;
  const empty = keys.length === 0 && state.scope !== "full";
  emptyNote.hidden = !empty;
  views.forEach((view) => {
    view.pane.hidden = empty || !isShown(view.platform);
  });
  for (const platform of PLATFORMS) {
    if (isShown(platform)) flatPreviews[platform].innerHTML = keys.length === 0 ? "" : flatImage(platform).svg;
  }
  if (empty) return;
  const press = playing ? pressStates(motion(), keys.length, (performance.now() - playStart) % duration(motion(), keys.length)) : [];
  for (const view of views) {
    if (isShown(view.platform)) view.image.innerHTML = buildScene(sceneSpec(view.platform), font, press).svg;
  }
  stage.setAttribute("aria-label", shownDisplay() === "both" ? bothToText(keys) : shownDisplay() === "windows" ? windowsText.value : macText.value);
}

function setPlaying(next: boolean) {
  playing = next;
  cancelAnimationFrame(frameHandle);
  if (playing) {
    playStart = performance.now();
    const tick = () => {
      draw();
      if (playing) frameHandle = requestAnimationFrame(tick);
    };
    tick();
  } else {
    draw();
  }
  syncControls();
}

/* rotation by dragging */

function attachDrag() {
  let start: { x: number; y: number; yaw: number; tilt: number } | null = null;
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    start = { x: e.clientX, y: e.clientY, yaw: state.yaw, tilt: state.tilt };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!start) return;
    let yaw = start.yaw + (e.clientX - start.x) * 0.5;
    yaw = ((yaw + 180) % 360 + 360) % 360 - 180;
    const tilt = Math.max(0, Math.min(85, start.tilt + (e.clientY - start.y) * 0.4));
    update({ yaw: Math.round(yaw), tilt: Math.round(tilt) });
  });
  const end = () => {
    start = null;
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  stage.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 15 : 5;
    const moves: Record<string, Partial<State>> = {
      ArrowLeft: { yaw: state.yaw - step },
      ArrowRight: { yaw: state.yaw + step },
      ArrowUp: { tilt: Math.max(0, state.tilt - step) },
      ArrowDown: { tilt: Math.min(85, state.tilt + step) },
    };
    if (moves[e.key]) {
      e.preventDefault();
      update(moves[e.key]);
    }
  });
}

/* key entry */

const keyInput = el("input", {
  class: "key-input",
  type: "text",
  placeholder: t.keysPlaceholder,
  "aria-label": t.keysPlaceholder,
  spellcheck: "false",
  autocomplete: "off",
  input: () => {
    keys = parseCombo(keyInput.value);
    update({ text: keyInput.value });
    syncPicker();
  },
});

function setKeys(next: KeyRef[]) {
  keys = next;
  keyInput.value = comboToText(keys);
  update({ text: keyInput.value });
  syncPicker();
}

const recordButton = el("button", { type: "button", class: "key", click: () => startRecording() }, t.record);

function startRecording() {
  recordButton.textContent = t.recording;
  recordButton.classList.add("active");
  const held = new Set<string>();
  const captured: string[] = [];
  const finish = () => {
    window.removeEventListener("keydown", down, true);
    window.removeEventListener("keyup", up, true);
    window.removeEventListener("blur", cancel);
    recordButton.textContent = t.record;
    recordButton.classList.remove("active");
  };
  const cancel = () => finish();
  const down = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const code = codeFromEvent(e.code);
    if (!code) return;
    held.add(code);
    if (!captured.includes(code)) captured.push(code);
  };
  const up = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const code = codeFromEvent(e.code);
    if (code) held.delete(code);
    if (held.size === 0 && captured.length > 0) {
      finish();
      const modifiers = captured.filter(isModifier);
      setKeys([...modifiers, ...captured.filter((c) => !isModifier(c))].map((c) => ({ code: c })));
    }
  };
  window.addEventListener("keydown", down, true);
  window.addEventListener("keyup", up, true);
  window.addEventListener("blur", cancel);
  recordButton.blur();
}

/* on-screen keyboard */

const picker = el("div", { class: "picker", hidden: true });

function syncPicker() {
  if (picker.hidden) return;
  picker.replaceChildren();
  const placed = layoutKeys(state.layout, "windows", state.numpad);
  const size = 2.6;
  for (const key of placed) {
    const label = legendFor(key.code, "windows", false).main;
    const selected = keys.some((k) => k.code === key.code);
    const button = el(
      "button",
      {
        type: "button",
        class: "mini",
        "aria-pressed": String(selected),
        "aria-label": key.code,
        style: `left:${key.x * size}rem;top:${key.y * size}rem;width:${key.w * size - 0.2}rem;height:${key.h * size - 0.2}rem`,
        click: () => {
          setKeys(selected ? keys.filter((k) => k.code !== key.code) : [...keys, { code: key.code }]);
        },
      },
      label,
    );
    picker.append(button);
  }
}

/* export */

const status = el("p", { class: "status", role: "status" });
let statusTimer = 0;

function say(message: string, sticky = false) {
  status.textContent = message;
  clearTimeout(statusTimer);
  if (!sticky) statusTimer = window.setTimeout(() => (status.textContent = ""), 3000);
}

function fileBase(platform: Platform = exportPlatform()): string {
  const text = comboToText(keys).replace(/\s*\+\s*/g, "-").replace(/[\\/:*?"<>|]/g, "_");
  return `keystamp-${text || "keyboard"}-${platform}`;
}

async function guarded(action: () => Promise<string | null>) {
  if (!font) return;
  if (keys.length === 0 && state.scope !== "full") {
    say(t.noKey);
    return;
  }
  try {
    const message = await action();
    say(message ?? "");
  } catch (error) {
    say(`${t.failed}: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

const encoder = new TextEncoder();
const save = async (name: string, bytes: Uint8Array) => ((await saveFile(name, bytes)) ? t.saved : null);

function animationFrames(): { frames: Frame[]; width: number; height: number } {
  const m = motion();
  const total = duration(m, keys.length);
  const step = 1000 / state.fps;
  const count = Math.max(2, Math.round(total / step));
  const frames: Frame[] = [];
  let width = 1;
  let height = 1;
  for (let i = 0; i < count; i++) {
    const scene = buildScene(sceneSpec(), font!, pressStates(m, keys.length, (i / count) * total));
    width = scene.width;
    height = scene.height;
    frames.push({ svg: scene.svg, delay: Math.round(total / count) });
  }
  return { frames, width, height };
}

// Whole keyboards are wide, so animation frames are limited to keep files and memory reasonable.
const animationScale = (width: number) => Math.min(state.scale, 2, 1280 / width);

/** For results that only make sense once a key has been entered. */
const requireKeys = (action: () => void) => () => {
  if (keys.length === 0) say(t.noKey);
  else action();
};
const progress = (done: number) => say(`${t.working} ${Math.round(done * 100)}%`, true);

const actions = {
  savePng: () =>
    guarded(async () => {
      const scene = buildScene(sceneSpec(), font!);
      const raster = await rasterize(scene.svg, scene.width, scene.height, state.scale);
      const blob = await pngBlob(raster.canvas);
      return save(`${fileBase()}.png`, new Uint8Array(await blob.arrayBuffer()));
    }),
  copyFlat: (platform: Platform) =>
    guarded(async () => {
      const image = flatImage(platform);
      const raster = await rasterize(image.svg, image.width, image.height, 1);
      await copyImage(raster.rgba, raster.width, raster.height, await pngBlob(raster.canvas));
      return t.copied;
    }),
  saveFlat: (platform: Platform) =>
    guarded(async () => {
      const image = flatImage(platform);
      const raster = await rasterize(image.svg, image.width, image.height, 1);
      const blob = await pngBlob(raster.canvas);
      return save(`${fileBase(platform)}-2d.png`, new Uint8Array(await blob.arrayBuffer()));
    }),
  saveSvg: () => guarded(() => save(`${fileBase()}.svg`, encoder.encode(buildScene(sceneSpec(), font!).svg))),
  copyPng: () =>
    guarded(async () => {
      const scene = buildScene(sceneSpec(), font!);
      const scale = state.scope === "full" ? scaleWithin(scene.width, scene.height, state.scale, 1920, 1080) : state.scale;
      const raster = await rasterize(scene.svg, scene.width, scene.height, scale);
      await copyImage(raster.rgba, raster.width, raster.height, await pngBlob(raster.canvas));
      return t.copied;
    }),
  copySvg: () =>
    guarded(async () => {
      await copyText(buildScene(sceneSpec(), font!).svg);
      return t.copied;
    }),
  copyText: (text: () => string) =>
    guarded(async () => {
      await copyText(text());
      return t.copied;
    }),
  saveHtml: () =>
    guarded(() => save(`${fileBase()}.html`, encoder.encode(animatedHtml(sceneSpec(), font!, motion(), comboToText(keys))))),
  saveGif: () =>
    guarded(async () => {
      const { frames, width, height } = animationFrames();
      const matte = state.transparent ? "#ffffff" : state.background;
      return save(`${fileBase()}.gif`, await encodeGif(frames, width, height, animationScale(width), matte, progress));
    }),
  saveApng: () =>
    guarded(async () => {
      const { frames, width, height } = animationFrames();
      return save(`${fileBase()}.png`, await encodeApng(frames, width, height, animationScale(width), progress));
    }),
};

/* layout */

function presetButton(label: string, tilt: number) {
  const button = el(
    "button",
    {
      type: "button",
      class: "key",
      click: () => update(tilt === 0 ? { tilt: 0, yaw: 0 } : { tilt, yaw: state.yaw === 0 ? initial.yaw : state.yaw }),
    },
    label,
  );
  syncers.push(() => button.setAttribute("aria-pressed", String(state.tilt === tilt)));
  return button;
}

function actionButton(text: keyof Strings, action: () => void, primary = false) {
  return el("button", { type: "button", class: primary ? "key primary" : "key", click: action }, t[text]);
}

function themeButtons() {
  return el(
    "div",
    { class: "themes", role: "group", "aria-label": t.theme },
    ...THEMES.map((theme) => {
      const button = el(
        "button",
        {
          type: "button",
          title: theme.name,
          "aria-label": theme.name,
          style: `--cap:${theme.cap};--ink:${theme.legend}`,
          click: () => update({ cap: theme.cap, modifier: theme.modifier, legend: theme.legend, accent: theme.accent }),
        },
        "A",
      );
      syncers.push(() => button.setAttribute("aria-pressed", String(state.cap === theme.cap && state.legend === theme.legend)));
      return button;
    }),
  );
}

function build() {
  const playButton = el("button", { type: "button", class: "key", click: requireKeys(() => setPlaying(!playing)) });
  syncers.push(() => {
    playButton.textContent = playing ? t.stop : t.play;
    playButton.setAttribute("aria-pressed", String(playing));
  });

  const contextOptions = el(
    "div",
    {},
    slider(t.reach, "reach", 0.5, 4, 0.25),
    slider(t.blur, "blur", 0, 16, 0.5),
  );
  const layoutOptions = el(
    "div",
    {},
    segmented<LayoutId>(t.layout, [["ansi", t.ansi], ["iso", t.iso], ["korean", t.korean]], () => state.layout, (layout) => {
      update({ layout });
      syncPicker();
    }),
    toggle(t.numpad, "numpad"),
  );
  const fullOptions = el(
    "div",
    {},
    segmented<Platform>(t.keyboardPlatform, [["windows", t.windows], ["mac", t.mac]], () => state.keyboardPlatform, (keyboardPlatform) => update({ keyboardPlatform })),
    toggle(t.highlight, "highlight"),
  );
  let pickerNumpad = state.numpad;
  syncers.push(() => {
    contextOptions.hidden = state.scope !== "nearby";
    layoutOptions.hidden = state.scope === "keys";
    fullOptions.hidden = state.scope !== "full";
    if (pickerNumpad !== state.numpad) {
      pickerNumpad = state.numpad;
      syncPicker();
    }
  });

  const noticeDialog = el(
    "dialog",
    { class: "notices" },
    el("pre", {}, notices),
    el("form", { method: "dialog" }, el("button", { class: "key" }, "OK")),
  );

  const bgSwatch = color(t.background, "background");
  syncers.push(() => {
    bgSwatch.hidden = state.transparent;
  });

  const displayChoice = segmented<Display>(t.display, [["both", t.displayAll], ["windows", t.windows], ["mac", t.mac]], () => state.display, (display) =>
    update(display === "both" ? { display } : { display, platform: display }),
  );
  const targetChoice = segmented<Platform>(t.platform, [["windows", t.windows], ["mac", t.mac]], () => state.platform, (platform) => update({ platform }));
  const copyBothButton = el("button", { type: "button", class: "key", click: requireKeys(() => actions.copyText(() => bothToText(keys))) }, t.copyBoth);
  syncers.push(() => {
    const both = shownDisplay() === "both";
    displayChoice.hidden = state.scope === "full";
    targetChoice.hidden = !both;
    copyBothButton.hidden = !both;
    for (const view of views) view.pane.querySelector<HTMLElement>(".pane-chip")!.hidden = !both;
  });

  const inspector = el(
    "aside",
    { class: "inspector" },
    section(
      t.keycap,
      displayChoice,
      targetChoice,
      segmented<Profile>(t.profile, [["sculpted", t.sculpted], ["low", t.low]], () => state.profile, (profile) => update({ profile })),
      el("div", { class: "row" }, el("span", {}, t.theme), themeButtons()),
      el("div", { class: "swatches" }, color(t.capColor, "cap"), color(t.modColor, "modifier"), color(t.legendColor, "legend"), color(t.accentColor, "accent")),
      toggle(t.jamo, "jamo"),
      segmented<"solid" | "none">(t.plus, [["solid", t.plusSolid], ["none", t.plusNone]], () => (state.showPlus ? "solid" : "none"), (value) => update({ showPlus: value === "solid" })),
      toggle(t.shadow, "shadow"),
      toggle(t.transparent, "transparent"),
      bgSwatch,
    ),
    section(
      t.keyboardSection,
      segmented<Scope>(t.scope, [["keys", t.scopeKeys], ["nearby", t.scopeNearby], ["full", t.scopeFull]], () => state.scope, (scope) =>
        // A whole keyboard reads best from the front, so it starts there.
        update(scope === "full" && state.scope !== "full" ? { scope, tilt: 30, yaw: 0 } : { scope }),
      ),
      layoutOptions,
      fullOptions,
      contextOptions,
    ),
    section(
      t.animation,
      slider(t.travel, "travel", 40, 400, 10, t.ms),
      slider(t.stagger, "stagger", 0, 400, 10, t.ms),
      slider(t.hold, "hold", 0, 2000, 50, t.ms),
      slider(t.pause, "pause", 0, 3000, 50, t.ms),
      slider(t.fps, "fps", 10, 50, 5),
      el("div", { class: "buttons" }, playButton, actionButton("saveHtml", requireKeys(actions.saveHtml)), actionButton("saveGif", requireKeys(actions.saveGif)), actionButton("saveApng", requireKeys(actions.saveApng))),
      el("p", { class: "note" }, t.gifNote),
    ),
    section(
      t.export,
      slider(t.scale, "scale", 1, 8, 1, "x"),
      el(
        "div",
        { class: "buttons" },
        actionButton("savePng", actions.savePng, true),
        actionButton("saveSvg", actions.saveSvg, true),
        actionButton("copyPng", actions.copyPng),
        actionButton("copySvg", actions.copySvg),
      ),
    ),
    el("button", { type: "button", class: "link", click: () => noticeDialog.showModal() }, t.notices),
  );

  const stageWrap = el(
    "main",
    { class: "workspace" },
    stage,
    el(
      "div",
      { class: "text-results", role: "group", "aria-label": t.textResult },
      ...PLATFORMS.map((platform) => {
        const field = platform === "windows" ? windowsText : macText;
        const row = el(
          "div",
          { class: "result-row" },
          el("span", { class: "result-name" }, t[platform]),
          field,
          el("button", { type: "button", class: "key", click: requireKeys(() => actions.copyText(() => field.value)) }, t.copy),
          flatPreviews[platform],
          el("button", { type: "button", class: "key", click: requireKeys(() => actions.copyFlat(platform)) }, t.copyPng),
          el("button", { type: "button", class: "key", click: requireKeys(() => actions.saveFlat(platform)) }, t.savePng),
        );
        syncers.push(() => {
          row.hidden = !isShown(platform);
        });
        return row;
      }),
      el(
        "div",
        { class: "result-row" },
        slider(t.inlineHeight, "inlineHeight", 16, 96, 4, "px"),
        copyBothButton,
      ),
    ),
    el(
      "div",
      { class: "view-bar" },
      el(
        "div",
        { class: "presets", role: "group", "aria-label": t.view },
        presetButton(t.top, 0),
        presetButton("30°", 30),
        presetButton("45°", 45),
        presetButton("60°", 60),
      ),
      slider(t.tilt, "tilt", 0, 85, 1, "°"),
      slider(t.yaw, "yaw", -180, 180, 1, "°"),
      slider(t.perspective, "perspective", 0, 1, 0.05),
      status,
    ),
  );

  const pickerButton = el("button", {
    type: "button",
    class: "key",
    click: () => {
      picker.hidden = !picker.hidden;
      pickerButton.setAttribute("aria-pressed", String(!picker.hidden));
      syncPicker();
    },
  }, t.pick);

  const header = el(
    "header",
    { class: "entry" },
    keyInput,
    recordButton,
    pickerButton,
    el("button", { type: "button", class: "key", click: () => setKeys([]) }, t.clear),
  );

  document.body.append(header, picker, el("div", { class: "columns" }, stageWrap, inspector), noticeDialog);
  keyInput.value = state.text;
  attachDrag();
  syncControls();
}

async function start() {
  build();
  const response = await fetch(fontUrl);
  font = parse(await response.arrayBuffer());
  draw();
}

void start();
