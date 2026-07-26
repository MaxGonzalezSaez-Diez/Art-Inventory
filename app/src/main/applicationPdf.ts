import { BrowserWindow, dialog, shell, type SaveDialogOptions } from "electron";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Footer,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  VerticalAlign
} from "docx";
import {
  buildApplicationHtml,
  buildWorkTocEntries,
  richHtmlToPlainText,
  type ApplicationPdfPayload
} from "./applicationDocumentHtml";
import { makeGeneratedFileEditable } from "./makeFileEditable";

export type { ApplicationPdfPayload, ApplicationPdfRow, ApplicationPdfStyle, ApplicationPdfSection } from "./applicationDocumentHtml";
export { buildApplicationHtml } from "./applicationDocumentHtml";

export type ApplicationDocFormat = "pdf" | "docx";

function dataUrlToBuffer(dataUrl?: string): { type: "png" | "jpg"; data: Buffer } | null {
  if (!dataUrl) return null;
  const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const type = match[1].toLowerCase() === "png" ? "png" : "jpg";
  return { type, data: Buffer.from(match[2], "base64") };
}

function readImageSize(
  data: Buffer,
  type: "png" | "jpg"
): { width: number; height: number } | null {
  try {
    if (type === "png" && data.length >= 24) {
      return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    }
    if (type === "jpg") {
      let offset = 2;
      while (offset < data.length) {
        if (data[offset] !== 0xff) break;
        const marker = data[offset + 1];
        const length = data.readUInt16BE(offset + 2);
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          return {
            height: data.readUInt16BE(offset + 5),
            width: data.readUInt16BE(offset + 7)
          };
        }
        offset += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function fitInSquare(
  width: number,
  height: number,
  max: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: max, height: max };
  const scale = Math.min(max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function resolveSections(payload: ApplicationPdfPayload) {
  if (Array.isArray(payload.sections) && payload.sections.length > 0) {
    return payload.sections.filter((s) => s.heading?.trim() || s.bodyHtml?.trim());
  }
  const legacy = [];
  if (payload.textAboutWorks?.trim()) {
    legacy.push({
      heading: payload.headingAboutWorks?.trim() || "Sobre las obras",
      bodyHtml: payload.textAboutWorks
    });
  }
  if (payload.textAboutProject?.trim()) {
    legacy.push({
      heading: payload.headingAboutProject?.trim() || "Sobre el proyecto",
      bodyHtml: payload.textAboutProject
    });
  }
  return legacy;
}

function framedImage(
  img: { type: "png" | "jpg"; data: Buffer },
  title: string,
  index: number,
  frameBorderColor: string,
  frameBorderWidth: number,
  frameInset: number,
  showFrame: boolean
): Table {
  // ~95% of A4 content width (~6.2" usable → ~5.9" square).
  const outerPx = 440;
  const borderPx = showFrame ? Math.max(1, Math.min(5, frameBorderWidth)) : 0;
  const insetPx = Math.max(0, Math.min(40, frameInset));
  const innerMax = Math.max(40, outerPx - borderPx * 2 - insetPx * 2);
  const size = readImageSize(img.data, img.type) || { width: 1000, height: 1000 };
  const fitted = fitInSquare(size.width, size.height, innerMax);
  const cellTwip = outerPx * 15;
  const padTwip = insetPx * 15;
  const hex = frameBorderColor.replace("#", "").toUpperCase() || "D0C9BB";
  const border = showFrame
    ? {
        style: BorderStyle.SINGLE,
        // docx border size is in 1/8 pt
        size: Math.max(4, Math.min(40, Math.round(borderPx * 8))),
        color: hex,
        space: 0
      }
    : { style: BorderStyle.NONE, size: 0, color: "FFFFFF", space: 0 };
  return new Table({
    alignment: AlignmentType.CENTER,
    width: { size: cellTwip, type: WidthType.DXA },
    columnWidths: [cellTwip],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: {
              top: border,
              bottom: border,
              left: border,
              right: border
            },
            width: { size: cellTwip, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: {
              top: padTwip,
              bottom: padTwip,
              left: padTwip,
              right: padTwip
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    type: img.type,
                    data: img.data,
                    transformation: fitted,
                    altText: {
                      title,
                      description: title,
                      name: `work-${index}`
                    }
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

async function buildDocx(payload: ApplicationPdfPayload): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [];
  const emptyLabel = payload.emptyImageLabel?.trim() || "Sin imagen";
  const seriesPrefix = payload.seriesPrefix?.trim() || "Serie";
  const noSeriesLabel = payload.noSeriesLabel?.trim() || "sin serie";
  const sizeLabel = payload.sizeLabel?.trim() || "Tamaño";
  const yearLabel = payload.yearLabel?.trim() || "Año";
  const typeLabel = payload.typeLabel?.trim() || "Técnica";
  const worksHeading = payload.headingWorks?.trim() || "Obras";
  const tocLabel = payload.tocLabel?.trim() || "Índice";
  const sectionsLabel = payload.sectionsLabel?.trim() || "Textos";
  const documentSections = resolveSections(payload);
  const frameBorder = (payload.style?.frameBorderColor || "#d0c9bb").replace("#", "");
  const frameBorderWidth = Math.max(
    1,
    Math.min(5, Math.round(Number(payload.style?.frameBorderWidth ?? 3)))
  );
  const framePadding = Math.max(
    0,
    Math.min(40, Number(payload.style?.framePadding ?? 12))
  );
  const showFrame = payload.style?.showFrame !== false;

  // —— Cover (matches PDF: above, title, below+right, second, TOC) ——
  const coverStyles = payload.coverStyles ?? {};
  const bodyFont = payload.style?.fontBody || "Georgia";
  const titleFont = payload.style?.fontTitle || "Georgia";
  const titleColorHex = (payload.style?.titleColor || "#1a1a1a").replace("#", "");
  const metaColorHex = "7A7368";

  function coverRun(
    text: string,
    line: typeof coverStyles.title | undefined,
    defaults: {
      font: string;
      sizeHalfPoints: number;
      bold?: boolean;
      italic?: boolean;
      color: string;
      uppercase?: boolean;
    }
  ) {
    return new TextRun({
      text: defaults.uppercase ? text.toUpperCase() : text,
      font: line?.font?.trim() || defaults.font,
      size:
        line?.sizePt != null && Number.isFinite(line.sizePt)
          ? Math.round(line.sizePt * 2)
          : defaults.sizeHalfPoints,
      bold: line?.bold ?? defaults.bold ?? false,
      italics: line?.italic ?? defaults.italic ?? false,
      color: defaults.color
    });
  }

  if (payload.coverSubtitle?.trim()) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          coverRun(payload.coverSubtitle.trim(), coverStyles.above, {
            font: bodyFont,
            sizeHalfPoints: 20,
            bold: true,
            color: metaColorHex,
            uppercase: true
          })
        ]
      })
    );
  }
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        coverRun(payload.title || "Solicitud", coverStyles.title, {
          font: titleFont,
          sizeHalfPoints: 56,
          bold: payload.style?.titleBold !== false,
          italic: Boolean(payload.style?.titleItalic),
          color: titleColorHex
        })
      ]
    })
  );
  const belowText = payload.organization?.trim() || "";
  if (belowText) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          coverRun(belowText, coverStyles.below, {
            font: bodyFont,
            sizeHalfPoints: 23,
            color: metaColorHex
          })
        ]
      })
    );
  }
  if (payload.coverNote?.trim()) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          coverRun(payload.coverNote.trim(), coverStyles.second, {
            font: bodyFont,
            sizeHalfPoints: 21,
            color: metaColorHex
          })
        ]
      })
    );
  }
  children.push(
    new Paragraph({
      spacing: { before: 360, after: 140 },
      border: {
        top: { color: "D8D2C6", size: 6, space: 12, style: BorderStyle.SINGLE }
      },
      children: [
        new TextRun({
          text: tocLabel.toUpperCase(),
          size: 18,
          color: "7A7368",
          bold: true
        })
      ]
    })
  );

  let tocPage = 2;
  const sectionToc: Array<{ title: string; pageNum: number }> = [];
  documentSections.forEach((section) => {
    if (section.heading?.trim()) {
      sectionToc.push({ title: section.heading.trim(), pageNum: tocPage });
    }
    tocPage += 1;
  });
  const workStartPage = tocPage;
  const workPagesForToc = payload.rows.map((row, index) => ({
    title: row.title,
    series: row.series ?? "",
    pageNum: workStartPage + index
  }));
  const workTocEntries = buildWorkTocEntries(workPagesForToc, {
    mode: payload.tocWorksMode || "list",
    worksHeading,
    noSeriesLabel,
    singular: payload.workSingularLabel?.trim() || "cuadro",
    plural: payload.workPluralLabel?.trim() || "cuadros"
  });

  if (sectionToc.length > 0) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: sectionsLabel.toUpperCase(),
            size: 16,
            color: "9A9286",
            bold: true
          })
        ]
      })
    );
    for (const entry of sectionToc) {
      children.push(
        new Paragraph({
          spacing: { after: 50 },
          children: [
            new TextRun({ text: entry.title, size: 21, color: "7A7368" }),
            new TextRun({ text: `    ${entry.pageNum}`, size: 21, color: "9A9286" })
          ]
        })
      );
    }
  }
  if (workTocEntries.length > 0) {
    if (payload.tocWorksMode !== "worksOnly") {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({
              text: worksHeading.toUpperCase(),
              size: 16,
              color: "9A9286",
              bold: true
            })
          ]
        })
      );
    }
    for (const entry of workTocEntries) {
      children.push(
        new Paragraph({
          spacing: { after: 50 },
          children: [
            new TextRun({ text: entry.title, size: 21, color: "7A7368" }),
            new TextRun({ text: `    ${entry.pageNum}`, size: 21, color: "9A9286" })
          ]
        })
      );
    }
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // —— Text sections ——
  for (const section of documentSections) {
    if (section.heading?.trim()) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
          border: {
            bottom: {
              color: "E0D9CD",
              size: 6,
              space: 6,
              style: BorderStyle.SINGLE
            }
          },
          children: [
            new TextRun({
              text: section.heading.trim(),
              bold: payload.style?.sectionHeading?.bold ?? true,
              italics: Boolean(payload.style?.sectionHeading?.italic),
              size: Math.round(
                (payload.style?.sectionHeading?.sizePt != null &&
                Number.isFinite(payload.style.sectionHeading.sizePt)
                  ? payload.style.sectionHeading.sizePt
                  : 18) * 2
              ),
              font:
                payload.style?.sectionHeading?.font?.trim() ||
                payload.style?.fontTitle ||
                "Georgia"
            })
          ]
        })
      );
    }
    const plain = richHtmlToPlainText(section.bodyHtml || "");
    plain
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean)
      .forEach((block) => {
        children.push(
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: block,
                bold: payload.style?.sectionBody?.bold === true,
                italics: Boolean(payload.style?.sectionBody?.italic),
                size: Math.round(
                  (payload.style?.sectionBody?.sizePt != null &&
                  Number.isFinite(payload.style.sectionBody.sizePt)
                    ? payload.style.sectionBody.sizePt
                    : 12) * 2
                ),
                font:
                  payload.style?.sectionBody?.font?.trim() ||
                  payload.style?.fontBody ||
                  "Georgia"
              })
            ]
          })
        );
      });
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // —— Work pages (same order / labels as PDF) ——
  payload.rows.forEach((row, index) => {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: worksHeading.toUpperCase(),
            size: 16,
            color: "9A9286"
          })
        ]
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: row.title,
            bold: true,
            size: 32,
            font: payload.style?.fontTitle || "Georgia"
          })
        ]
      })
    );
    for (const line of [
      `${seriesPrefix}: ${row.series?.trim() || noSeriesLabel}`,
      `${typeLabel}: ${row.material?.trim() || "—"}`,
      `${sizeLabel}: ${row.size?.trim() || "—"}`,
      `${yearLabel}: ${row.year?.trim() || "—"}`
    ]) {
      children.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({
              text: line,
              size: 21,
              color: "7A7368",
              font: payload.style?.fontBody || "Georgia"
            })
          ]
        })
      );
    }
    const img = dataUrlToBuffer(row.imageDataUrl);
    if (img) {
      children.push(
        framedImage(
          img,
          row.title,
          index,
          `#${frameBorder}`,
          frameBorderWidth,
          framePadding,
          showFrame
        )
      );
    } else {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [new TextRun({ text: emptyLabel, italics: true, color: "9A9286" })]
        })
      );
    }
    if (index < payload.rows.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 850,
              right: 850
            }
          }
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: payload.headerArtistName?.trim()
                      ? `${payload.headerArtistName.trim()}  ·  `
                      : "",
                    size: 16,
                    color: "A39B8F"
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "A39B8F" }),
                  new TextRun({
                    text: payload.headerCompetition?.trim()
                      ? `  ·  ${payload.headerCompetition.trim()}`
                      : "",
                    size: 16,
                    color: "A39B8F"
                  })
                ]
              })
            ]
          })
        },
        children
      }
    ]
  });
  return Packer.toBuffer(doc);
}

export async function generateApplicationDocument(
  mainWindow: BrowserWindow | null,
  format: ApplicationDocFormat,
  payload: ApplicationPdfPayload
): Promise<string | null> {
  const ext = format === "docx" ? "docx" : "pdf";
  const options: SaveDialogOptions = {
    title: format === "docx" ? "Guardar solicitud en Word" : "Guardar solicitud en PDF",
    defaultPath: `${(payload.title || "solicitud").replace(/[\\/:*?"<>|]/g, "_")}.${ext}`,
    filters:
      format === "docx"
        ? [{ name: "Word", extensions: ["docx"] }]
        : [{ name: "PDF", extensions: ["pdf"] }]
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;

  if (format === "docx") {
    const buffer = await buildDocx(payload);
    await writeFile(result.filePath, buffer);
    await makeGeneratedFileEditable(result.filePath);
    void shell.openPath(result.filePath);
    return result.filePath;
  }

  const html = buildApplicationHtml(payload);
  const tempHtml = path.join(tmpdir(), `solicitud-${randomUUID()}.html`);
  await writeFile(tempHtml, html, "utf8");
  const win = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    webPreferences: { offscreen: true }
  });
  try {
    await win.loadFile(tempHtml);
    await win.webContents.executeJavaScript(`
      (async () => {
        await Promise.all(
          Array.from(document.images || []).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.addEventListener("load", resolve, { once: true });
                  img.addEventListener("error", resolve, { once: true });
                })
          )
        );
        // Only drop the preview zoom transform. The print stylesheet owns all
        // geometry; nothing here may resize frames, because this window is
        // wider than the printed page box.
        if (typeof window.__preparePrintLayout === "function") {
          window.__preparePrintLayout();
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      })();
    `);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: "none" },
      displayHeaderFooter: false
    });
    await writeFile(result.filePath, pdf);
    void shell.openPath(result.filePath);
    return result.filePath;
  } finally {
    win.destroy();
    void unlink(tempHtml).catch(() => undefined);
  }
}

/** @deprecated use generateApplicationDocument */
export async function generateApplicationPdf(
  mainWindow: BrowserWindow | null,
  payload: ApplicationPdfPayload
): Promise<string | null> {
  return generateApplicationDocument(mainWindow, "pdf", payload);
}
