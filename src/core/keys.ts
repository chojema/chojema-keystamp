export type Platform = "windows" | "mac";

export interface KeyRef {
  /** Layout code such as "c" or "lctrl"; custom keys use "custom:<text>". */
  code: string;
}

export interface Legend {
  main: string;
  /** Upper legend for keys with a shifted symbol. */
  shift?: string;
  /** Small word under a symbol, such as "command". */
  word?: string;
  /** Hangul jamo printed in the lower-right corner. */
  jamo?: string;
}

const JAMO: Record<string, string> = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
  a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
  z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
};

const SHIFTED: Record<string, [string, string]> = {
  "1": ["1", "!"], "2": ["2", "@"], "3": ["3", "#"], "4": ["4", "$"], "5": ["5", "%"],
  "6": ["6", "^"], "7": ["7", "&"], "8": ["8", "*"], "9": ["9", "("], "0": ["0", ")"],
  backquote: ["`", "~"], minus: ["-", "_"], equal: ["=", "+"], bracketleft: ["[", "{"],
  bracketright: ["]", "}"], backslash: ["\\", "|"], semicolon: [";", ":"], quote: ["'", '"'],
  comma: [",", "<"], period: [".", ">"], slash: ["/", "?"], hash: ["#", "~"], intlbackslash: ["\\", "|"],
};

const WORDS: Record<string, string> = {
  esc: "Esc", tab: "Tab", capslock: "Caps Lock", backspace: "Backspace", enter: "Enter",
  space: "", insert: "Insert", delete: "Delete", home: "Home", end: "End",
  pageup: "Page Up", pagedown: "Page Down", prtsc: "PrtSc", scrlk: "Scroll Lock", pause: "Pause",
  menu: "Menu", hangul: "한/영", hanja: "한자",
  up: "↑", down: "↓", left: "←", right: "→",
};

const MAC_WORDS: Record<string, string> = {
  esc: "esc", tab: "⇥", capslock: "⇪", backspace: "⌫", enter: "⏎", delete: "⌦",
  home: "↖", end: "↘", pageup: "⇞", pagedown: "⇟",
};

const MODIFIERS: Record<string, { win: string; symbol: string; word: string }> = {
  ctrl: { win: "Ctrl", symbol: "⌃", word: "control" },
  shift: { win: "Shift", symbol: "⇧", word: "shift" },
  alt: { win: "Alt", symbol: "⌥", word: "option" },
  meta: { win: "Win", symbol: "⌘", word: "command" },
};

function modifierOf(code: string): string | null {
  const m = /^[lr](ctrl|shift|alt|meta)$/.exec(code);
  return m ? m[1] : null;
}

export function isModifier(code: string): boolean {
  return modifierOf(code) !== null;
}

export function isCustom(code: string): boolean {
  return code.startsWith("custom:");
}

export function legendFor(code: string, platform: Platform, jamo: boolean): Legend {
  if (isCustom(code)) return { main: code.slice(7) };
  const mod = modifierOf(code);
  if (mod) {
    const m = MODIFIERS[mod];
    return platform === "mac" ? { main: m.symbol, word: m.word } : { main: m.win };
  }
  if (SHIFTED[code]) return { main: SHIFTED[code][0], shift: SHIFTED[code][1] };
  if (/^[a-z]$/.test(code)) return { main: code.toUpperCase(), jamo: jamo ? JAMO[code] : undefined };
  if (/^f\d+$/.test(code)) return { main: code.toUpperCase() };
  if (platform === "mac" && MAC_WORDS[code]) return { main: MAC_WORDS[code] };
  return { main: WORDS[code] ?? code };
}

/** Key width in units for the side-by-side combination view. */
export function rowWidth(code: string): number {
  if (isCustom(code)) {
    let length = 0;
    for (const ch of code.slice(7)) length += ch.charCodeAt(0) > 0x2e80 ? 1.6 : 1;
    return length <= 2 ? 1 : Math.min(6, Math.max(1.25, 0.32 * length + 0.5));
  }
  const mod = modifierOf(code);
  if (mod) return mod === "shift" ? 2.25 : 1.25;
  const widths: Record<string, number> = {
    space: 5, enter: 2.25, backspace: 2, tab: 1.5, capslock: 1.75, pageup: 1.25, pagedown: 1.25,
    scrlk: 1.25, insert: 1.25, delete: 1.25,
  };
  return widths[code] ?? 1;
}

const ALIASES: Record<string, string> = {
  ctrl: "lctrl", control: "lctrl", ctl: "lctrl", 컨트롤: "lctrl", lctrl: "lctrl", rctrl: "rctrl", "⌃": "lctrl", "^": "lctrl",
  shift: "lshift", "⇧": "lshift", 시프트: "lshift", lshift: "lshift", rshift: "rshift",
  alt: "lalt", option: "lalt", opt: "lalt", "⌥": "lalt", 알트: "lalt", lalt: "lalt", ralt: "ralt",
  win: "lmeta", windows: "lmeta", "⊞": "lmeta", meta: "lmeta", super: "lmeta", lmeta: "lmeta", rmeta: "rmeta",
  cmd: "lmeta", command: "lmeta", "⌘": "lmeta",
  esc: "esc", escape: "esc", tab: "tab", "⇥": "tab", caps: "capslock", capslock: "capslock", "⇪": "capslock",
  backspace: "backspace", bksp: "backspace", "⌫": "backspace", enter: "enter", return: "enter", "⏎": "enter", "↵": "enter",
  space: "space", spacebar: "space", 스페이스: "space", ins: "insert", insert: "insert", del: "delete", delete: "delete", "⌦": "delete",
  home: "home", end: "end", pgup: "pageup", pageup: "pageup", pgdn: "pagedown", pgdown: "pagedown", pagedown: "pagedown",
  prtsc: "prtsc", printscreen: "prtsc", scrolllock: "scrlk", scrlk: "scrlk", pause: "pause", menu: "menu",
  up: "up", "↑": "up", down: "down", "↓": "down", left: "left", "←": "left", right: "right", "→": "right",
  "한/영": "hangul", 한영: "hangul", hangul: "hangul", 한자: "hanja", hanja: "hanja",
  "`": "backquote", "-": "minus", minus: "minus", "=": "equal", "+": "equal", plus: "equal",
  "[": "bracketleft", "]": "bracketright", "\\": "backslash", ";": "semicolon", "'": "quote",
  ",": "comma", ".": "period", "/": "slash",
};

function tokenToCode(raw: string): string {
  const compact = raw.toLowerCase().replace(/\s+/g, "");
  if (ALIASES[compact]) return ALIASES[compact];
  if (/^[a-z0-9]$/.test(compact)) return compact;
  if (/^f([1-9]|1[0-2])$/.test(compact)) return compact;
  return `custom:${raw.trim()}`;
}

/**
 * Parses text such as "Ctrl + Shift + Z", "cmd-c" or "⌘⇧Z" into keys.
 * A "+" or "-" separates keys unless it is itself the key, as in "Ctrl + +".
 * Text that names no known key becomes a custom keycap with that label.
 */
export function parseCombo(input: string): KeyRef[] {
  const text = input.replace(/[⌃⌥⇧⌘]/g, (s) => `${s}+`).trim();
  const parts: string[] = [];
  let token = "";
  [...text].forEach((ch, i, chars) => {
    const hasMore = chars.slice(i + 1).join("").trim() !== "";
    if ((ch === "+" || ch === "-") && token.trim() !== "" && hasMore) {
      parts.push(token);
      token = "";
    } else {
      token += ch;
    }
  });
  if (token.trim()) parts.push(token);
  const codes = parts.map(tokenToCode);
  return [...new Set(codes)].map((code) => ({ code }));
}

const FROM_EVENT: Record<string, string> = {
  ControlLeft: "lctrl", ControlRight: "rctrl", ShiftLeft: "lshift", ShiftRight: "rshift",
  AltLeft: "lalt", AltRight: "ralt", MetaLeft: "lmeta", MetaRight: "rmeta", OSLeft: "lmeta", OSRight: "rmeta",
  Escape: "esc", Tab: "tab", CapsLock: "capslock", Backspace: "backspace", Enter: "enter", NumpadEnter: "enter", Space: "space",
  Insert: "insert", Delete: "delete", Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
  PrintScreen: "prtsc", ScrollLock: "scrlk", Pause: "pause", ContextMenu: "menu",
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Backquote: "backquote", Minus: "minus", Equal: "equal", BracketLeft: "bracketleft", BracketRight: "bracketright",
  Backslash: "backslash", Semicolon: "semicolon", Quote: "quote", Comma: "comma", Period: "period", Slash: "slash",
  IntlBackslash: "intlbackslash", Lang1: "hangul", Lang2: "hanja", HangulMode: "hangul", Hanja: "hanja",
};

/** Maps a KeyboardEvent.code value to a layout code. */
export function codeFromEvent(eventCode: string): string | null {
  if (FROM_EVENT[eventCode]) return FROM_EVENT[eventCode];
  let m = /^Key([A-Z])$/.exec(eventCode);
  if (m) return m[1].toLowerCase();
  m = /^(?:Digit|Numpad)(\d)$/.exec(eventCode);
  if (m) return m[1];
  if (/^F([1-9]|1[0-2])$/.test(eventCode)) return eventCode.toLowerCase();
  return null;
}

/** Windows text, such as "Ctrl + Shift + Z". */
export function comboToText(keys: KeyRef[]): string {
  return keys
    .map(({ code }) => {
      const mod = modifierOf(code);
      if (mod) return MODIFIERS[mod].win;
      if (code === "space") return "Space";
      return legendFor(code, "windows", false).main;
    })
    .join(" + ");
}

const MAC_MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"];

/** Mac text in the standard modifier order, such as "⇧⌘Z". */
export function macComboToText(keys: KeyRef[]): string {
  const modifiers = keys
    .map(({ code }) => modifierOf(code))
    .filter((m): m is string => m !== null)
    .sort((a, b) => MAC_MODIFIER_ORDER.indexOf(a) - MAC_MODIFIER_ORDER.indexOf(b))
    .map((m) => MODIFIERS[m].symbol)
    .join("");
  const rest = keys
    .filter(({ code }) => !isModifier(code))
    .map(({ code }) => (code === "space" ? "Space" : legendFor(code, "mac", false).main))
    .join(" + ");
  return modifiers + rest;
}

/** The Windows key has its own character. Every other key is bracketed, such as "[Ctrl]+[C]". */
export const WINDOWS_KEY_CHARACTER = "⊞";

export function windowsResultText(keys: KeyRef[]): string {
  return keys
    .map(({ code }) => {
      const mod = modifierOf(code);
      if (mod === "meta") return WINDOWS_KEY_CHARACTER;
      if (mod) return `[${MODIFIERS[mod].win}]`;
      if (code === "space") return "[Space]";
      return `[${legendFor(code, "windows", false).main}]`;
    })
    .join("+");
}

/** Both platforms on one line, ready to paste into a sentence. */
export function bothToText(keys: KeyRef[]): string {
  return `Windows: ${windowsResultText(keys)}, Mac: ${macComboToText(keys)}`;
}
