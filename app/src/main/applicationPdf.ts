import { BrowserWindow, dialog, shell, type SaveDialogOptions } from "electron";
import { writeFile, unlink } from "fs/promises";
import { execFile } from "child_process";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  TextRun
} from "docx";
import {
  buildApplicationHtml,
  buildWorkTocEntries,
  richHtmlToPlainText,
  type ApplicationPdfPayload
} from "./applicationDocumentHtml";

export type { ApplicationPdfPayload, ApplicationPdfRow, ApplicationPdfStyle, ApplicationPdfSection } from "./applicationDocumentHtml";
export { buildApplicationHtml } from "./applicationDocumentHtml";

export type ApplicationDocFormat = "pdf" | "docx";

function clearQuarantine(filePath: string): Promise<void> {
  if (process.platform !== "darwin") return Promise.resolve();
  return new Promise((resolve) => {
    execFile("xattr", ["-d", "com.apple.quarantine", filePath], () => resolve());
  });
}

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

async function buildDocx(payload: ApplicationPdfPayload): Promise<Buffer> {
  const children: Paragraph[] = [];
  const emptyLabel = payload.emptyImageLabel?.trim() || "Sin imagen";
  const seriesPrefix = payload.seriesPrefix?.trim() || "Serie";
  const noSeriesLabel = payload.noSeriesLabel?.trim() || "sin serie";
  const sizeLabel = payload.sizeLabel?.trim() || "Tamaño";
  const yearLabel = payload.yearLabel?.trim() || "Año";
  const typeLabel = payload.typeLabel?.trim() || "Técnica";
  const worksHeading = payload.headingWorks?.trim() || "Obras";
  const tocLabel = payload.tocLabel?.trim() || "Índice";
  const documentSections = resolveSections(payload);

  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: payload.title || "Solicitud", bold: true, size: 48 })
      ]
    })
  );
  for (const line of [
    payload.coverSubtitle,
    payload.organization,
    payload.coverDate,
    payload.coverNote
  ]) {
    if (!line?.trim()) continue;
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: line.trim(), size: 24, color: "7A7368" })]
      })
    );
  }
  children.push(
    new Paragraph({
      spacing: { before: 300, after: 140 },
      children: [new TextRun({ text: tocLabel.toUpperCase(), size: 20, color: "7A7368" })]
    })
  );
  let tocPage = 2;
  documentSections.forEach((section) => {
    if (section.heading?.trim()) {
      children.push(
        new Paragraph({
          spacing: { after: 50 },
          children: [
            new TextRun({ text: section.heading.trim(), size: 21, color: "7A7368" }),
            new TextRun({ text: `    ${tocPage}`, size: 21, color: "9A9286" })
          ]
        })
      );
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
  if (payload.tocWorksMode !== "worksOnly" && workTocEntries.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [
          new TextRun({
            text: worksHeading.toUpperCase(),
            size: 18,
            color: "9A9286"
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
  children.push(new Paragraph({ children: [new PageBreak()] }));

  for (const section of documentSections) {
    if (section.heading?.trim()) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
          children: [new TextRun({ text: section.heading.trim(), bold: true, size: 32 })]
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
            children: [new TextRun({ text: block, size: 24 })]
          })
        );
      });
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  payload.rows.forEach((row, index) => {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: worksHeading.toUpperCase(),
            size: 18,
            color: "9A9286"
          })
        ]
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: row.title, bold: true, size: 36 })]
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: `${seriesPrefix}: ${row.series?.trim() || noSeriesLabel}`,
            size: 22,
            color: "7A7368"
          })
        ]
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: `${typeLabel}: ${row.material?.trim() || "—"}`,
            size: 22,
            color: "7A7368"
          })
        ]
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: `${sizeLabel}: ${row.size?.trim() || "—"}`,
            size: 22,
            color: "7A7368"
          })
        ]
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: `${yearLabel}: ${row.year?.trim() || "—"}`,
            size: 22,
            color: "7A7368"
          })
        ]
      })
    );
    const img = dataUrlToBuffer(row.imageDataUrl);
    if (img) {
      const size = readImageSize(img.data, img.type) || { width: 1000, height: 1000 };
      const fitted = fitInSquare(size.width, size.height, 520);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80 },
          children: [
            new ImageRun({
              type: img.type,
              data: img.data,
              transformation: fitted,
              altText: {
                title: row.title,
                description: row.title,
                name: `work-${index}`
              }
            })
          ]
        })
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
    sections: [{ children }]
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
    await clearQuarantine(result.filePath);
    void shell.openPath(result.filePath);
    return result.filePath;
  }

  const html = buildApplicationHtml(payload);
  const tempHtml = path.join(tmpdir(), `solicitud-${randomUUID()}.html`);
  await writeFile(tempHtml, html, "utf8");
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true }
  });
  try {
    await win.loadFile(tempHtml);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { marginType: "none" }
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
