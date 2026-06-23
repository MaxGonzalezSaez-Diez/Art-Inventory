import { BrowserWindow, dialog, shell, type SaveDialogOptions } from "electron";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType
} from "docx";

export interface PriceListRow {
  title: string;
  series: string;
  material: string;
  size: string;
  year: string;
  price: string;
  imageDataUrl?: string;
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
  imagesPerPage?: number;
  fonts?: PriceListFonts;
  headerStyle?: PriceListStyle;
  subtitleStyle?: PriceListStyle;
  rows: PriceListRow[];
}

export type PriceListFormat = "pdf" | "docx";

const DEFAULT_FONTS: PriceListFonts = {
  header: "Georgia",
  subtitle: "Georgia",
  body: "Georgia"
};

interface DecodedImage {
  buffer: Buffer;
  type: "png" | "jpg" | "gif" | "bmp";
}

function decodeDataUrl(dataUrl?: string): DecodedImage | null {
  if (!dataUrl) return null;
  const match = /^data:(image\/[a-zA-Z.+-]+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  const type =
    mime.includes("png")
      ? "png"
      : mime.includes("gif")
        ? "gif"
        : mime.includes("bmp")
          ? "bmp"
          : "jpg";
  return { buffer, type };
}

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
  const rowsHtml = payload.rows
    .map((row) => {
      const imageCell = `<td class="img-cell"><div class="img-box" style="width:${frame}px;height:${frame}px;">${
        row.imageDataUrl
          ? `<img src="${row.imageDataUrl}" alt="" />`
          : `<span class="noimg">Sin imagen</span>`
      }</div></td>`;
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
    })
    .join("");

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
  table { width: 100%; border-collapse: collapse; }
  tr { border-bottom: 0.6px solid #d8d8d8; }
  td { padding: 12px 10px; vertical-align: middle; }
  .img-cell { width: ${frame + 24}px; text-align: left; }
  .img-box {
    display: flex; align-items: center; justify-content: center;
    background: #fafafa; border: 0.6px solid #e4e4e4;
  }
  .img-box img { width: 100%; height: 100%; object-fit: contain; }
  .noimg { font-size: 10px; color: #aaa; font-family: Arial, sans-serif; }
  .info-cell { text-align: left; }
  .info-cell .title { font-size: 15px; font-weight: 600; margin-bottom: 3px; }
  .info-cell .meta { font-size: 12.5px; color: #444; line-height: 1.5; }
  .info-cell .price {
    font-size: 14px; font-weight: 600; color: #1c1c1c; margin-top: 14px;
  }
</style></head>
<body>
  ${subHeaderRow}
  <div class="header">
    <h1>${escapeHtml(payload.header || "Lista de precios")}</h1>
    ${payload.subtitle ? `<p class="subtitle">${escapeHtml(payload.subtitle)}</p>` : ""}
  </div>
  <hr class="rule" />
  <table>${rowsHtml}</table>
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

/* -------------------------------------------------------------------- DOCX */

const INK = "1C1C1C";
const GREY = "444444";
const LINE = "D8D8D8";

function bottomBorderCell(children: Paragraph[], width?: number): TableCell {
  return new TableCell({
    children,
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    margins: { top: 120, bottom: 120, left: 80, right: 80 },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE }
    }
  });
}

async function buildDocx(payload: PriceListPayload): Promise<Buffer> {
  const fonts = payload.fonts ?? DEFAULT_FONTS;
  const perPage = payload.imagesPerPage ?? 4;
  const imgHeight = Math.round(rowImageHeight(perPage) * 0.85);

  const frame = imgHeight;
  const tableRows = payload.rows.map((row) => {
    const cells: TableCell[] = [];

    const decoded = decodeDataUrl(row.imageDataUrl);
    const { width, height } = fitInSquare(row, frame);
    const imageChildren: Paragraph[] = decoded
      ? [
          new Paragraph({
            children: [
              new ImageRun({
                data: decoded.buffer,
                type: decoded.type,
                transformation: { width, height }
              })
            ]
          })
        ]
      : [new Paragraph({ children: [new TextRun({ text: "", size: 2 })] })];
    cells.push(bottomBorderCell(imageChildren, Math.round((frame + 24) * 15)));

    const detailParagraphs: Paragraph[] = [
      new Paragraph({
        children: [
          new TextRun({
            text: row.title || "Sin título",
            bold: true,
            size: 26,
            color: INK,
            font: fonts.body
          })
        ]
      })
    ];
    [row.series, row.material, row.size, row.year]
      .filter((value) => value && value.trim())
      .forEach((value) => {
        detailParagraphs.push(
          new Paragraph({
            spacing: { before: 20 },
            children: [new TextRun({ text: value, size: 22, color: GREY, font: fonts.body })]
          })
        );
      });
    if (payload.showPrice && row.price) {
      detailParagraphs.push(
        new Paragraph({
          spacing: { before: 200 },
          children: [
            new TextRun({ text: row.price, bold: true, size: 24, color: INK, font: fonts.body })
          ]
        })
      );
    }
    cells.push(bottomBorderCell(detailParagraphs));

    return new TableRow({ children: cells });
  });

  const headerChildren: Paragraph[] = [];
  if (payload.leftHeader || payload.rightHeader) {
    headerChildren.push(
      new Paragraph({
        spacing: { after: 120 },
        tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
        children: [
          new TextRun({ text: payload.leftHeader || "", bold: true, size: 22, color: GREY, font: fonts.body }),
          new TextRun({ text: `\t${payload.rightHeader || ""}`, size: 22, color: GREY, font: fonts.body })
        ]
      })
    );
  }
  headerChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: payload.header || "Lista de precios",
          bold: payload.headerStyle?.bold !== false,
          italics: payload.headerStyle?.italic ?? false,
          size: 40,
          color: normalizeColor(payload.headerStyle?.color, INK),
          font: fonts.header
        })
      ]
    })
  );
  if (payload.subtitle) {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: payload.subtitle,
            italics: payload.subtitleStyle?.italic !== false,
            bold: payload.subtitleStyle?.bold ?? false,
            size: 24,
            color: normalizeColor(payload.subtitleStyle?.color, GREY),
            font: fonts.subtitle
          })
        ]
      })
    );
  }
  headerChildren.push(
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 1 } },
      children: []
    })
  );

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: fonts.body } }
      }
    },
    sections: [
      {
        properties: {},
        children: [
          ...headerChildren,
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows
          })
        ]
      }
    ]
  });

  return Packer.toBuffer(doc);
}

/* ----------------------------------------------------------------- export */

export async function generatePriceList(
  parentWindow: BrowserWindow | null,
  format: PriceListFormat,
  payload: PriceListPayload
): Promise<string | null> {
  const safeName =
    (payload.header || "lista-de-precios")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lista-de-precios";
  const extension = format === "pdf" ? "pdf" : "docx";

  const options: SaveDialogOptions = {
    title: "Guardar lista de precios",
    defaultPath: `${safeName}.${extension}`,
    filters: [
      {
        name: format === "pdf" ? "PDF" : "Documento Word",
        extensions: [extension]
      }
    ]
  };

  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) return null;

  const buffer =
    format === "pdf" ? await renderPdf(payload) : await buildDocx(payload);
  await writeFile(result.filePath, buffer);
  void shell.openPath(result.filePath);
  return result.filePath;
}
