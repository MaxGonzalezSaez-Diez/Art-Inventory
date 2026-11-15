import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  PriceListPayload
} from "./pricelist";
import type { GeneratedPdfResult } from "./pdfImages";
import type {
  BulkImageExportOptions,
  BulkImageExportResult,
  ImageExportOptions,
  ImageExportResult,
  ImageProbe
} from "./imageExport";
import type {
  AppSettings,
  ApplicationInput,
  ArtworkInput,
  ContactInput,
  ExhibitionInput,
  ExpenseInput,
  InventoryData,
  LookupInput,
  PriceListDocInput,
  SeriesInfoInput,
  TextGeneratorExample,
  ContactReminder,
  InboxNote,
  InboxTodo
} from "./types/inventory";
import type { ApplicationPdfPayload } from "./applicationPdf";
import type { AppLanguage, AppPreferences } from "./preferences";
import type { UpdateInfo } from "./updateCheck";

const api = {
  checkForUpdate: (): Promise<UpdateInfo | null> => ipcRenderer.invoke("app:checkUpdate"),
  openUpdateDownload: (url: string): Promise<void> =>
    ipcRenderer.invoke("app:openUpdate", url),
  /** Download and check the new version; the app keeps working meanwhile. */
  prepareUpdate: (url: string, version: string): Promise<{ version: string }> =>
    ipcRenderer.invoke("app:prepareUpdate", url, version),
  /** Quit, install the prepared version and reopen. Save everything first. */
  installUpdate: (): Promise<void> => ipcRenderer.invoke("app:installUpdate"),
  onUpdateProgress: (listener: (percent: number) => void): (() => void) => {
    const handler = (_event: unknown, percent: number) => listener(percent);
    ipcRenderer.on("update:progress", handler);
    return () => ipcRenderer.removeListener("update:progress", handler);
  },
  getLibraryPath: (): Promise<string> => ipcRenderer.invoke("library:getPath"),
  chooseLibrary: (): Promise<string> => ipcRenderer.invoke("library:choose"),
  getPreferences: (): Promise<
    AppPreferences & { choices: { documents: string; desktop: string } }
  > => ipcRenderer.invoke("prefs:get"),
  setLanguage: (language: AppLanguage): Promise<AppPreferences> =>
    ipcRenderer.invoke("prefs:setLanguage", language),
  pickLibraryParent: (): Promise<string | null> =>
    ipcRenderer.invoke("prefs:pickLibraryParent"),
  completeSetup: (payload: {
    language: AppLanguage;
    libraryPath: string;
  }): Promise<AppPreferences> => ipcRenderer.invoke("prefs:completeSetup", payload),
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
    payload: PriceListPayload
  ): Promise<GeneratedPdfResult | null> =>
    ipcRenderer.invoke("pricelist:generate", payload),
  generateCertificateOfAuthenticity: (payload: {
    title: string;
    year?: string;
    medium?: string;
    size?: string;
    series?: string;
    edition?: string;
    editionMode?: "unique" | "multiple";
    editionCount?: number;
    copyNumber?: number;
    copyLabel?: string;
    artistName?: string;
    language?: "es" | "en" | "de";
    imageDataUrl?: string;
  }): Promise<string | null> =>
    ipcRenderer.invoke("certificate:generate", payload),
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
  saveContactReminders: (
    reminders: ContactReminder[]
  ): Promise<InventoryData> =>
    ipcRenderer.invoke("inbox:saveReminders", reminders),
  saveInboxNotes: (notes: InboxNote[]): Promise<InventoryData> =>
    ipcRenderer.invoke("inbox:saveNotes", notes),
  saveInboxTodos: (todos: InboxTodo[]): Promise<InventoryData> =>
    ipcRenderer.invoke("inbox:saveTodos", todos),
  writeClipboardText: (text: string): Promise<boolean> =>
    ipcRenderer.invoke("clipboard:writeText", text),
  writeClipboardImageFiles: (
    files: Array<{ name: string; sourcePath: string }>
  ): Promise<{ count: number }> =>
    ipcRenderer.invoke("clipboard:writeImageFiles", files),
  openPhotoFolder: (
    files: Array<{ name: string; sourcePath: string }>
  ): Promise<{ count: number; folder: string }> =>
    ipcRenderer.invoke("photos:openFolder", files),
  startPhotoDrag: (files: Array<{ name: string; sourcePath: string }>): void =>
    ipcRenderer.send("photos:startDrag", files),
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
  savePriceList: (input: PriceListDocInput): Promise<InventoryData> =>
    ipcRenderer.invoke("pricelist:save", input),
  deletePriceList: (priceListId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("pricelist:delete", priceListId),
  generateApplicationPdf: (
    payload: ApplicationPdfPayload
  ): Promise<GeneratedPdfResult | null> =>
    ipcRenderer.invoke("application:generatePdf", payload),
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
      salePrice: number | null;
      taxCharged?: boolean;
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
    targetType: "artwork" | "edition" | "exhibition" | "series",
    targetId: string
  ): Promise<{ image: unknown; inventory: InventoryData } | null> =>
    ipcRenderer.invoke("document:import", targetType, targetId),
  setDocumentCaption: (imageId: string, caption: string): Promise<InventoryData> =>
    ipcRenderer.invoke("document:setCaption", imageId, caption),
  openDocument: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke("document:open", filePath),
  pickImagePath: (): Promise<{ path: string; dataUrl: string } | null> =>
    ipcRenderer.invoke("image:pickPath"),
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file) || "";
    } catch {
      return "";
    }
  },
  importImageFromPath: (
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
  ): Promise<{ image: unknown; inventory: InventoryData } | null> =>
    ipcRenderer.invoke("image:importPath", sourcePath, targetType, targetId, category),
  importImageFromDataUrl: (
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
  ): Promise<{ image: unknown; inventory: InventoryData } | null> =>
    ipcRenderer.invoke(
      "image:importDataUrl",
      dataUrl,
      targetType,
      targetId,
      category,
      originalName
    ),
  dataUrlToTempPath: (dataUrl: string): Promise<string> =>
    ipcRenderer.invoke("image:dataUrlToTemp", dataUrl),
  deleteImage: (imageId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("image:delete", imageId),
  markMovementReturned: (movementId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("movement:markReturned", movementId),
  imageToDataUrl: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("image:toDataUrl", filePath),
  /** Small copy for previews/thumbnails; the original file is untouched. */
  imagePreviewDataUrl: (filePath: string, maxEdge: number): Promise<string> =>
    ipcRenderer.invoke("image:toPreviewDataUrl", filePath, maxEdge),
  saveImageCopy: (filePath: string, suggestedName?: string): Promise<string | null> =>
    ipcRenderer.invoke("image:saveCopy", filePath, suggestedName),
  exportImage: (options: ImageExportOptions): Promise<ImageExportResult | null> =>
    ipcRenderer.invoke("image:export", options),
  exportImagesBulk: (
    options: BulkImageExportOptions
  ): Promise<BulkImageExportResult | null> =>
    ipcRenderer.invoke("image:exportBulk", options),
  probeImage: (filePath: string): Promise<ImageProbe | null> =>
    ipcRenderer.invoke("image:probe", filePath),
  pickImageDataUrl: (): Promise<string | null> =>
    ipcRenderer.invoke("image:pickDataUrl")
};

contextBridge.exposeInMainWorld("inventoryApi", api);

export type InventoryApi = typeof api;
