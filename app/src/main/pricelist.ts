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
import { buildPriceListHtml, type PriceListPayload } from "./pricelistHtml";

export type {
  PriceListFonts,
  PriceListPayload,
  PriceListRow,
  PriceListStyle
} from "./pricelistHtml";

async function renderPdf(payload: PriceListPayload): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true }
  });
  const tempFile = path.join(tmpdir(), `pricelist-${randomUUID()}.html`);
  try {
    await writeFile(tempFile, buildPriceListHtml(payload), "utf8");
    await win.loadFile(tempFile);
    // Wait for the in-page pagination (same code the preview runs).
    await win.webContents.executeJavaScript(
      "Promise.resolve(window.__pricelistReady).then(() => true)"
    );
    // Page size and margins come from the document's @page rule (A4).
    const data = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: "none" },
      displayHeaderFooter: false
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
