import { applyPalette, GIFEncoder, quantize } from "gifenc";
import UPNG from "upng-js";

export interface Raster {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/** Draws SVG markup to pixels at a scale of the image's natural size. */
export async function rasterize(svg: string, baseWidth: number, baseHeight: number, scale: number, matte?: string): Promise<Raster> {
  const width = Math.max(1, Math.round(baseWidth * scale));
  const height = Math.max(1, Math.round(baseHeight * scale));
  const sized = svg.replace(/width="\d+" height="\d+"/, `width="${width}" height="${height}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    if (matte) {
      context.fillStyle = matte;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    return { canvas, width, height, rgba: context.getImageData(0, 0, width, height).data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
  });
}

export interface Frame {
  svg: string;
  delay: number;
}

/**
 * GIF allows one fully transparent colour and no partial transparency, so
 * transparent scenes are flattened on a matte that should match the destination.
 */
export async function encodeGif(frames: Frame[], width: number, height: number, scale: number, matte: string, onProgress: (done: number) => void): Promise<Uint8Array> {
  const rasters: Raster[] = [];
  for (const frame of frames) {
    rasters.push(await rasterize(frame.svg, width, height, scale, matte));
    onProgress(rasters.length / frames.length / 2);
    await nextTick();
  }
  // One shared palette prevents colour flicker between frames.
  const sample = new Uint8ClampedArray(rasters.reduce((sum, r) => sum + r.rgba.length, 0));
  let offset = 0;
  for (const r of rasters) {
    sample.set(r.rgba, offset);
    offset += r.rgba.length;
  }
  const palette = quantize(sample, 256, { format: "rgb565" });
  const encoder = GIFEncoder();
  rasters.forEach((raster, i) => {
    const index = applyPalette(raster.rgba, palette, "rgb565");
    encoder.writeFrame(index, raster.width, raster.height, { palette: i === 0 ? palette : palette, delay: frames[i].delay, repeat: 0 });
    onProgress(0.5 + (i + 1) / frames.length / 2);
  });
  encoder.finish();
  return encoder.bytes();
}

/** APNG keeps smooth transparency, unlike GIF. */
export async function encodeApng(frames: Frame[], width: number, height: number, scale: number, onProgress: (done: number) => void): Promise<Uint8Array> {
  const buffers: ArrayBuffer[] = [];
  let w = 1;
  let h = 1;
  for (const frame of frames) {
    const raster = await rasterize(frame.svg, width, height, scale);
    w = raster.width;
    h = raster.height;
    buffers.push(raster.rgba.slice().buffer as ArrayBuffer);
    onProgress(buffers.length / frames.length);
    await nextTick();
  }
  return new Uint8Array(UPNG.encode(buffers, w, h, 0, frames.map((f) => f.delay)));
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve));
