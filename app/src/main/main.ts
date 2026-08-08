import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  shell,
  type OpenDialogOptions
} from "electron";
import { readFile, copyFile, mkdir, rm, writeFile } from "fs/promises";
import { copyFileSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import path from "path";
import ExcelJS from "exceljs";
import { InventoryStore } from "./excel/inventoryStore";
import { ensureLibrary } from "./excel/workbook";
import { chooseGeneratedSavePath } from "./exportPath";
import {
  generatePriceList,
  type PriceListPayload
} from "./pricelist";
import {
  generateCertificateOfAuthenticity,
  type CertificatePayload
} from "./certificateOfAuthenticity";
import {
  generateApplicationDocument,
  type ApplicationPdfPayload
} from "./applicationPdf";
import {
  exportImage,
  exportImagesBulk,
  probeImage,
  type BulkImageExportOptions,
  type ImageExportOptions
} from "./imageExport";
import {
  libraryFolderFor,
  libraryLocationChoices,
  readPreferences,
  writePreferences,
  type AppLanguage
} from "./preferences";
import type {
  AppSettings,
  ApplicationInput,
  ArtworkInput,
  ContactInput,
  ContactReminder,
  ExhibitionInput,
  ExpenseInput,
  InboxNote,
  InboxTodo,
  LookupInput,
  PriceListDocInput,
  SeriesInfoInput,
  TextGeneratorExample
} from "./types/inventory";

let mainWindow: BrowserWindow | null = null;
let libraryPath = "";

function store(): InventoryStore {
  return new InventoryStore(libraryPath);
}

async function createWindow(): Promise<void> {
  const prefs = await readPreferences();
  libraryPath = prefs.libraryPath;
  // Before setup finishes the folder is only a suggestion, so nothing is written
  // to disk until the user confirms where the library should live.
  if (prefs.setupComplete) await ensureLibrary(libraryPath);

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 700,
    title: "Inventario de Arte",
    backgroundColor: "#f7f3ee",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === "media");
    }
  );
  mainWindow.webContents.session.setPermissionCheckHandler(
    (_webContents, permission) => permission === "media"
  );

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

ipcMain.handle("library:getPath", async () => {
  await ensureLibrary(libraryPath);
  return libraryPath;
});

ipcMain.handle("library:choose", async () => {
  const options: OpenDialogOptions = {
    title: "Choose Art Library Folder",
    properties: ["openDirectory", "createDirectory"]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || !result.filePaths[0]) return libraryPath;
  libraryPath = result.filePaths[0];
  await ensureLibrary(libraryPath);
  await writePreferences({ libraryPath });
  return libraryPath;
});

ipcMain.handle("prefs:get", async () => ({
  ...(await readPreferences()),
  choices: libraryLocationChoices()
}));

ipcMain.handle("prefs:setLanguage", async (_event, language: AppLanguage) =>
  writePreferences({ language })
);

/** Lets the setup screen offer a folder other than Documents or Desktop. */
ipcMain.handle("prefs:pickLibraryParent", async () => {
  const options: OpenDialogOptions = {
    title: "Where should the library live?",
    properties: ["openDirectory", "createDirectory"]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  return libraryFolderFor(result.filePaths[0]);
});

ipcMain.handle(
  "prefs:completeSetup",
  async (_event, payload: { language: AppLanguage; libraryPath: string }) => {
    const chosen = String(payload?.libraryPath ?? "").trim();
    if (!chosen) throw new Error("No folder was chosen for the library.");
    await ensureLibrary(chosen);
    libraryPath = chosen;
    return writePreferences({
      language: payload?.language,
      libraryPath: chosen,
      setupComplete: true
    });
  }
);

ipcMain.handle("inventory:load", async () => store().load());
ipcMain.handle("artwork:save", async (_event, input: ArtworkInput) =>
  store().saveArtwork(input)
);
ipcMain.handle("artwork:delete", async (_event, artworkId: string) =>
  store().deleteArtwork(artworkId)
);
ipcMain.handle("contact:save", async (_event, input: ContactInput) =>
  store().saveContact(input)
);
ipcMain.handle("contact:delete", async (_event, contactId: string) =>
  store().deleteContact(contactId)
);
ipcMain.handle(
  "exhibition:save",
  async (
    _event,
    input: ExhibitionInput,
    artworkIds: string[],
    listedPrices?: Record<string, string>
  ) => store().saveExhibition(input, artworkIds, listedPrices ?? {})
);
ipcMain.handle(
  "pricelist:generate",
  async (_event, payload: PriceListPayload) =>
    generatePriceList(mainWindow, payload, libraryPath)
);
ipcMain.handle(
  "certificate:generate",
  async (_event, payload: CertificatePayload) =>
    generateCertificateOfAuthenticity(mainWindow, payload, libraryPath)
);
ipcMain.handle("exhibition:delete", async (_event, exhibitionId: string) =>
  store().deleteExhibition(exhibitionId)
);
ipcMain.handle("settings:save", async (_event, settings: AppSettings) =>
  store().saveSettings(settings)
);
ipcMain.handle(
  "textGenerator:saveExamples",
  async (_event, examples: TextGeneratorExample[]) =>
    store().saveTextGeneratorExamples(examples)
);
ipcMain.handle(
  "inbox:saveReminders",
  async (_event, reminders: ContactReminder[]) =>
    store().saveContactReminders(reminders)
);
ipcMain.handle("inbox:saveNotes", async (_event, notes: InboxNote[]) =>
  store().saveInboxNotes(notes)
);
ipcMain.handle("inbox:saveTodos", async (_event, todos: InboxTodo[]) =>
  store().saveInboxTodos(todos)
);
ipcMain.handle("clipboard:writeText", async (_event, text: string) => {
  clipboard.writeText(String(text ?? ""));
  return true;
});

/** Folder holding the last batch of photos handed to the clipboard. */
let clipboardPhotoDir = "";

/** 1x1 transparent PNG, only used if a photo cannot be read as a drag icon. */
const DRAG_FALLBACK_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function safeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function filenamesPlist(paths: string[]): string {
  const items = paths
    .map(
      (item) =>
        `<string>${item
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</string>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><array>${items}</array></plist>`;
}

/**
 * Puts the photos on the clipboard as real files, the same shape Finder uses,
 * so pasting into ChatGPT attaches them. A pasteboard holds one kind of
 * content at a time, so this always replaces any copied text.
 */
async function writeImageFilesToClipboard(
  files: Array<{ name?: string; sourcePath?: string }>
): Promise<{ count: number }> {
  const dir = path.join(tmpdir(), "obras-portapapeles", randomUUID());
  await mkdir(dir, { recursive: true });
  const copied: string[] = [];
  for (const [index, file] of files.entries()) {
    const source = String(file?.sourcePath ?? "");
    if (!source) continue;
    const position = String(index + 1).padStart(2, "0");
    const label = safeFileName(String(file?.name ?? "")) || `obra ${position}`;
    const target = path.join(
      dir,
      `${position} ${label}${path.extname(source) || ".jpg"}`
    );
    try {
      await copyFile(source, target);
      copied.push(target);
    } catch {
      /* skip unreadable photo */
    }
  }
  if (copied.length === 0) {
    await rm(dir, { recursive: true, force: true });
    return { count: 0 };
  }

  if (process.platform === "darwin") {
    clipboard.writeBuffer(
      "NSFilenamesPboardType",
      Buffer.from(filenamesPlist(copied), "utf8")
    );
  } else {
    const image = nativeImage.createFromPath(copied[0]);
    if (image.isEmpty()) return { count: 0 };
    clipboard.writeImage(image);
  }

  const previous = clipboardPhotoDir;
  clipboardPhotoDir = dir;
  if (previous) await rm(previous, { recursive: true, force: true });
  return { count: process.platform === "darwin" ? copied.length : 1 };
}

ipcMain.handle(
  "clipboard:writeImageFiles",
  async (_event, files: Array<{ name?: string; sourcePath?: string }>) =>
    writeImageFilesToClipboard(Array.isArray(files) ? files : [])
);

/**
 * ChatGPT attaches only the first pasted photo, but it takes every dropped one,
 * so the photos can also be dragged straight out of the window.
 */
ipcMain.on(
  "photos:startDrag",
  (event, files: Array<{ name?: string; sourcePath?: string }>) => {
    const staged = stagePhotosSync(Array.isArray(files) ? files : []);
    if (staged.length === 0) return;
    let icon = nativeImage.createFromPath(staged[0]);
    icon = icon.isEmpty()
      ? nativeImage.createFromDataURL(DRAG_FALLBACK_ICON)
      : icon.resize({ width: 128 });
    event.sender.startDrag({ file: staged[0], files: staged, icon });
  }
);

/**
 * Same folder trick as the clipboard copy, but synchronous: a drag has to start
 * within the gesture or macOS drops it.
 */
function stagePhotosSync(
  files: Array<{ name?: string; sourcePath?: string }>
): string[] {
  const dir = path.join(tmpdir(), "obras-portapapeles", randomUUID());
  mkdirSync(dir, { recursive: true });
  const staged: string[] = [];
  for (const [index, file] of files.entries()) {
    const source = String(file?.sourcePath ?? "");
    if (!source) continue;
    const position = String(index + 1).padStart(2, "0");
    const label = safeFileName(String(file?.name ?? "")) || `obra ${position}`;
    const target = path.join(
      dir,
      `${position} ${label}${path.extname(source) || ".jpg"}`
    );
    try {
      copyFileSync(source, target);
      staged.push(target);
    } catch {
      /* skip unreadable photo */
    }
  }
  if (staged.length === 0) rmSync(dir, { recursive: true, force: true });
  return staged;
}

/**
 * All the photos in one folder, opened in the Finder, for when dragging from
 * the window is awkward.
 */
ipcMain.handle(
  "photos:openFolder",
  async (_event, files: Array<{ name?: string; sourcePath?: string }>) => {
    const list = Array.isArray(files) ? files : [];
    const dir = path.join(app.getPath("downloads"), "Fotos para el chat");
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    let count = 0;
    for (const [index, file] of list.entries()) {
      const source = String(file?.sourcePath ?? "");
      if (!source) continue;
      const position = String(index + 1).padStart(2, "0");
      const label = safeFileName(String(file?.name ?? "")) || `obra ${position}`;
      try {
        await copyFile(
          source,
          path.join(dir, `${position} ${label}${path.extname(source) || ".jpg"}`)
        );
        count += 1;
      } catch {
        /* skip unreadable photo */
      }
    }
    if (count > 0) await shell.openPath(dir);
    return { count, folder: dir };
  }
);
ipcMain.handle("expense:save", async (_event, input: ExpenseInput) =>
  store().saveExpense(input)
);
ipcMain.handle("expense:delete", async (_event, expenseId: string) =>
  store().deleteExpense(expenseId)
);
ipcMain.handle("series:save", async (_event, input: SeriesInfoInput) =>
  store().saveSeriesInfo(input)
);
ipcMain.handle("series:delete", async (_event, seriesId: string) =>
  store().deleteSeriesInfo(seriesId)
);
ipcMain.handle("application:save", async (_event, input: ApplicationInput) =>
  store().saveApplication(input)
);
ipcMain.handle("application:delete", async (_event, applicationId: string) =>
  store().deleteApplication(applicationId)
);
ipcMain.handle("pricelist:save", async (_event, input: PriceListDocInput) =>
  store().savePriceList(input)
);
ipcMain.handle("pricelist:delete", async (_event, priceListId: string) =>
  store().deletePriceList(priceListId)
);
ipcMain.handle(
  "application:generatePdf",
  async (_event, payload: ApplicationPdfPayload) =>
    generateApplicationDocument(mainWindow, payload, libraryPath)
);
ipcMain.handle(
  "pricing:exportSheet",
  async (
    _event,
    payload: {
      filename: string;
      sheetName: string;
      headers: string[];
      rows: Array<Array<string | number>>;
    }
  ): Promise<string | null> => {
    const filePath = await chooseGeneratedSavePath(
      mainWindow,
      libraryPath,
      payload.filename || "precios.xlsx",
      {
        title: "Guardar hoja de cálculo",
        filters: [{ name: "Excel", extensions: ["xlsx"] }]
      }
    );
    if (!filePath) return null;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(payload.sheetName || "Precios");
    sheet.addRow(payload.headers);
    sheet.getRow(1).font = { bold: true };
    payload.rows.forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((column) => {
      let max = 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = cell.value == null ? 0 : String(cell.value).length;
        if (len > max) max = len;
      });
      column.width = Math.min(max + 2, 40);
    });
    await workbook.xlsx.writeFile(filePath);
    void shell.openPath(filePath);
    return filePath;
  }
);
ipcMain.handle(
  "financials:exportSheet",
  async (
    _event,
    payload: {
      filename: string;
      fromDate?: string;
      toDate?: string;
      exhibitionTitle?: string;
      expenseRows: Array<{
        category: string;
        date: string;
        amount: number;
        note: string;
        where: string;
      }>;
      incomeRows: Array<{
        date: string;
        amount: number;
        how: string;
        artwork: string;
        series: string;
        where: string;
        salePrice: number | null;
        taxCharged?: boolean;
      }>;
      totals: { spent: number; earned: number; net: number };
    }
  ): Promise<string | null> => {
    const filePath = await chooseGeneratedSavePath(
      mainWindow,
      libraryPath,
      payload.filename || "cuentas.xlsx",
      {
        title: "Guardar resumen de cuentas",
        filters: [{ name: "Excel", extensions: ["xlsx"] }]
      }
    );
    if (!filePath) return null;

    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet("Resumen");
    summary.addRow(["Resumen de cuentas"]);
    summary.getRow(1).font = { bold: true, size: 16, color: { argb: "FF2A2620" } };
    summary.addRow([]);
    if (payload.fromDate || payload.toDate) {
      summary.addRow([
        "Periodo",
        `${payload.fromDate || "…"} → ${payload.toDate || "…"}`
      ]);
    }
    if (payload.exhibitionTitle) {
      summary.addRow(["Exposición", payload.exhibitionTitle]);
    }
    summary.addRow([]);
    const spentRow = summary.addRow(["Total gastado (€)", payload.totals.spent]);
    spentRow.getCell(1).font = { bold: true };
    spentRow.getCell(2).font = { bold: true, color: { argb: "FFB33A3A" } };
    spentRow.getCell(2).numFmt = "#,##0.00";
    const earnedRow = summary.addRow(["Total recibido (€)", payload.totals.earned]);
    earnedRow.getCell(1).font = { bold: true };
    earnedRow.getCell(2).font = { bold: true, color: { argb: "FF2F7A4A" } };
    earnedRow.getCell(2).numFmt = "#,##0.00";
    const netRow = summary.addRow(["Balance (€)", payload.totals.net]);
    netRow.getCell(1).font = { bold: true, size: 13 };
    netRow.getCell(2).font = {
      bold: true,
      size: 13,
      color: { argb: payload.totals.net >= 0 ? "FF2F7A4A" : "FFB33A3A" }
    };
    netRow.getCell(2).numFmt = "#,##0.00";
    summary.getColumn(1).width = 22;
    summary.getColumn(2).width = 28;

    const expenses = workbook.addWorksheet("Gastos");
    expenses.addRow(["Categoría", "Fecha", "Importe (€)", "Nota", "Dónde / con quién"]);
    expenses.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    expenses.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFB33A3A" }
    };
    payload.expenseRows.forEach((row) => {
      const added = expenses.addRow([
        row.category,
        row.date,
        row.amount,
        row.note,
        row.where
      ]);
      added.getCell(3).numFmt = "#,##0.00";
      added.getCell(3).font = { color: { argb: "FFB33A3A" } };
    });
    expenses.columns.forEach((column, index) => {
      column.width = [18, 14, 14, 40, 28][index] ?? 16;
    });

    const income = workbook.addWorksheet("Ingresos");
    income.addRow([
      "Fecha",
      "Recibido (€)",
      "Cómo",
      "Obra",
      "Serie",
      "Dónde / a quién",
      "Precio de venta (€)",
      "Impuesto"
    ]);
    income.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    income.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2F7A4A" }
    };
    payload.incomeRows.forEach((row) => {
      const added = income.addRow([
        row.date,
        row.amount,
        row.how,
        row.artwork,
        row.series,
        row.where,
        row.salePrice ?? "",
        row.taxCharged === false ? "No" : "Sí"
      ]);
      added.getCell(2).numFmt = "#,##0.00";
      added.getCell(2).font = { color: { argb: "FF2F7A4A" } };
      if (row.salePrice != null) added.getCell(7).numFmt = "#,##0.00";
    });
    income.columns.forEach((column, index) => {
      column.width = [14, 14, 22, 28, 18, 24, 16, 12][index] ?? 14;
    });

    await workbook.xlsx.writeFile(filePath);
    void shell.openPath(filePath);
    return filePath;
  }
);
ipcMain.handle("lookup:save", async (_event, input: LookupInput) =>
  store().saveLookup(input)
);
ipcMain.handle("lookup:delete", async (_event, input: LookupInput) =>
  store().deleteLookup(input)
);
ipcMain.handle(
  "lookup:reassign",
  async (
    _event,
    input: {
      category: string;
      fromValue: string;
      assignments: Array<{ id: string; value: string }>;
    }
  ) => store().reassignLookup(input)
);
ipcMain.handle(
  "exhibition:addSale",
  async (
    _event,
    exhibitionId: string,
    artworkId: string,
    price?: string,
    contactId?: string,
    date?: string
  ) =>
    store().addExhibitionSale(
      exhibitionId,
      artworkId,
      price ?? "",
      contactId ?? "",
      date ?? ""
    )
);
ipcMain.handle("image:delete", async (_event, imageId: string) =>
  store().deleteImage(imageId)
);
ipcMain.handle("movement:markReturned", async (_event, movementId: string) =>
  store().markMovementReturned(movementId)
);
ipcMain.handle(
  "image:import",
  async (
    _event,
    targetType:
      | "artwork"
      | "edition"
      | "exhibition"
      | "expense"
      | "series"
      | "application",
    targetId: string,
    category: string
  ) => {
    const options: OpenDialogOptions = {
      title:
        targetType === "expense"
          ? "Elegir ticket o factura"
          : targetType === "application"
            ? "Elegir imagen de portada"
            : "Elegir imagen",
      properties: ["openFile"],
      filters: [
        {
          name: "Images",
          extensions: ["jpg", "jpeg", "png", "webp", "gif", "tiff"]
        }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths[0]) return null;
    return store().importImage(result.filePaths[0], targetType, targetId, category);
  }
);

ipcMain.handle(
  "image:export",
  async (_event, options: ImageExportOptions) =>
    exportImage(mainWindow, options, libraryPath)
);

ipcMain.handle(
  "image:exportBulk",
  async (_event, options: BulkImageExportOptions) =>
    exportImagesBulk(mainWindow, options, libraryPath)
);

ipcMain.handle("image:probe", async (_event, sourcePath: string) =>
  probeImage(sourcePath)
);

// Pick an image file without importing it yet (used while the artwork has no
// id). Returns the path plus a data URL for an instant preview.
ipcMain.handle("image:pickPath", async () => {
  const options: OpenDialogOptions = {
    title: "Elegir foto",
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif", "tiff"] }
    ]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const buffer = await readFile(filePath);
  return {
    path: filePath,
    dataUrl: `data:${mimeType(filePath)};base64,${buffer.toString("base64")}`
  };
});

ipcMain.handle(
  "image:importPath",
  async (
    _event,
    sourcePath: string,
    targetType:
      | "artwork"
      | "edition"
      | "exhibition"
      | "expense"
      | "series"
      | "application",
    targetId: string,
    category: string
  ) => store().importImage(sourcePath, targetType, targetId, category)
);

ipcMain.handle(
  "image:importDataUrl",
  async (
    _event,
    dataUrl: string,
    targetType:
      | "artwork"
      | "edition"
      | "exhibition"
      | "expense"
      | "series"
      | "application",
    targetId: string,
    category: string,
    originalName?: string
  ) =>
    store().importImageFromDataUrl(
      dataUrl,
      targetType,
      targetId,
      category,
      originalName
    )
);

/** Write an edited image data-URL to a temp file (fallback for import). */
ipcMain.handle("image:dataUrlToTemp", async (_event, dataUrl: string) => {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(
    String(dataUrl || "").trim()
  );
  if (!match) throw new Error("La imagen editada no es válida.");
  const mime = match[1].toLowerCase();
  const ext = mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : ".jpg";
  const tempPath = path.join(tmpdir(), `art-edit-${randomUUID()}${ext}`);
  await writeFile(tempPath, Buffer.from(match[2], "base64"));
  return tempPath;
});

// Import any document type (images, PDF, Word, etc.) as an attachment.
ipcMain.handle(
  "document:import",
  async (
    _event,
    targetType: "artwork" | "edition" | "exhibition" | "series",
    targetId: string
  ) => {
    const options: OpenDialogOptions = {
      title: "Elegir documento",
      properties: ["openFile"],
      filters: [
        {
          name: "Documentos",
          extensions: [
            "pdf",
            "doc",
            "docx",
            "odt",
            "rtf",
            "txt",
            "xls",
            "xlsx",
            "ppt",
            "pptx",
            "jpg",
            "jpeg",
            "png",
            "webp",
            "gif",
            "tiff",
            "heic",
            "mov",
            "mp4",
            "m4v",
            "avi",
            "mkv",
            "webm"
          ]
        },
        {
          name: "Videos",
          extensions: ["mov", "mp4", "m4v", "avi", "mkv", "webm"]
        },
        { name: "Todos los archivos", extensions: ["*"] }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    return store().importImage(result.filePaths[0], targetType, targetId, "document");
  }
);

ipcMain.handle(
  "document:setCaption",
  async (_event, imageId: string, caption: string) =>
    store().updateImageCaption(imageId, caption)
);

ipcMain.handle("document:open", async (_event, filePath: string) => {
  const error = await shell.openPath(filePath);
  if (error) throw new Error(error);
  return true;
});

ipcMain.handle("image:toDataUrl", async (_event, filePath: string) => {
  const buffer = await readFile(filePath);
  return `data:${mimeType(filePath)};base64,${buffer.toString("base64")}`;
});

ipcMain.handle(
  "image:saveCopy",
  async (_event, filePath: string, suggestedName?: string) => {
    const ext = path.extname(filePath) || ".jpg";
    const base = (suggestedName || path.basename(filePath, path.extname(filePath)) || "imagen")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "imagen";
    const destination = await chooseGeneratedSavePath(
      mainWindow,
      libraryPath,
      `${base}${ext}`,
      { title: "Guardar copia de la imagen" }
    );
    if (!destination) return null;
    await copyFile(filePath, destination);
    return destination;
  }
);

ipcMain.handle("image:pickDataUrl", async () => {
  const options: OpenDialogOptions = {
    title: "Elegir imagen para la lista",
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif", "tiff"] }
    ]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const buffer = await readFile(filePath);
  return `data:${mimeType(filePath)};base64,${buffer.toString("base64")}`;
});

function mimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".tif" || extension === ".tiff") return "image/tiff";
  return "image/jpeg";
}
