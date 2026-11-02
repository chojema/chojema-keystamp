declare module "gifenc" {
  export function GIFEncoder(): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options: { palette: number[][]; delay: number; transparent?: boolean; transparentIndex?: number; repeat?: number; dispose?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: string; oneBitAlpha?: boolean | number; clearAlpha?: boolean }): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
}

declare module "upng-js" {
  const UPNG: { encode(frames: ArrayBuffer[], width: number, height: number, colors: number, delays?: number[]): ArrayBuffer };
  export default UPNG;
}

declare module "opentype.js" {
  export interface PathCommand {
    type: "M" | "L" | "Q" | "C" | "Z";
    x: number;
    y: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  export interface Font {
    getPath(text: string, x: number, y: number, size: number): {
      commands: PathCommand[];
      getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
    };
  }
  export function parse(buffer: ArrayBuffer): Font;
}
