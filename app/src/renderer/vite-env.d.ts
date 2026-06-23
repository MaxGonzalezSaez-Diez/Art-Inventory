/// <reference types="vite/client" />

import type { InventoryApi } from "../main/preload";

declare global {
  interface Window {
    inventoryApi: InventoryApi;
  }
}
