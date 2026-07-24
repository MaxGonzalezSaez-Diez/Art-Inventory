import {
  BrowserWindow,
  dialog,
  nativeImage,
  shell,
  type NativeImage,
  type SaveDialogOptions
} from "electron";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";

export type ImageExportFormat = "jpg" | "png" | "pdf";

/**
 * How to handle DPI / print sizing:
 * - metadata: only write DPI into the file; keep all pixels
 * - print: resize so the image has enough pixels for printWidthCm × printHeightCm at dpi
 * - none: leave DPI alone (still allows format / max file size)
 */
export type ImageExportDpiMode = "none" | "metadata" | "print";

export interface ImageExportOptions {
  sourcePath: string;
  format: ImageExportFormat;
  targetKB?: number;
  dpiMode?: ImageExportDpiMode;
  /** Used for metadata and print modes. */
  dpi?: number;
  /** Physical print size in centimetres (print mode). */
  printWidthCm?: number;
  printHeightCm?: number;
  suggestedName?: string;
}

export interface ImageExportResult {
  path: string;
  bytes: number;
  width: number;
  height: number;
  dpi?: number;
}

export interface ImageProbe {
  width: number;
  height: number;
}

export function probeImage(sourcePath: string): ImageProbe | null {
  const image = nativeImage.createFromPath(sourcePath);
  if (image.isEmpty()) return null;
  return image.getSize();
}

function micronPerPxAt(dpi: number): number {
  return 25400 / Math.max(1, dpi);
}

function cmToPx(cm: number, dpi: number): number {
  return Math.round((cm / 2.54) * dpi);
}

function crc32Png(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function setPngDpi(buffer: Buffer, dpi: number): Buffer {
  if (buffer.length < 8 || buffer.toString("ascii", 1, 4) !== "PNG") return buffer;
  const ppm = Math.round(dpi / 0.0254);
  const type = Buffer.from("pHYs");
  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0);
  data.writeUInt32BE(ppm, 4);
  data[8] = 1;
  const len = Buffer.alloc(4);
  len.writeUInt32BE(9, 0);
  const crcBuf = Buffer.concat([type, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32Png(crcBuf), 0);
  const physChunk = Buffer.concat([len, type, data, crc]);

  const parts: Buffer[] = [buffer.subarray(0, 8)];
  let offset = 8;
  let inserted = false;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > buffer.length) break;
    const chunk = buffer.subarray(offset, chunkEnd);
    if (chunkType === "pHYs") {
      offset = chunkEnd;
      continue;
    }
    parts.push(chunk);
    if (chunkType === "IHDR" && !inserted) {
      parts.push(physChunk);
      inserted = true;
    }
    offset = chunkEnd;
    if (chunkType === "IEND") break;
  }
  if (!inserted) parts.push(physChunk);
  return Buffer.concat(parts);
}

function setJpegDpi(buffer: Buffer, dpi: number): Buffer {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;
  let i = 2;
  while (i + 4 < buffer.length && buffer[i] === 0xff) {
    const marker = buffer[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buffer.readUInt16BE(i + 2);
    if (i + 2 + len > buffer.length) break;
    if (
      marker === 0xe0 &&
      len >= 16 &&
      buffer.toString("ascii", i + 4, i + 8) === "JFIF"
    ) {
      const out = Buffer.from(buffer);
      out[i + 11] = 1;
      out.writeUInt16BE(dpi, i + 12);
      out.writeUInt16BE(dpi, i + 14);
      return out;
    }
    i += 2 + len;
  }

  const app0 = Buffer.alloc(18);
  app0[0] = 0xff;
  app0[1] = 0xe0;
  app0.writeUInt16BE(16, 2);
  app0.write("JFIF\0", 4, "ascii");
  app0[9] = 1;
  app0[10] = 1;
  app0[11] = 1;
  app0.writeUInt16BE(dpi, 12);
  app0.writeUInt16BE(dpi, 14);
  app0[16] = 0;
  app0[17] = 0;
  return Buffer.concat([buffer.subarray(0, 2), app0, buffer.subarray(2)]);
}

function applyDpiMetadata(
  buffer: Buffer,
  format: "jpg" | "png",
  dpi?: number
): Buffer {
  if (!dpi || dpi <= 0) return buffer;
  return format === "png" ? setPngDpi(buffer, dpi) : setJpegDpi(buffer, dpi);
}

/** Fit image inside a pixel box, preserving aspect ratio (never crops). */
function resizeToFitBox(
  image: NativeImage,
  boxW: number,
  boxH: number
): NativeImage {
  const { width, height } = image.getSize();
  if (width <= 0 || height <= 0) return image;
  const scale = Math.min(boxW / width, boxH / height);
  const newW = Math.max(1, Math.round(width * scale));
  const newH = Math.max(1, Math.round(height * scale));
  if (newW === width && newH === height) return image;
  return image.resize({ width: newW, height: newH });
}

function prepareImage(
  source: NativeImage,
  options: ImageExportOptions
): { image: NativeImage; dpi?: number } {
  const mode = options.dpiMode ?? "none";
  const dpi =
    options.dpi && options.dpi > 0 ? Math.round(options.dpi) : undefined;

  if (mode === "print") {
    if (!dpi) throw new Error("Indica el DPI para preparar la impresión.");
    const wCm = Number(options.printWidthCm);
    const hCm = Number(options.printHeightCm);
    if (!(wCm > 0) || !(hCm > 0)) {
      throw new Error("Indica el ancho y el alto de impresión en cm.");
    }
    const boxW = cmToPx(wCm, dpi);
    const boxH = cmToPx(hCm, dpi);
    return { image: resizeToFitBox(source, boxW, boxH), dpi };
  }

  if (mode === "metadata") {
    if (!dpi) throw new Error("Indica el DPI a marcar en el archivo.");
    return { image: source, dpi };
  }

  return { image: source, dpi: undefined };
}

const JPEG_QUALITIES = [95, 92, 88, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 12];

function encodeRaster(
  source: NativeImage,
  format: "jpg" | "png",
  targetBytes: number | undefined
): { buffer: Buffer; width: number; height: number } {
  let image = source;

  if (format === "png") {
    let buffer = image.toPNG();
    while (targetBytes && buffer.length > targetBytes && image.getSize().width > 100) {
      image = image.resize({ width: Math.round(image.getSize().width * 0.85) });
      buffer = image.toPNG();
    }
    const size = image.getSize();
    return { buffer, width: size.width, height: size.height };
  }

  if (!targetBytes) {
    const buffer = image.toJPEG(92);
    const size = image.getSize();
    return { buffer, width: size.width, height: size.height };
  }

  let best = image.toJPEG(92);
  if (best.length <= targetBytes) {
    const size = image.getSize();
    return { buffer: best, width: size.width, height: size.height };
  }

  for (const quality of JPEG_QUALITIES) {
    const buffer = image.toJPEG(quality);
    if (buffer.length < best.length) best = buffer;
    if (buffer.length <= targetBytes) {
      const size = image.getSize();
      return { buffer, width: size.width, height: size.height };
    }
  }

  while (image.getSize().width > 140) {
    image = image.resize({ width: Math.round(image.getSize().width * 0.85) });
    for (const quality of JPEG_QUALITIES) {
      const buffer = image.toJPEG(quality);
      if (buffer.length < best.length) best = buffer;
      if (buffer.length <= targetBytes) {
        const size = image.getSize();
        return { buffer, width: size.width, height: size.height };
      }
    }
  }

  const size = image.getSize();
  return { buffer: best, width: size.width, height: size.height };
}

async function renderImagePdf(
  jpeg: Buffer,
  size: { width: number; height: number },
  dpi: number
): Promise<Buffer> {
  const micron = micronPerPxAt(dpi);
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
    html,body{margin:0;padding:0;}
    img{display:block;width:${size.width}px;height:${size.height}px;}
  </style></head><body><img src="${dataUrl}" /></body></html>`;
  const tempFile = path.join(tmpdir(), `imgpdf-${randomUUID()}.html`);
  const win = new BrowserWindow({
    show: false,
    width: Math.max(200, size.width),
    height: Math.max(200, size.height),
    webPreferences: { sandbox: true }
  });
  try {
    await writeFile(tempFile, html, "utf8");
    await win.loadFile(tempFile);
    return await win.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: {
        width: Math.round(size.width * micron),
        height: Math.round(size.height * micron)
      }
    });
  } finally {
    win.destroy();
    await unlink(tempFile).catch(() => undefined);
  }
}

function sanitizeName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "imagen"
  );
}

export async function exportImage(
  parentWindow: BrowserWindow | null,
  options: ImageExportOptions
): Promise<ImageExportResult | null> {
  const source = nativeImage.createFromPath(options.sourcePath);
  if (source.isEmpty()) {
    throw new Error("No se pudo leer la imagen seleccionada.");
  }

  const prepared = prepareImage(source, options);
  const base = sanitizeName(
    options.suggestedName || path.basename(options.sourcePath)
  );
  const extension = options.format === "jpg" ? "jpg" : options.format;
  const filterName =
    options.format === "pdf" ? "PDF" : options.format === "png" ? "PNG" : "JPEG";

  const dialogOptions: SaveDialogOptions = {
    title: "Guardar imagen",
    defaultPath: `${base}.${extension}`,
    filters: [{ name: filterName, extensions: [extension] }]
  };
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);
  if (result.canceled || !result.filePath) return null;

  const targetBytes = options.targetKB
    ? Math.round(options.targetKB * 1024)
    : undefined;

  let buffer: Buffer;
  let width: number;
  let height: number;

  if (options.format === "pdf") {
    const headroom = targetBytes
      ? Math.max(8 * 1024, targetBytes - 12 * 1024)
      : undefined;
    const encoded = encodeRaster(prepared.image, "jpg", headroom);
    width = encoded.width;
    height = encoded.height;
    buffer = await renderImagePdf(
      encoded.buffer,
      { width, height },
      prepared.dpi ?? 96
    );
  } else {
    const encoded = encodeRaster(prepared.image, options.format, targetBytes);
    width = encoded.width;
    height = encoded.height;
    buffer = applyDpiMetadata(encoded.buffer, options.format, prepared.dpi);
  }

  await writeFile(result.filePath, buffer);
  shell.showItemInFolder(result.filePath);
  return {
    path: result.filePath,
    bytes: buffer.length,
    width,
    height,
    dpi: prepared.dpi
  };
}
