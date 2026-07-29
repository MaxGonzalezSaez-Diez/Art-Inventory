import { BrowserWindow, shell } from "electron";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import {
  buildApplicationHtml,
  type ApplicationPdfPayload
} from "./applicationDocumentHtml";
import { chooseGeneratedSavePath } from "./exportPath";

export type {
  ApplicationPdfPayload,
  ApplicationPdfRow,
  ApplicationPdfStyle,
  ApplicationPdfSection
} from "./applicationDocumentHtml";
export { buildApplicationHtml } from "./applicationDocumentHtml";

export async function generateApplicationDocument(
  mainWindow: BrowserWindow | null,
  payload: ApplicationPdfPayload,
  libraryPath = ""
): Promise<string | null> {
  const filePath = await chooseGeneratedSavePath(
    mainWindow,
    libraryPath,
    `${(payload.title || "solicitud").replace(/[\\/:*?"<>|]/g, "_")}.pdf`,
    {
      title: "Guardar solicitud en PDF",
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    }
  );
  if (!filePath) return null;

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
    await writeFile(filePath, pdf);
    void shell.openPath(filePath);
    return filePath;
  } finally {
    win.destroy();
    void unlink(tempHtml).catch(() => undefined);
  }
}

/** @deprecated use generateApplicationDocument */
export async function generateApplicationPdf(
  mainWindow: BrowserWindow | null,
  payload: ApplicationPdfPayload,
  libraryPath = ""
): Promise<string | null> {
  return generateApplicationDocument(mainWindow, payload, libraryPath);
}
