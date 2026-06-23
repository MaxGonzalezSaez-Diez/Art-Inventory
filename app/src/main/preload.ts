import { contextBridge, ipcRenderer } from "electron";
import type {
  PriceListFormat,
  PriceListPayload
} from "./pricelist";
import type {
  ArtworkInput,
  ContactInput,
  ExhibitionInput,
  InventoryData,
  LookupInput
} from "./types/inventory";

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
  saveLookup: (input: LookupInput): Promise<InventoryData> =>
    ipcRenderer.invoke("lookup:save", input),
  deleteLookup: (input: LookupInput): Promise<InventoryData> =>
    ipcRenderer.invoke("lookup:delete", input),
  importImage: (
    targetType: "artwork" | "edition" | "exhibition",
    targetId: string,
    category: string
  ): Promise<{ image: unknown; inventory: InventoryData } | null> =>
    ipcRenderer.invoke("image:import", targetType, targetId, category),
  deleteImage: (imageId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("image:delete", imageId),
  markMovementReturned: (movementId: string): Promise<InventoryData> =>
    ipcRenderer.invoke("movement:markReturned", movementId),
  imageToDataUrl: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("image:toDataUrl", filePath),
  saveImageCopy: (filePath: string, suggestedName?: string): Promise<string | null> =>
    ipcRenderer.invoke("image:saveCopy", filePath, suggestedName),
  pickImageDataUrl: (): Promise<string | null> =>
    ipcRenderer.invoke("image:pickDataUrl")
};

contextBridge.exposeInMainWorld("inventoryApi", api);

export type InventoryApi = typeof api;
