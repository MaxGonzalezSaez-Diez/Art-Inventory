import {
  BrowserWindow,
  dialog,
  nativeImage,
  shell,
  type NativeImage,
  type OpenDialogOptions
} from "electron";
import { access, mkdir, writeFile } from "fs/promises";
import path from "path";
import { chooseGeneratedSavePath, GENERATED_FOLDER } from "./exportPath";

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

export type BulkExportDestination = "generated" | "chooseFolder";

export interface BulkImageExportItem {
  sourcePath: string;
  suggestedName: string;
  /** Stable id so filenames never collide across works. */
  artworkId?: string;
  /** Per-work print size override (print mode). */
  printWidthCm?: number;
  printHeightCm?: number;
}

export interface BulkImageExportOptions {
  items: BulkImageExportItem[];
  format: ImageExportFormat;
  targetKB?: number;
  dpiMode?: ImageExportDpiMode;
  dpi?: number;
  /** Fallback print size when an item has no measures. */
  printWidthCm?: number;
  printHeightCm?: number;
  destination: BulkExportDestination;
  /**
   * Only used when destination is chooseFolder:
   * creates `{pickedParent}/{newFolderName}/` and saves inside.
   */
  newFolderName?: string;
}

export interface BulkImageExportResult {
  directory: string;
  saved: ImageExportResult[];
  skipped: Array<{ suggestedName: string; reason: string }>;
  failed: Array<{ suggestedName: string; error: string }>;
}

export function probeImage(sourcePath: string): ImageProbe | null {
  const image = nativeImage.createFromPath(sourcePath);
  if (image.isEmpty()) return null;
  return image.getSize();
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

/** Fit image inside a pixel box, preserving aspect ratio (never crops, never upscales). */
function resizeToFitBox(
  image: NativeImage,
  boxW: number,
  boxH: number
): NativeImage {
  const { width, height } = image.getSize();
  if (width <= 0 || height <= 0) return image;
  // Cap at 1 so a small photo is never stretched — that only makes it blurry.
  const scale = Math.min(1, boxW / width, boxH / height);
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

/** Minimum width while shrinking to meet a hard byte limit. */
const MIN_LIMIT_WIDTH = 48;

/**
 * Highest JPEG quality (1–95) whose encoded size is ≤ targetBytes.
 * Binary search so we land close to the limit instead of jumping down a coarse step.
 */
function jpegUnderLimit(
  image: NativeImage,
  targetBytes: number,
  finalize: (raw: Buffer) => Buffer
): Buffer | null {
  let lo = 1;
  let hi = 95;
  let best: Buffer | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const buffer = finalize(image.toJPEG(mid));
    if (buffer.length <= targetBytes) {
      best = buffer;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Encode a raster image. When targetBytes is set, the returned buffer is
 * guaranteed to be ≤ targetBytes (after optional DPI metadata), or we throw.
 * JPEG aims for the largest file still under the limit (close to the ceiling).
 */
function encodeRaster(
  source: NativeImage,
  format: "jpg" | "png",
  targetBytes: number | undefined,
  dpi?: number
): { buffer: Buffer; width: number; height: number } {
  let image = source;

  const finalize = (raw: Buffer) => applyDpiMetadata(raw, format, dpi);

  if (format === "png") {
    let buffer = finalize(image.toPNG());
    while (targetBytes && buffer.length > targetBytes) {
      const { width } = image.getSize();
      if (width <= MIN_LIMIT_WIDTH) {
        throw new Error(
          "No se pudo comprimir la imagen por debajo del límite de peso. Prueba JPG o un límite más alto."
        );
      }
      image = image.resize({
        width: Math.max(MIN_LIMIT_WIDTH, Math.floor(width * 0.92))
      });
      buffer = finalize(image.toPNG());
    }
    const size = image.getSize();
    return { buffer, width: size.width, height: size.height };
  }

  if (!targetBytes) {
    const buffer = finalize(image.toJPEG(92));
    const size = image.getSize();
    return { buffer, width: size.width, height: size.height };
  }

  // Full resolution first: pick the highest quality that still fits.
  let fitted = jpegUnderLimit(image, targetBytes, finalize);
  if (fitted) {
    const size = image.getSize();
    return { buffer: fitted, width: size.width, height: size.height };
  }

  // Still too big even at quality 1 — shrink gently and retry.
  while (image.getSize().width > MIN_LIMIT_WIDTH) {
    const { width } = image.getSize();
    image = image.resize({
      width: Math.max(MIN_LIMIT_WIDTH, Math.floor(width * 0.92))
    });
    fitted = jpegUnderLimit(image, targetBytes, finalize);
    if (fitted) {
      const size = image.getSize();
      return { buffer: fitted, width: size.width, height: size.height };
    }
  }

  throw new Error(
    "No se pudo comprimir la imagen por debajo del límite de peso. Prueba un límite más alto."
  );
}

/**
 * Build a one-page PDF that embeds a JPEG at the given pixel size / DPI.
 * Avoids Electron printToPDF (custom page sizes often throw "Printing failed").
 */
function buildJpegPdf(
  jpeg: Buffer,
  size: { width: number; height: number },
  dpi: number
): Buffer {
  const safeDpi = Math.max(1, dpi);
  const pageW = (size.width * 72) / safeDpi;
  const pageH = (size.height * 72) / safeDpi;
  if (!(pageW > 0) || !(pageH > 0)) {
    throw new Error("No se pudo calcular el tamaño de página del PDF.");
  }

  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, "");

  const content = `q\n${fmt(pageW)} 0 0 ${fmt(pageH)} 0 0 cm\n/Im0 Do\nQ\n`;
  const imageDict =
    `<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`;

  const objectBodies: Array<string | Buffer> = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pageW)} ${fmt(pageH)}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}endstream`,
    Buffer.concat([
      Buffer.from(`${imageDict}\nstream\n`, "utf8"),
      jpeg,
      Buffer.from("\nendstream", "utf8")
    ])
  ];

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "utf8")];
  const offsets: number[] = [0];
  let cursor = parts[0].length;
  objectBodies.forEach((body, index) => {
    const id = index + 1;
    offsets.push(cursor);
    const chunk =
      typeof body === "string"
        ? Buffer.from(`${id} 0 obj\n${body}\nendobj\n`, "utf8")
        : Buffer.concat([
            Buffer.from(`${id} 0 obj\n`, "utf8"),
            body,
            Buffer.from("\nendobj\n", "utf8")
          ]);
    parts.push(chunk);
    cursor += chunk.length;
  });

  const assembled = Buffer.concat(parts);
  const xrefStart = assembled.length;
  let xref = `xref\n0 ${objectBodies.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objectBodies.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.concat([assembled, Buffer.from(xref, "utf8")]);
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Pick a free path in dir from the artwork title (title.jpg, title-2.jpg, …). */
async function uniquePathInDir(
  dir: string,
  baseName: string,
  extension: string
): Promise<string> {
  const stem = sanitizeName(baseName) || "obra";
  let candidate = path.join(dir, `${stem}.${extension}`);
  if (!(await fileExists(candidate))) return candidate;
  for (let n = 2; n < 1000; n += 1) {
    candidate = path.join(dir, `${stem}-${n}.${extension}`);
    if (!(await fileExists(candidate))) return candidate;
  }
  return path.join(dir, `${stem}-${Date.now()}.${extension}`);
}

async function uniqueSubdir(parent: string, folderName: string): Promise<string> {
  const safe = sanitizeName(folderName) || "fotos";
  let dir = path.join(parent, safe);
  if (!(await fileExists(dir))) {
    await mkdir(dir, { recursive: true });
    return dir;
  }
  for (let n = 2; n < 1000; n += 1) {
    dir = path.join(parent, `${safe}-${n}`);
    if (!(await fileExists(dir))) {
      await mkdir(dir, { recursive: true });
      return dir;
    }
  }
  dir = path.join(parent, `${safe}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

function buildExportBuffer(
  source: NativeImage,
  options: ImageExportOptions
): {
  buffer: Buffer;
  width: number;
  height: number;
  dpi?: number;
} {
  const prepared = prepareImage(source, options);
  const targetBytes = options.targetKB
    ? Math.floor(options.targetKB * 1000)
    : undefined;

  let buffer: Buffer;
  let width: number;
  let height: number;

  if (options.format === "pdf") {
    let jpegBudget = targetBytes
      ? Math.max(1024, Math.floor(targetBytes * 0.92) - 4096)
      : undefined;
    let encoded = encodeRaster(prepared.image, "jpg", jpegBudget, undefined);
    width = encoded.width;
    height = encoded.height;
    buffer = buildJpegPdf(
      encoded.buffer,
      { width, height },
      prepared.dpi ?? 96
    );

    let guard = 0;
    while (targetBytes && buffer.length > targetBytes && guard < 24) {
      guard += 1;
      jpegBudget = Math.max(
        512,
        Math.floor((jpegBudget ?? buffer.length) * 0.85)
      );
      encoded = encodeRaster(prepared.image, "jpg", jpegBudget, undefined);
      width = encoded.width;
      height = encoded.height;
      buffer = buildJpegPdf(
        encoded.buffer,
        { width, height },
        prepared.dpi ?? 96
      );
    }

    if (targetBytes && buffer.length > targetBytes) {
      throw new Error(
        "No se pudo comprimir el PDF por debajo del límite de peso. Prueba un límite más alto."
      );
    }
  } else {
    const encoded = encodeRaster(
      prepared.image,
      options.format,
      targetBytes,
      prepared.dpi
    );
    width = encoded.width;
    height = encoded.height;
    buffer = encoded.buffer;
  }

  if (targetBytes && buffer.length > targetBytes) {
    throw new Error(
      "No se pudo comprimir la imagen por debajo del límite de peso. Prueba un límite más alto."
    );
  }

  return { buffer, width, height, dpi: prepared.dpi };
}

export async function exportImage(
  parentWindow: BrowserWindow | null,
  options: ImageExportOptions,
  libraryPath = ""
): Promise<ImageExportResult | null> {
  const source = nativeImage.createFromPath(options.sourcePath);
  if (source.isEmpty()) {
    throw new Error("No se pudo leer la imagen seleccionada.");
  }

  const base = sanitizeName(
    options.suggestedName || path.basename(options.sourcePath)
  );
  const extension = options.format === "jpg" ? "jpg" : options.format;
  const filterName =
    options.format === "pdf" ? "PDF" : options.format === "png" ? "PNG" : "JPEG";

  const filePath = await chooseGeneratedSavePath(
    parentWindow,
    libraryPath,
    `${base}.${extension}`,
    {
      title: "Guardar imagen",
      filters: [{ name: filterName, extensions: [extension] }]
    }
  );
  if (!filePath) return null;

  const encoded = buildExportBuffer(source, options);
  await writeFile(filePath, encoded.buffer);
  shell.showItemInFolder(filePath);
  return {
    path: filePath,
    bytes: encoded.buffer.length,
    width: encoded.width,
    height: encoded.height,
    dpi: encoded.dpi
  };
}

async function pickDirectory(
  parentWindow: BrowserWindow | null,
  title: string,
  defaultPath?: string
): Promise<string | null> {
  const options: OpenDialogOptions = {
    title,
    properties: ["openDirectory", "createDirectory"],
    ...(defaultPath ? { defaultPath } : {})
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
}

async function resolveBulkDirectory(
  parentWindow: BrowserWindow | null,
  libraryPath: string,
  destination: BulkExportDestination,
  newFolderName?: string
): Promise<string | null> {
  const generated = libraryPath
    ? path.join(libraryPath, GENERATED_FOLDER)
    : "";

  // generated → loose files directly in library/generated
  if (destination === "generated") {
    if (!generated) throw new Error("No hay biblioteca abierta.");
    await mkdir(generated, { recursive: true });
    return generated;
  }

  // own location → create named folder inside the parent the user picks
  const folderName = String(newFolderName ?? "").trim();
  if (!folderName) {
    throw new Error("Indica un nombre para la carpeta.");
  }
  const parent = await pickDirectory(
    parentWindow,
    "Elegir dónde crear la carpeta",
    generated || undefined
  );
  if (!parent) return null;
  return uniqueSubdir(parent, folderName);
}

export async function exportImagesBulk(
  parentWindow: BrowserWindow | null,
  options: BulkImageExportOptions,
  libraryPath = ""
): Promise<BulkImageExportResult | null> {
  if (!options.items.length) {
    throw new Error("No hay obras seleccionadas.");
  }

  const directory = await resolveBulkDirectory(
    parentWindow,
    libraryPath,
    options.destination,
    options.newFolderName
  );
  if (!directory) return null;

  const extension = options.format === "jpg" ? "jpg" : options.format;
  const saved: ImageExportResult[] = [];
  const skipped: BulkImageExportResult["skipped"] = [];
  const failed: BulkImageExportResult["failed"] = [];

  for (const item of options.items) {
    const name = item.suggestedName || path.basename(item.sourcePath);
    if (!item.sourcePath) {
      skipped.push({ suggestedName: name, reason: "Sin foto principal." });
      continue;
    }
    try {
      const source = nativeImage.createFromPath(item.sourcePath);
      if (source.isEmpty()) {
        skipped.push({
          suggestedName: name,
          reason: "No se pudo leer la foto principal."
        });
        continue;
      }

      const encoded = buildExportBuffer(source, {
        sourcePath: item.sourcePath,
        format: options.format,
        targetKB: options.targetKB,
        dpiMode: options.dpiMode,
        dpi: options.dpi,
        printWidthCm: item.printWidthCm ?? options.printWidthCm,
        printHeightCm: item.printHeightCm ?? options.printHeightCm,
        suggestedName: name
      });

      const filePath = await uniquePathInDir(directory, name, extension);
      await writeFile(filePath, encoded.buffer);
      saved.push({
        path: filePath,
        bytes: encoded.buffer.length,
        width: encoded.width,
        height: encoded.height,
        dpi: encoded.dpi
      });
    } catch (error) {
      failed.push({
        suggestedName: name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Open the destination so the user sees the result.
  if (saved.length === 1) {
    shell.showItemInFolder(saved[0].path);
  } else {
    await shell.openPath(directory);
  }

  return { directory, saved, skipped, failed };
}
