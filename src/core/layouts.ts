import type { Platform } from "./keys";

export type LayoutId = "ansi" | "iso" | "korean";

export interface PlacedKey {
  code: string;
  /** Top-left position and size, in key units. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const WIDTHS: Record<string, number> = {
  backspace: 2, tab: 1.5, backslash: 1.5, capslock: 1.75, enter: 2.25, lshift: 2.25, rshift: 2.75,
  lctrl: 1.25, lmeta: 1.25, lalt: 1.25, ralt: 1.25, rmeta: 1.25, menu: 1.25, rctrl: 1.25, space: 6.25,
};

const FUNCTION_ROW = "esc _:1 f1 f2 f3 f4 _:.5 f5 f6 f7 f8 _:.5 f9 f10 f11 f12 _:.25 prtsc scrlk pause";
const NUMBER_ROW = "backquote 1 2 3 4 5 6 7 8 9 0 minus equal backspace _:.25 insert home pageup";
const NAV = "_:.25 delete end pagedown";
const LETTERS_2 = "q w e r t y u i o p bracketleft bracketright";
const LETTERS_3 = "a s d f g h j k l semicolon quote";
const LETTERS_4 = "z x c v b n m comma period slash";
const ARROWS = "_:.25 left down right";

const ROWS: Record<LayoutId, string[]> = {
  ansi: [
    FUNCTION_ROW,
    NUMBER_ROW,
    `tab ${LETTERS_2} backslash ${NAV}`,
    `capslock ${LETTERS_3} enter`,
    `lshift ${LETTERS_4} rshift _:1.25 up`,
    `lctrl lmeta lalt space ralt rmeta menu rctrl ${ARROWS}`,
  ],
  iso: [
    FUNCTION_ROW,
    NUMBER_ROW,
    `tab ${LETTERS_2} enter:1.5x2 ${NAV}`,
    `capslock ${LETTERS_3} hash`,
    `lshift:1.25 intlbackslash ${LETTERS_4} rshift _:1.25 up`,
    `lctrl lmeta lalt space ralt rmeta menu rctrl ${ARROWS}`,
  ],
  korean: [
    FUNCTION_ROW,
    NUMBER_ROW,
    `tab ${LETTERS_2} backslash ${NAV}`,
    `capslock ${LETTERS_3} enter`,
    `lshift ${LETTERS_4} rshift _:1.25 up`,
    `lctrl lmeta lalt hanja space:5.5 hangul ralt menu rctrl ${ARROWS}`,
  ],
};

// Mac keyboards place command next to the space bar.
const MAC_SWAP: Record<string, string> = { lmeta: "lalt", lalt: "lmeta", rmeta: "ralt", ralt: "rmeta" };

export function layoutKeys(id: LayoutId, platform: Platform): PlacedKey[] {
  const placed: PlacedKey[] = [];
  ROWS[id].forEach((row, rowIndex) => {
    // The function row sits a quarter unit above the main block.
    const y = rowIndex === 0 ? 0 : rowIndex + 0.25;
    let x = 0;
    for (const token of row.split(" ")) {
      const [rawCode, size] = token.split(":");
      const code = platform === "mac" ? (MAC_SWAP[rawCode] ?? rawCode) : rawCode;
      const [w, h] = size ? size.split("x").map(Number) : [WIDTHS[rawCode] ?? 1, 1];
      if (code !== "_") placed.push({ code, x, y, w, h: h ?? 1 });
      x += w;
    }
  });
  return placed;
}
