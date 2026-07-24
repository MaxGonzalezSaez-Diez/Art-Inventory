import { BrowserWindow, dialog, shell, type SaveDialogOptions } from "electron";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import { makeGeneratedFileEditable } from "./makeFileEditable";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
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
  priceBold?: boolean; // whether the price is shown in bold
  imagesPerPage?: number;
  imageGap?: number; // horizontal space (px) between the frame and the text
  frameBorderColor?: string; // hex colour of the image frame border
  fonts?: PriceListFonts;
  headerStyle?: PriceListStyle;
  subtitleStyle?: PriceListStyle;
  rows: PriceListRow[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const per = Math.max(1, size);
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += per) {
    pages.push(items.slice(index, index + per));
  }
  return pages.length > 0 ? pages : [[]];
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
    background: #fafafa; border: 1px solid ${borderColor};
    padding: ${framePad}px; overflow: hidden;
  }
  .noimg { font-size: 10px; color: #aaa; font-family: Arial, sans-serif; }
  .info-cell { text-align: left; padding-left: ${gap}px; }
  .info-cell .title { font-size: 15px; font-weight: 600; margin-bottom: 3px; }
  .info-cell .meta { font-size: 12.5px; color: #444; line-height: 1.5; }
  .info-cell .price {
    font-size: 14px; font-weight: ${priceWeight}; color: #1c1c1c; margin-top: 14px;
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

/* -------------------------------------------------------------------- DOCX */

const INK = "1C1C1C";
const GREY = "444444";
const LINE = "D8D8D8";

async function buildDocx(payload: PriceListPayload): Promise<Buffer> {
  const fonts = payload.fonts ?? DEFAULT_FONTS;
  const perPage = payload.imagesPerPage ?? 4;
  const imgHeight = Math.round(rowImageHeight(perPage) * 0.85);

  const frame = imgHeight;
  const frameTwips = frame * 15;
  const gapTwips = Math.round((payload.imageGap ?? 16) * 15);
  const priceBold = payload.priceBold !== false;
  // Word shows faint non-printing gridlines wherever a cell edge has no border,
  // which reads as unwanted grey vertical lines. We instead paint every edge:
  // grey horizontals (the divider the user wants) and *white* verticals (which
  // are invisible on the page and suppress the gridlines).
  const grayBorder = { style: BorderStyle.SINGLE, size: 4, color: LINE } as const;
  const whiteBorder = { style: BorderStyle.SINGLE, size: 4, color: "FFFFFF" } as const;
  // The frame box drawn around each painting (same idea as the PDF).
  const frameBoxColor = normalizeColor(payload.frameBorderColor, "E4E4E4");
  const frameBorder = { style: BorderStyle.SINGLE, size: 4, color: frameBoxColor } as const;
  const boxBorders = {
    top: frameBorder,
    bottom: frameBorder,
    left: frameBorder,
    right: frameBorder,
    insideHorizontal: frameBorder,
    insideVertical: frameBorder
  };
  // Leave a margin inside the box so the picture never overlaps the border.
  const boxInsetPx = 12;

  function buildRow(row: PriceListRow): TableRow {
    const cells: TableCell[] = [];

    const decoded = decodeDataUrl(row.imageDataUrl);
    const { width, height } = fitInSquare(row, Math.max(20, frame - boxInsetPx * 2));
    const imageParagraph: Paragraph = decoded
      ? new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: decoded.buffer,
              type: decoded.type,
              transformation: { width, height }
            })
          ]
        })
      : new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "", size: 2 })]
        });

    // A one-cell nested table forms a clean box (frame) around the picture.
    // Because it is nested it doesn't add any vertical lines to the main table.
    const frameBox = new Table({
      width: { size: frameTwips, type: WidthType.DXA },
      borders: boxBorders,
      rows: [
        new TableRow({
          cantSplit: true,
          height: { value: frameTwips, rule: HeightRule.ATLEAST },
          children: [
            new TableCell({
              children: [imageParagraph],
              verticalAlign: VerticalAlign.CENTER,
              width: { size: frameTwips, type: WidthType.DXA },
              margins: {
                top: boxInsetPx * 15,
                bottom: boxInsetPx * 15,
                left: boxInsetPx * 15,
                right: boxInsetPx * 15
              }
            })
          ]
        })
      ]
    });

    // The outer image cell keeps only the horizontal row divider (grey top and
    // bottom); its verticals are white so no grey grid line appears.
    cells.push(
      new TableCell({
        children: [frameBox],
        verticalAlign: VerticalAlign.CENTER,
        width: { size: frameTwips + 240, type: WidthType.DXA },
        margins: { top: 140, bottom: 140, left: 40, right: 120 },
        borders: {
          top: grayBorder,
          left: whiteBorder,
          right: whiteBorder,
          bottom: grayBorder
        }
      })
    );

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
            new TextRun({
              text: row.price,
              bold: priceBold,
              size: 24,
              color: INK,
              font: fonts.body
            })
          ]
        })
      );
    }
    cells.push(
      new TableCell({
        children: detailParagraphs,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 120, bottom: 120, left: gapTwips, right: 80 },
        borders: {
          top: grayBorder,
          left: whiteBorder,
          right: whiteBorder,
          bottom: grayBorder
        }
      })
    );

    return new TableRow({
      children: cells,
      cantSplit: true,
      height: { value: frameTwips + boxInsetPx * 30 + 320, rule: HeightRule.ATLEAST }
    });
  }

  const tableBorders = {
    top: grayBorder,
    bottom: grayBorder,
    left: whiteBorder,
    right: whiteBorder,
    insideHorizontal: grayBorder,
    insideVertical: whiteBorder
  };

  // One table per page so a painting is never split across pages. Each page
  // (after the first) starts with a paragraph that forces a page break, which
  // Word honours far more reliably than a bare page-break run.
  const pages = chunk(payload.rows, perPage);
  const pageBlocks: (Table | Paragraph)[] = [];
  pages.forEach((pageRows, index) => {
    if (index > 0) {
      pageBlocks.push(
        new Paragraph({ pageBreakBefore: true, spacing: { after: 0 }, children: [] })
      );
    }
    pageBlocks.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorders,
        rows: pageRows.map(buildRow)
      })
    );
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
          text: payload.header || "Folleto de obras",
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
        children: [...headerChildren, ...pageBlocks]
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
  await makeGeneratedFileEditable(result.filePath);
  void shell.openPath(result.filePath);
  return result.filePath;
}
