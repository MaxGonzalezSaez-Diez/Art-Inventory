import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type OpenDialogOptions
} from "electron";
import { readFile, copyFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import path from "path";
import ExcelJS from "exceljs";
import { InventoryStore } from "./excel/inventoryStore";
import { ensureLibrary } from "./excel/workbook";
import {
  generatePriceList,
  type PriceListFormat,
  type PriceListPayload
} from "./pricelist";
import {
  generateApplicationDocument,
  type ApplicationDocFormat,
  type ApplicationPdfPayload
} from "./applicationPdf";
import { exportImage, probeImage, type ImageExportOptions } from "./imageExport";
import type {
  AppSettings,
  ApplicationInput,
  ArtworkInput,
  ContactInput,
  ExhibitionInput,
  ExpenseInput,
  LookupInput,
  SeriesInfoInput,
  TextGeneratorExample
} from "./types/inventory";

let mainWindow: BrowserWindow | null = null;
let libraryPath = "";

function defaultLibraryPath(): string {
  return path.join(app.getPath("documents"), "MumArtLibrary");
}

function store(): InventoryStore {
  if (!libraryPath) libraryPath = defaultLibraryPath();
  return new InventoryStore(libraryPath);
}

// Must run before app ready so Chromium picks up speech features.
app.commandLine.appendSwitch(
  "enable-features",
  "WebSpeechRecognition,WebSpeechSynthesis"
);

async function createWindow(): Promise<void> {
  libraryPath = defaultLibraryPath();
  await ensureLibrary(libraryPath);

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 700,
    title: "Mum Art Inventory",
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
  await ensureLibrary(libraryPath || defaultLibraryPath());
  return libraryPath || defaultLibraryPath();
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
  return libraryPath;
});

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
  async (_event, format: PriceListFormat, payload: PriceListPayload) =>
    generatePriceList(mainWindow, format, payload)
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
ipcMain.handle("clipboard:writeText", async (_event, text: string) => {
  clipboard.writeText(String(text ?? ""));
  return true;
});
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
ipcMain.handle(
  "application:generatePdf",
  async (
    _event,
    format: ApplicationDocFormat | ApplicationPdfPayload,
    maybePayload?: ApplicationPdfPayload
  ) => {
    // Accept either (format, payload) or legacy (payload) only.
    if (typeof format === "string") {
      return generateApplicationDocument(mainWindow, format, maybePayload!);
    }
    return generateApplicationDocument(mainWindow, "pdf", format);
  }
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
    const options = {
      title: "Guardar hoja de cálculo",
      defaultPath: payload.filename || "precios.xlsx",
      filters: [{ name: "Excel", extensions: ["xlsx"] }]
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;

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
    await workbook.xlsx.writeFile(result.filePath);
    void shell.openPath(result.filePath);
    return result.filePath;
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
    const options = {
      title: "Guardar resumen de cuentas",
      defaultPath: payload.filename || "cuentas.xlsx",
      filters: [{ name: "Excel", extensions: ["xlsx"] }]
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;

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

    await workbook.xlsx.writeFile(result.filePath);
    void shell.openPath(result.filePath);
    return result.filePath;
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
  async (_event, options: ImageExportOptions) => exportImage(mainWindow, options)
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
    targetType: "artwork" | "edition" | "exhibition",
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
  const tempPath = path.join(tmpdir(), `mum-edit-${randomUUID()}${ext}`);
  await writeFile(tempPath, Buffer.from(match[2], "base64"));
  return tempPath;
});

// Import any document type (images, PDF, Word, etc.) as an attachment.
ipcMain.handle(
  "document:import",
  async (
    _event,
    targetType: "artwork" | "edition" | "exhibition",
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
            "heic"
          ]
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
    const options = {
      title: "Guardar copia de la imagen",
      defaultPath: `${base}${ext}`
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    await copyFile(filePath, result.filePath);
    return result.filePath;
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
