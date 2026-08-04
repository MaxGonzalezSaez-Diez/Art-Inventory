/** Shared result type for photo editor. */
export type ImageEditSaveResult = {
  editedDataUrl: string;
  /** Always the file the user picked (before straighten / retouch). */
  originalDataUrl: string;
  /** When true, parent should store original as first additional image. */
  keepOriginalAsExtra: boolean;
};
