/**
 * Small copies of photos for on-screen previews and thumbnails.
 *
 * Camera photos are often 3–15 MB each. Sending every original to the window
 * (as the dossier preview and the work picker used to) runs the window out of
 * memory with many works, and it freezes. Here each photo is shrunk once and
 * kept in memory; the original file is never changed. PDFs still read the
 * originals from disk.
 */
import { nativeImage, type NativeImage } from "electron";
import { readFile, stat } from "fs/promises";

const CACHE_LIMIT_BYTES = 120 * 1024 * 1024;
const cache = new Map<string, string>();
let cachedBytes = 0;

function remember(key: string, value: string): void {
  cache.set(key, value);
  cachedBytes += value.length;
  // Oldest first: Map keeps insertion order.
  for (const [oldKey, oldValue] of cache) {
    if (cachedBytes <= CACHE_LIMIT_BYTES) break;
    cache.delete(oldKey);
    cachedBytes -= oldValue.length;
  }
}

/** Put see-through parts on white (pages are white) so it can be a JPEG. */
function onWhite(image: NativeImage): NativeImage {
  const bitmap = image.toBitmap();
  let transparent = false;
  for (let index = 3; index < bitmap.length; index += 4) {
    if (bitmap[index] < 255) {
      transparent = true;
      break;
    }
  }
  if (!transparent) return image;
  for (let index = 0; index < bitmap.length; index += 4) {
    const fill = 255 - bitmap[index + 3];
    bitmap[index] = Math.min(255, bitmap[index] + fill);
    bitmap[index + 1] = Math.min(255, bitmap[index + 1] + fill);
    bitmap[index + 2] = Math.min(255, bitmap[index + 2] + fill);
    bitmap[index + 3] = 255;
  }
  const { width, height } = image.getSize();
  return nativeImage.createFromBitmap(bitmap, { width, height });
}

/**
 * A data URL no larger than `maxEdge` pixels on its longest side. Falls back
 * to the original file when the photo can't be decoded here.
 */
export async function previewDataUrl(
  filePath: string,
  maxEdge: number,
  fallback: (filePath: string) => Promise<string>
): Promise<string> {
  const edge = Math.max(64, Math.min(4000, Math.round(maxEdge) || 1200));
  const info = await stat(filePath);
  const key = `${filePath}|${info.mtimeMs}|${info.size}|${edge}`;
  const hit = cache.get(key);
  if (hit) {
    // Refresh its place so often-used photos stay.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  let image = nativeImage.createFromPath(filePath);
  if (image.isEmpty()) image = nativeImage.createFromBuffer(await readFile(filePath));
  if (image.isEmpty()) return fallback(filePath);
  const { width, height } = image.getSize();
  if (width <= 0 || height <= 0) return fallback(filePath);
  const scale = Math.min(1, edge / Math.max(width, height));
  const small =
    scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: "good"
        })
      : image;
  const url = `data:image/jpeg;base64,${onWhite(small).toJPEG(85).toString("base64")}`;
  remember(key, url);
  return url;
}
