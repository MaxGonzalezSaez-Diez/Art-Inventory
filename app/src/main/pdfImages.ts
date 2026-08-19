import { nativeImage, type NativeImage } from "electron";
import { existsSync, readFileSync } from "fs";

const MIN_EDGE = 240;

export interface GeneratedPdfResult {
  path: string;
  bytes: number;
  overLimit: boolean;
}

export interface PdfImageSource {
  imageDataUrl?: string;
  imagePath?: string;
}

export interface PdfImagePass {
  maxEdge: number;
  quality: number;
  targetBytesPerImage?: number;
}

export function parseMaxMb(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(80, Math.max(1, n));
}

export function maxBytesFromMb(maxMb?: number): number | undefined {
  if (!maxMb) return undefined;
  return Math.round(maxMb * 1024 * 1024);
}

function fitEdge(image: NativeImage, maxEdge: number): NativeImage {
  const { width, height } = image.getSize();
  if (width <= 0 || height <= 0) return image;
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return image;
  const scale = maxEdge / edge;
  return image.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  });
}

function jpegUnderLimit(image: NativeImage, targetBytes: number): Buffer | null {
  let lo = 22;
  let hi = 78;
  let best: Buffer | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const buffer = image.toJPEG(mid);
    if (buffer.length <= targetBytes) {
      best = buffer;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function normalizeFsPath(filePath: string): string {
  let value = filePath.trim();
  if (value.startsWith("file://")) {
    try {
      value = decodeURIComponent(value.replace(/^file:\/\//, ""));
    } catch {
      value = value.replace(/^file:\/\//, "");
    }
  }
  return value;
}

function fileExt(filePath: string): string {
  return filePath.toLowerCase().replace(/^.*\./, "");
}

function webSafeMime(filePath: string): string | undefined {
  const ext = fileExt(filePath);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return undefined;
}

function mimeFromPath(filePath: string): string {
  return webSafeMime(filePath) ?? "image/jpeg";
}

function dataUrlFromFile(filePath: string): string | undefined {
  try {
    const buffer = readFileSync(filePath);
    return `data:${mimeFromPath(filePath)};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function loadNativeImage(source: PdfImageSource): NativeImage | null {
  const filePath = normalizeFsPath(String(source.imagePath || ""));
  if (filePath && existsSync(filePath)) {
    const fromPath = nativeImage.createFromPath(filePath);
    if (!fromPath.isEmpty()) return fromPath;
    try {
      const fromBuffer = nativeImage.createFromBuffer(readFileSync(filePath));
      if (!fromBuffer.isEmpty()) return fromBuffer;
    } catch {
      /* continue */
    }
  }
  const dataUrl = String(source.imageDataUrl || "");
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (match) {
    try {
      const fromBuffer = nativeImage.createFromBuffer(Buffer.from(match[2], "base64"));
      if (!fromBuffer.isEmpty()) return fromBuffer;
    } catch {
      /* continue */
    }
  }
  if (dataUrl.startsWith("data:")) {
    try {
      const fromUrl = nativeImage.createFromDataURL(dataUrl);
      if (!fromUrl.isEmpty()) return fromUrl;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function encodeJpeg(
  image: NativeImage,
  maxEdge: number,
  quality: number,
  targetBytes?: number
): Buffer {
  let current = fitEdge(image, maxEdge);
  const q = Math.max(22, Math.min(92, Math.round(quality)));
  if (targetBytes && targetBytes > 0) {
    let fitted = jpegUnderLimit(current, targetBytes);
    while (!fitted && current.getSize().width > MIN_EDGE) {
      const { width, height } = current.getSize();
      current = current.resize({
        width: Math.max(MIN_EDGE, Math.floor(width * 0.78)),
        height: Math.max(1, Math.floor(height * 0.78))
      });
      fitted = jpegUnderLimit(current, targetBytes);
    }
    return fitted ?? current.toJPEG(Math.min(q, 40));
  }
  return current.toJPEG(q);
}

/** Keep the original photo bytes when no size cap is requested. */
export function embedOriginalPdfImages<T extends PdfImageSource>(rows: T[]): T[] {
  return rows.map((row) => {
    const filePath = normalizeFsPath(String(row.imagePath || ""));
    if (filePath && existsSync(filePath) && webSafeMime(filePath)) {
      const dataUrl = dataUrlFromFile(filePath);
      if (dataUrl) return { ...row, imageDataUrl: dataUrl, imagePath: undefined };
    }
    if (filePath && existsSync(filePath)) {
      const image = loadNativeImage(row);
      if (image && !image.isEmpty()) {
        const jpeg = image.toJPEG(92);
        return {
          ...row,
          imagePath: undefined,
          imageDataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`
        };
      }
    }
    if (row.imageDataUrl) return { ...row, imagePath: undefined };
    return row;
  });
}

export function compressPdfRowImages<T extends PdfImageSource>(
  rows: T[],
  pass: PdfImagePass
): T[] {
  return rows.map((row) => {
    if (!row.imageDataUrl && !row.imagePath) return row;
    const image = loadNativeImage(row);
    if (!image) {
      const filePath = normalizeFsPath(String(row.imagePath || ""));
      const fallback =
        row.imageDataUrl || (filePath ? dataUrlFromFile(filePath) : undefined);
      return { ...row, imageDataUrl: fallback, imagePath: undefined };
    }
    const jpeg = encodeJpeg(
      image,
      pass.maxEdge,
      pass.quality,
      pass.targetBytesPerImage
    );
    return {
      ...row,
      imagePath: undefined,
      imageDataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`
    };
  });
}

/**
 * Downscale photos before printToPDF. Electron's nativeImage cannot decode
 * every data-URL; loading from disk is the reliable path.
 * When maxBytes is set, keep shrinking and re-rendering until the file fits
 * or we hit a floor.
 */
export async function renderPdfWithImageBudget<T extends PdfImageSource>(options: {
  rows: T[];
  maxBytes?: number;
  defaultEdge: number;
  render: (rows: T[]) => Promise<Buffer>;
}): Promise<{ buffer: Buffer; overLimit: boolean }> {
  if (!options.maxBytes) {
    const buffer = await options.render(embedOriginalPdfImages(options.rows));
    return { buffer, overLimit: false };
  }

  const n = options.rows.filter((row) => row.imageDataUrl || row.imagePath).length;
  // Ceiling, not a target: start near original quality and only shrink if needed.
  const attempts: PdfImagePass[] = [
    { maxEdge: Math.max(options.defaultEdge, 2800), quality: 90 },
    { maxEdge: 2000, quality: 84 },
    { maxEdge: 1500, quality: 76 },
    {
      maxEdge: 1100,
      quality: 68,
      targetBytesPerImage:
        n > 0 ? Math.max(40_000, Math.floor((options.maxBytes * 0.62) / n)) : undefined
    },
    {
      maxEdge: 720,
      quality: 52,
      targetBytesPerImage:
        n > 0 ? Math.max(18_000, Math.floor((options.maxBytes * 0.4) / n)) : undefined
    },
    {
      maxEdge: 480,
      quality: 36,
      targetBytesPerImage:
        n > 0 ? Math.max(10_000, Math.floor((options.maxBytes * 0.26) / n)) : undefined
    },
    {
      maxEdge: 300,
      quality: 26,
      targetBytesPerImage:
        n > 0 ? Math.max(5_000, Math.floor((options.maxBytes * 0.16) / n)) : undefined
    }
  ];

  let buffer: Buffer | null = null;
  let best: Buffer | null = null;
  for (const pass of attempts) {
    const rows = compressPdfRowImages(options.rows, pass);
    buffer = await options.render(rows);
    if (!best || buffer.length < best.length) best = buffer;
    if (!options.maxBytes || buffer.length <= options.maxBytes) {
      return { buffer, overLimit: false };
    }
  }
  return {
    buffer: best ?? buffer ?? Buffer.alloc(0),
    overLimit: Boolean(options.maxBytes && (best?.length ?? 0) > options.maxBytes)
  };
}
