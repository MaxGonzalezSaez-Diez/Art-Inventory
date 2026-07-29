import { mkdir } from "fs/promises";
import path from "path";
import {
  BrowserWindow,
  dialog,
  type SaveDialogOptions
} from "electron";

/** Library subfolder where PDFs, image exports, Excel sheets, etc. land by default. */
export const GENERATED_FOLDER = "generated";

export async function pathInGenerated(
  libraryPath: string,
  filename: string
): Promise<string> {
  const dir = path.join(libraryPath, GENERATED_FOLDER);
  await mkdir(dir, { recursive: true });
  return path.join(dir, filename);
}

/**
 * Save dialog pre-filled to `{library}/generated/{filename}`.
 * User can confirm (autosave there) or pick another path.
 */
export async function chooseGeneratedSavePath(
  parentWindow: BrowserWindow | null,
  libraryPath: string,
  filename: string,
  options: Omit<SaveDialogOptions, "defaultPath">
): Promise<string | null> {
  const defaultPath = libraryPath
    ? await pathInGenerated(libraryPath, filename)
    : filename;
  const dialogOptions: SaveDialogOptions = { ...options, defaultPath };
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}
