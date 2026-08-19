import { BrowserWindow, shell } from "electron";
import { writeFile, unlink, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import { chooseGeneratedSavePath } from "./exportPath";
import { makeGeneratedFileEditable } from "./makeFileEditable";
import {
  maxBytesFromMb,
  parseMaxMb,
  renderPdfWithImageBudget,
  type GeneratedPdfResult
} from "./pdfImages";

export interface PriceListRow {
  title: string;
  series: string;
  material: string;
  size: string;
  year: string;
  price: string;
  imageDataUrl?: string;
  /** Library file path — preferred over imageDataUrl for compression. */
  imagePath?: string;
  widthCm?: number;
  heightCm?: number;
}

export interface PriceListFonts {
  header: string;
  subtitle: string;
  body: string;
}

export interface PriceListStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface PriceListPayload {
  header: string;
  subtitle?: string;
  leftHeader?: string;
  rightHeader?: string;
  showPrice: boolean;
  priceBold?: boolean;
  titleFontSize?: number;
  textFontSize?: number;
  priceFontSize?: number;
  textBold?: boolean;
  imagesPerPage?: number;
  imageGap?: number; // horizontal space (px) between the frame and the text
  frameBorderColor?: string; // hex colour of the image frame border
  fonts?: PriceListFonts;
  headerStyle?: PriceListStyle;
  subtitleStyle?: PriceListStyle;
  rows: PriceListRow[];
  /** Optional cap for the generated PDF, in megabytes. */
  maxMb?: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const per = Math.max(1, size);
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += per) {
    pages.push(items.slice(index, index + per));
  }
  return pages.length > 0 ? pages : [[]];
}

const DEFAULT_FONTS: PriceListFonts = {
  header: "Georgia",
  subtitle: "Georgia",
  body: "Georgia"
};

// Every image shares the same HEIGHT so a fixed number fit per page.
// Width follows each painting's own aspect ratio.
function rowImageHeight(imagesPerPage: number, usable = 980, reserve = 110): number {
  const per = (usable - reserve) / Math.max(1, imagesPerPage);
  return Math.max(60, Math.min(340, Math.round(per - 30)));
}

// Catalogue style: every artwork sits in an identical square frame and the
// photo is scaled to fit inside it while keeping its aspect ratio. Some leave
// whitespace on the sides, others above/below — the eye compares the frames.
function fitInSquare(
  row: PriceListRow,
  size: number
): { width: number; height: number } {
  const w = row.widthCm ?? 0;
  const h = row.heightCm ?? 0;
  if (w > 0 && h > 0) {
    const aspect = w / h;
    if (aspect >= 1) return { width: size, height: Math.round(size / aspect) };
    return { width: Math.round(size * aspect), height: size };
  }
  return { width: size, height: size };
}

function normalizeColor(color: string | undefined, fallback: string): string {
  const value = (color || fallback).replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : fallback;
}

function clampPdfFontSize(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(36, Math.max(8, Math.round(n * 2) / 2));
}

/* ---------------------------------------------------------------- PDF (HTML) */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(payload: PriceListPayload): string {
  const fonts = payload.fonts ?? DEFAULT_FONTS;
  const perPage = payload.imagesPerPage ?? 4;
  const imgHeight = rowImageHeight(perPage);
  const headerColor = `#${normalizeColor(payload.headerStyle?.color, "1C1C1C")}`;
  const subtitleColor = `#${normalizeColor(payload.subtitleStyle?.color, "555555")}`;

  const frame = imgHeight;
  const gap = Math.max(0, Math.round(payload.imageGap ?? 16));
  const borderColor = `#${normalizeColor(payload.frameBorderColor, "E4E4E4")}`;
  // Keep the image strictly inside the frame so the border is never covered by
  // the (often white-edged) picture. The box is `frame`, the image fits the
  // padded inner area.
  const framePad = 8;
  const innerFrame = Math.max(20, frame - 2 * (framePad + 1));

  function renderRow(row: PriceListRow): string {
    const fit = fitInSquare(row, innerFrame);
    const innerImg = row.imageDataUrl
      ? `<img src="${row.imageDataUrl}" alt="" style="width:${fit.width}px;height:${fit.height}px;object-fit:fill;" />`
      : `<span class="noimg">Sin imagen</span>`;
    const imageCell = `<td class="img-cell"><div class="img-box" style="width:${frame}px;height:${frame}px;">${innerImg}</div></td>`;
    const meta = [row.series, row.material, row.size]
      .filter((value) => value && value.trim())
      .map((value) => `<div class="meta">${escapeHtml(value)}</div>`)
      .join("");
    const yearLine = row.year ? `<div class="meta">${escapeHtml(row.year)}</div>` : "";
    const priceLine =
      payload.showPrice && row.price
        ? `<div class="price">${escapeHtml(row.price)}</div>`
        : "";
    const details = [
      `<div class="title">${escapeHtml(row.title || "Sin título")}</div>`,
      meta,
      yearLine,
      priceLine
    ]
      .filter(Boolean)
      .join("");
    return `<tr>${imageCell}<td class="info-cell">${details}</td></tr>`;
  }

  // Split into pages so the PDF breaks cleanly (a painting never gets cut in
  // half across a page). Each page holds exactly `perPage` artworks.
  const pages = chunk(payload.rows, perPage);
  const pagesHtml = pages
    .map((pageRows, index) => {
      const rows = pageRows.map(renderRow).join("");
      const isLast = index === pages.length - 1;
      const breakStyle = isLast
        ? ""
        : ' style="page-break-after: always; break-after: page;"';
      return `<div class="page"${breakStyle}><table>${rows}</table></div>`;
    })
    .join("");

  const priceWeight = payload.priceBold === false ? 400 : 700;
  const textWeight = payload.textBold ? 700 : 400;
  const titleSizePx = clampPdfFontSize(payload.titleFontSize, 15);
  const textSizePx = clampPdfFontSize(payload.textFontSize, 12.5);
  const priceSizePx = clampPdfFontSize(payload.priceFontSize, 15);

  const subHeaderRow =
    payload.leftHeader || payload.rightHeader
      ? `<div class="subhead">
          <span class="subhead-left">${escapeHtml(payload.leftHeader || "")}</span>
          <span class="subhead-right">${escapeHtml(payload.rightHeader || "")}</span>
        </div>`
      : "";

  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: ${cssFont(fonts.body)};
    color: #1c1c1c;
    margin: 0;
    padding: 0;
  }
  .header { text-align: center; margin-bottom: 6px; }
  .header h1 {
    font-family: ${cssFont(fonts.header)};
    font-size: 26px; letter-spacing: 0.5px; margin: 0 0 4px;
    color: ${headerColor};
    font-weight: ${payload.headerStyle?.bold === false ? 400 : 700};
    font-style: ${payload.headerStyle?.italic ? "italic" : "normal"};
  }
  .header .subtitle {
    font-family: ${cssFont(fonts.subtitle)};
    font-size: 13px; margin: 0;
    color: ${subtitleColor};
    font-weight: ${payload.subtitleStyle?.bold ? 700 : 400};
    font-style: ${payload.subtitleStyle?.italic === false ? "normal" : "italic"};
  }
  .subhead {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 12.5px; color: #333; margin: 0 2px 14px;
  }
  .subhead-left { font-weight: 600; }
  .subhead-right { text-align: right; }
  .rule { border: none; border-top: 1.5px solid #1c1c1c; margin: 12px 0 18px; }
  .page { }
  table { width: 100%; border-collapse: collapse; }
  tr { border-bottom: 0.6px solid #d8d8d8; page-break-inside: avoid; break-inside: avoid; }
  /* A grey line above the first painting on every page (the one that was
     otherwise missing at the top of a new page). */
  table tr:first-child { border-top: 0.6px solid #d8d8d8; }
  td { padding: 12px 10px; vertical-align: middle; }
  .img-cell { width: ${frame + 12}px; text-align: left; padding-right: 0; }
  .img-box {
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: 1px solid ${borderColor};
    padding: ${framePad}px; overflow: hidden;
  }
  .noimg { font-size: 10px; color: #aaa; font-family: Arial, sans-serif; }
  .info-cell { text-align: left; padding-left: ${gap}px; }
  .info-cell .title { font-size: ${titleSizePx}px; font-weight: 600; margin-bottom: 3px; }
  .info-cell .meta { font-size: ${textSizePx}px; font-weight: ${textWeight}; color: #444; line-height: 1.5; }
  .info-cell .price {
    font-size: ${priceSizePx}px; font-weight: ${priceWeight}; color: #1c1c1c; margin-top: 14px;
  }
</style></head>
<body>
  ${subHeaderRow}
  <div class="header">
    <h1>${escapeHtml(payload.header || "Folleto de obras")}</h1>
    ${payload.subtitle ? `<p class="subtitle">${escapeHtml(payload.subtitle)}</p>` : ""}
  </div>
  <hr class="rule" />
  ${pagesHtml}
</body></html>`;
}

function cssFont(name: string): string {
  const safe = (name || "Georgia").replace(/["\\]/g, "");
  return `"${safe}", Georgia, "Times New Roman", serif`;
}

async function renderPdf(payload: PriceListPayload): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true }
  });
  const tempFile = path.join(tmpdir(), `pricelist-${randomUUID()}.html`);
  try {
    await writeFile(tempFile, buildHtml(payload), "utf8");
    await win.loadFile(tempFile);
    const data = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
    });
    return data;
  } finally {
    win.destroy();
    await unlink(tempFile).catch(() => undefined);
  }
}

/* ----------------------------------------------------------------- export */

export async function generatePriceList(
  parentWindow: BrowserWindow | null,
  payload: PriceListPayload,
  libraryPath = ""
): Promise<GeneratedPdfResult | null> {
  const safeName =
    (payload.header || "lista-de-precios")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lista-de-precios";

  const filePath = await chooseGeneratedSavePath(
    parentWindow,
    libraryPath,
    `${safeName}.pdf`,
    {
      title: "Guardar lista de precios",
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    }
  );
  if (!filePath) return null;

  const maxBytes = maxBytesFromMb(parseMaxMb(payload.maxMb));
  const { buffer } = await renderPdfWithImageBudget({
    rows: payload.rows,
    maxBytes,
    defaultEdge: 1100,
    render: (rows) => renderPdf({ ...payload, rows })
  });
  await writeFile(filePath, buffer);
  await makeGeneratedFileEditable(filePath);
  const bytes = (await stat(filePath)).size;
  void shell.openPath(filePath);
  return {
    path: filePath,
    bytes,
    overLimit: Boolean(maxBytes && bytes > maxBytes)
  };
}
