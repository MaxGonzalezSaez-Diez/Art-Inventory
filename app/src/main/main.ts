import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import { readFile, copyFile } from "fs/promises";
import path from "path";
import { InventoryStore } from "./excel/inventoryStore";
import { ensureLibrary } from "./excel/workbook";
import {
  generatePriceList,
  type PriceListFormat,
  type PriceListPayload
} from "./pricelist";
import type {
  ArtworkInput,
  ContactInput,
  ExhibitionInput,
  LookupInput
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
      nodeIntegration: false
    }
  });

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
ipcMain.handle("lookup:save", async (_event, input: LookupInput) =>
  store().saveLookup(input)
);
ipcMain.handle("lookup:delete", async (_event, input: LookupInput) =>
  store().deleteLookup(input)
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
    targetType: "artwork" | "edition" | "exhibition",
    targetId: string,
    category: string
  ) => {
    const options: OpenDialogOptions = {
      title: "Choose Artwork Image",
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
