import { contextBridge, ipcRenderer } from "electron";
import type {
  PriceListFormat,
  PriceListPayload
} from "./pricelist";
import type { ImageExportOptions, ImageExportResult } from "./imageExport";
import type {
  AppSettings,
  ApplicationInput,
  ArtworkInput,
  ContactInput,
  ExhibitionInput,
  ExpenseInput,
  InventoryData,
  LookupInput,
  SeriesInfoInput,
  TextGeneratorExample
} from "./types/inventory";
import type { ApplicationDocFormat, ApplicationPdfPayload } from "./applicationPdf";

const api = {
  getLibraryPath: (): Promise<string> => ipcRenderer.invoke("library:getPath"),
  chooseLibrary: (): Promise<string> => ipcRenderer.invoke("library:choose"),
  loadInventory: (): Promise<InventoryData> => ipcRenderer.invoke("inventory:load"),
  saveArtwork: (input: ArtworkInput): Promise<InventoryData> =>
    ipcRenderer.invoke("artwork:save", input),
  deleteArtwork: (artworkId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("artwork:delete", artworkId),
  saveContact: (input: ContactInput): Promise<InventoryData> =>
    ipcRenderer.invoke("contact:save", input),
  deleteContact: (contactId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("contact:delete", contactId),
  saveExhibition: (
    input: ExhibitionInput,
    artworkIds: string[],
    listedPrices?: Record<string, string>
  ): Promise<InventoryData> =>
    ipcRenderer.invoke("exhibition:save", input, artworkIds, listedPrices ?? {}),
  generatePriceList: (
    format: PriceListFormat,
    payload: PriceListPayload
  ): Promise<string | null> =>
    ipcRenderer.invoke("pricelist:generate", format, payload),
  deleteExhibition: (exhibitionId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("exhibition:delete", exhibitionId),
  addExhibitionSale: (
    exhibitionId: string,
    artworkId: string,
    price?: string,
    contactId?: string,
    date?: string
  ): Promise<InventoryData> =>
    ipcRenderer.invoke(
      "exhibition:addSale",
      exhibitionId,
      artworkId,
      price ?? "",
      contactId ?? "",
      date ?? ""
    ),
  saveSettings: (settings: AppSettings): Promise<InventoryData> =>
    ipcRenderer.invoke("settings:save", settings),
  saveTextGeneratorExamples: (
    examples: TextGeneratorExample[]
  ): Promise<InventoryData> =>
    ipcRenderer.invoke("textGenerator:saveExamples", examples),
  writeClipboardText: (text: string): Promise<boolean> =>
    ipcRenderer.invoke("clipboard:writeText", text),
  exportPricingSheet: (payload: {
    filename: string;
    sheetName: string;
    headers: string[];
    rows: Array<Array<string | number>>;
  }): Promise<string | null> =>
    ipcRenderer.invoke("pricing:exportSheet", payload),
  saveExpense: (input: ExpenseInput): Promise<InventoryData> =>
    ipcRenderer.invoke("expense:save", input),
  deleteExpense: (expenseId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("expense:delete", expenseId),
  saveSeriesInfo: (input: SeriesInfoInput): Promise<InventoryData> =>
    ipcRenderer.invoke("series:save", input),
  deleteSeriesInfo: (seriesId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("series:delete", seriesId),
  saveApplication: (input: ApplicationInput): Promise<InventoryData> =>
    ipcRenderer.invoke("application:save", input),
  deleteApplication: (applicationId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("application:delete", applicationId),
  generateApplicationPdf: (
    formatOrPayload: ApplicationDocFormat | ApplicationPdfPayload,
    payload?: ApplicationPdfPayload
  ): Promise<string | null> =>
    ipcRenderer.invoke("application:generatePdf", formatOrPayload, payload),
  exportFinancialsSheet: (payload: {
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
      received: number | null;
    }>;
    totals: { spent: number; earned: number; net: number };
  }): Promise<string | null> =>
    ipcRenderer.invoke("financials:exportSheet", payload),
  saveLookup: (input: LookupInput): Promise<InventoryData> =>
    ipcRenderer.invoke("lookup:save", input),
  deleteLookup: (input: LookupInput): Promise<InventoryData> =>
    ipcRenderer.invoke("lookup:delete", input),
  reassignLookup: (input: {
    category: string;
    fromValue: string;
    assignments: Array<{ id: string; value: string }>;
  }): Promise<InventoryData> => ipcRenderer.invoke("lookup:reassign", input),
  importImage: (
    targetType:
      | "artwork"
      | "edition"
      | "exhibition"
      | "expense"
      | "series"
      | "application",
    targetId: string,
    category: string
  ): Promise<{ image: unknown; inventory: InventoryData } | null> =>
    ipcRenderer.invoke("image:import", targetType, targetId, category),
  importDocument: (
    targetType: "artwork" | "edition" | "exhibition",
    targetId: string
  ): Promise<{ image: unknown; inventory: InventoryData } | null> =>
    ipcRenderer.invoke("document:import", targetType, targetId),
  setDocumentCaption: (imageId: string, caption: string): Promise<InventoryData> =>
    ipcRenderer.invoke("document:setCaption", imageId, caption),
  openDocument: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke("document:open", filePath),
  pickImagePath: (): Promise<{ path: string; dataUrl: string } | null> =>
    ipcRenderer.invoke("image:pickPath"),
  importImageFromPath: (
    sourcePath: string,
    targetType: "artwork" | "edition" | "exhibition",
    targetId: string,
    category: string
  ): Promise<{ image: unknown; inventory: InventoryData } | null> =>
    ipcRenderer.invoke("image:importPath", sourcePath, targetType, targetId, category),
  deleteImage: (imageId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("image:delete", imageId),
  markMovementReturned: (movementId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("movement:markReturned", movementId),
  imageToDataUrl: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("image:toDataUrl", filePath),
  saveImageCopy: (filePath: string, suggestedName?: string): Promise<string | null> =>
    ipcRenderer.invoke("image:saveCopy", filePath, suggestedName),
  exportImage: (options: ImageExportOptions): Promise<ImageExportResult | null> =>
    ipcRenderer.invoke("image:export", options),
  pickImageDataUrl: (): Promise<string | null> =>
    ipcRenderer.invoke("image:pickDataUrl")
};

contextBridge.exposeInMainWorld("inventoryApi", api);

export type InventoryApi = typeof api;
