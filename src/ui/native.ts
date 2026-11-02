import { invoke, isTauri } from "@tauri-apps/api/core";

/** Asks where to save, then writes the file. Returns false if the person cancels. */
export async function saveFile(name: string, bytes: Uint8Array): Promise<boolean> {
  if (isTauri()) {
    return invoke<boolean>("save_file", bytes, { headers: { "x-name": encodeURIComponent(name) } });
  }
  const url = URL.createObjectURL(new Blob([bytes.slice()]));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export async function copyImage(rgba: Uint8ClampedArray, width: number, height: number, png: Blob): Promise<void> {
  if (isTauri()) {
    const body = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    await invoke("copy_image", body, { headers: { "x-width": String(width), "x-height": String(height) } });
    return;
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export async function copyText(text: string): Promise<void> {
  if (isTauri()) {
    await invoke("copy_text", { text });
    return;
  }
  await navigator.clipboard.writeText(text);
}
