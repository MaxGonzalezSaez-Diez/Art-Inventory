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

export interface ImageExportOptions {
  sourcePath: string;
  format: ImageExportFormat;
  targetKB?: number; // desired maximum file size
  maxDimension?: number; // longest side in pixels
  suggestedName?: string;
}

export interface ImageExportResult {
  path: string;
  bytes: number;
}

const MICRON_PER_PX = 264.5833; // 1px at 96dpi in microns

function resizeToMax(image: NativeImage, maxDim?: number): NativeImage {
  if (!maxDim || maxDim <= 0) return image;
  const { width, height } = image.getSize();
  if (width <= maxDim && height <= maxDim) return image;
  return width >= height
    ? image.resize({ width: maxDim })
    : image.resize({ height: maxDim });
}

// Try increasingly aggressive JPEG quality (and then downscaling) until the
// encoded buffer fits under the requested size. Returns the smallest tried if
// the target can't be reached.
const JPEG_QUALITIES = [92, 85, 78, 70, 62, 55, 48, 40, 32, 25, 18, 12];

function encodeRaster(
  source: NativeImage,
  format: "jpg" | "png",
  targetBytes: number | undefined,
  maxDim: number | undefined
): Buffer {
  let image = resizeToMax(source, maxDim);

  if (format === "png") {
    let buffer = image.toPNG();
    while (targetBytes && buffer.length > targetBytes && image.getSize().width > 100) {
      image = image.resize({ width: Math.round(image.getSize().width * 0.8) });
      buffer = image.toPNG();
    }
    return buffer;
  }

  if (!targetBytes) return image.toJPEG(92);

  let best = image.toJPEG(92);
  if (best.length <= targetBytes) return best;
  for (const quality of JPEG_QUALITIES) {
    const buffer = image.toJPEG(quality);
    if (buffer.length < best.length) best = buffer;
    if (buffer.length <= targetBytes) return buffer;
  }
  while (image.getSize().width > 140) {
    image = image.resize({ width: Math.round(image.getSize().width * 0.8) });
    for (const quality of JPEG_QUALITIES) {
      const buffer = image.toJPEG(quality);
      if (buffer.length < best.length) best = buffer;
      if (buffer.length <= targetBytes) return buffer;
    }
  }
  return best;
}

// One-page PDF that is exactly the size of the (already-sized) image.
async function renderImagePdf(
  jpeg: Buffer,
  size: { width: number; height: number }
): Promise<Buffer> {
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
        width: Math.round(size.width * MICRON_PER_PX),
        height: Math.round(size.height * MICRON_PER_PX)
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
  const image = nativeImage.createFromPath(options.sourcePath);
  if (image.isEmpty()) {
    throw new Error("No se pudo leer la imagen seleccionada.");
  }

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

  const targetBytes = options.targetKB ? Math.round(options.targetKB * 1024) : undefined;

  let buffer: Buffer;
  if (options.format === "pdf") {
    const sized = resizeToMax(image, options.maxDimension);
    // Leave a little headroom for the PDF container overhead.
    const headroom = targetBytes ? Math.max(8 * 1024, targetBytes - 12 * 1024) : undefined;
    const jpeg = encodeRaster(sized, "jpg", headroom, undefined);
    buffer = await renderImagePdf(jpeg, sized.getSize());
  } else {
    buffer = encodeRaster(image, options.format, targetBytes, options.maxDimension);
  }

  await writeFile(result.filePath, buffer);
  shell.showItemInFolder(result.filePath);
  return { path: result.filePath, bytes: buffer.length };
}
