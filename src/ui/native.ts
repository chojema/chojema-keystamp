import { invoke, isTauri } from "@tauri-apps/api/core";

export const APP_LINKS = {
  repository: "https://github.com/chojema/chojema-keystamp",
  appPark: "https://chojema.github.io/AppPark/",
} as const;

/** Opens one of the app's information links in the default browser. */
export async function openAppLink(link: keyof typeof APP_LINKS): Promise<void> {
  if (isTauri()) {
    await invoke("open_app_link", { link });
  } else {
    window.open(APP_LINKS[link], "_blank", "noopener,noreferrer");
  }
}

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
