/**
 * Copy of the whole library folder somewhere else (iCloud Drive, a USB disk,
 * a Dropbox/Google Drive folder…). iCloud then uploads it by itself.
 *
 * The copy only adds and updates files — it never deletes — so whatever is
 * removed by mistake in the library is still in the copy (and backups/ in the
 * copy keeps the dated history). It also refuses to copy a library that is
 * empty or much smaller than the copy (e.g. a folder the app just recreated),
 * unless the user confirms. To restore: copy the folder back to the Mac and
 * pick it with «Cambiar carpeta».
 */
import { app, dialog, type BrowserWindow } from "electron";
import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";

const COPY_FOLDER_NAME = "Inventario de Arte - copia";
const AUTO_EVERY_MS = 12 * 60 * 60 * 1000;

export interface BackupStatus {
  /** Folder that receives the copy ("" = not set up). */
  folder: string;
  /** The copy goes to iCloud Drive. */
  inICloud: boolean;
  /** ISO time of the last finished copy ("" = never). */
  lastAt: string;
  /** Why the last attempt failed ("" = it worked). */
  lastError: string;
  icloudAvailable: boolean;
  running: boolean;
  /**
   * Set when the last copy was refused because the library has far less data
   * than the copy. Works counts are for the message; cleared by a copy.
   */
  blocked: { libraryWorks: number; copyWorks: number } | null;
}

interface BackupState {
  folder: string;
  lastAt: string;
  lastError: string;
  blocked: BackupStatus["blocked"];
}

let running = false;

function stateFile(): string {
  return path.join(app.getPath("userData"), "backup.json");
}

function icloudDrive(): string {
  return path.join(os.homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs");
}

async function readState(): Promise<BackupState> {
  try {
    const raw = JSON.parse(await readFile(stateFile(), "utf8")) as Partial<BackupState>;
    const blocked =
      raw.blocked &&
      typeof raw.blocked.libraryWorks === "number" &&
      typeof raw.blocked.copyWorks === "number"
        ? { libraryWorks: raw.blocked.libraryWorks, copyWorks: raw.blocked.copyWorks }
        : null;
    return {
      folder: typeof raw.folder === "string" ? raw.folder : "",
      lastAt: typeof raw.lastAt === "string" ? raw.lastAt : "",
      lastError: typeof raw.lastError === "string" ? raw.lastError : "",
      blocked
    };
  } catch {
    return { folder: "", lastAt: "", lastError: "", blocked: null };
  }
}

async function writeState(patch: Partial<BackupState>): Promise<BackupState> {
  const next = { ...(await readState()), ...patch };
  await mkdir(path.dirname(stateFile()), { recursive: true });
  await writeFile(stateFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const state = await readState();
  return {
    ...state,
    inICloud: Boolean(state.folder) && isInside(state.folder, icloudDrive()),
    icloudAvailable: existsSync(icloudDrive()),
    running
  };
}

/** "icloud" uses iCloud Drive directly; "pick" asks for any folder. */
export async function chooseBackupFolder(
  parent: BrowserWindow | null,
  where: "icloud" | "pick",
  libraryPath: string
): Promise<BackupStatus> {
  let base = "";
  if (where === "icloud") {
    if (!existsSync(icloudDrive())) throw new Error("iCloud Drive no está activado en este Mac.");
    base = icloudDrive();
  } else {
    const options = {
      title: "Elegir dónde guardar la copia",
      properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return getBackupStatus();
    base = result.filePaths[0];
  }
  const folder = path.join(base, COPY_FOLDER_NAME);
  if (isInside(folder, libraryPath) || isInside(libraryPath, folder)) {
    throw new Error("La copia tiene que estar fuera de la carpeta del inventario.");
  }
  await writeState({ folder, lastError: "", blocked: null });
  await runBackup(libraryPath);
  return getBackupStatus();
}

/** Copy new and changed files from src into dest. Never deletes anything. */
async function mirror(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (entry.name === ".DS_Store" || entry.name.endsWith(".tmp")) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await mirror(from, to);
      continue;
    }
    if (!entry.isFile()) continue;
    const source = await stat(from);
    const target = await stat(to).catch(() => null);
    if (target && target.size === source.size && target.mtimeMs >= source.mtimeMs) continue;
    // Copy beside the target first, so an interrupted copy never leaves a
    // half file in place of a good one.
    const partial = `${to}.partial`;
    await copyFile(from, partial);
    await rename(partial, to);
  }
}

const DATA_FILE = "inventory.json";

/** Record lists that hold the user's own data (lookups are app defaults). */
const DATA_LISTS = [
  "artworks",
  "editions",
  "movements",
  "exhibitions",
  "contacts",
  "images",
  "expenses",
  "seriesInfo",
  "applications",
  "priceLists",
  "textGeneratorExamples",
  "contactReminders",
  "inboxNotes",
  "inboxTodos"
];

type DataSize = { works: number; records: number } | "missing" | "unreadable";

async function dataSize(file: string): Promise<DataSize> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return existsSync(file) ? "unreadable" : "missing";
  }
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    if (!data || typeof data !== "object" || Array.isArray(data)) return "unreadable";
    const count = (key: string) => (Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0);
    return {
      works: count("artworks"),
      records: DATA_LISTS.reduce((sum, key) => sum + count(key), 0)
    };
  } catch {
    return "unreadable";
  }
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * `force` = the user confirmed that a much smaller library is right (they
 * deleted things on purpose). The copy's data file is still kept aside first.
 */
export async function runBackup(libraryPath: string, force = false): Promise<BackupStatus> {
  const state = await readState();
  if (!state.folder || running) return getBackupStatus();
  running = true;
  try {
    if (isInside(state.folder, libraryPath) || isInside(libraryPath, state.folder)) {
      throw new Error("La copia tiene que estar fuera de la carpeta del inventario.");
    }
    if (!existsSync(path.dirname(state.folder))) {
      throw new Error("La carpeta de la copia no está disponible (¿disco desconectado?).");
    }
    const library = await dataSize(path.join(libraryPath, DATA_FILE));
    const copyData = path.join(state.folder, DATA_FILE);
    const copy = await dataSize(copyData);
    if (library === "unreadable" || library === "missing") {
      throw new Error(
        "El archivo del inventario no se puede leer, así que no se ha copiado nada (la copia sigue intacta)."
      );
    }
    if (typeof copy === "object" && copy.records > 0) {
      // A recreated empty folder, a different library or a big accidental
      // delete would otherwise replace the good copy.
      const shrunk = library.records === 0 || library.records < copy.records / 2;
      if (shrunk && !force) {
        await writeState({
          lastError: "",
          blocked: { libraryWorks: library.works, copyWorks: copy.works }
        });
        return getBackupStatus();
      }
      if (shrunk) {
        await mkdir(path.join(state.folder, "backups"), { recursive: true });
        await copyFile(
          copyData,
          path.join(state.folder, "backups", `before-smaller-copy-inventory-${stamp()}.json`)
        );
      }
    }
    await mirror(libraryPath, state.folder);
    await writeState({ lastAt: new Date().toISOString(), lastError: "", blocked: null });
  } catch (error) {
    await writeState({
      lastError: error instanceof Error ? error.message : "No se pudo hacer la copia."
    });
  } finally {
    running = false;
  }
  return getBackupStatus();
}

/** Back up if the last copy is older than 12 hours (or never happened). */
export async function backupIfDue(libraryPath: string): Promise<void> {
  const state = await readState();
  if (!state.folder || !libraryPath) return;
  const last = Date.parse(state.lastAt);
  if (Number.isFinite(last) && Date.now() - last < AUTO_EVERY_MS) return;
  await runBackup(libraryPath);
}
