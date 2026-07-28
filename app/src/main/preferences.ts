import { app } from "electron";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export type AppLanguage = "es" | "en" | "de";

export interface AppPreferences {
  language: AppLanguage;
  libraryPath: string;
  setupComplete: boolean;
}

/** Folder created inside the location the user picks during setup. */
const LIBRARY_FOLDER_NAME = "ArtInventory";

/** Where earlier versions always kept the library, before setup existed. */
function legacyLibraryPath(): string {
  return path.join(app.getPath("documents"), "MumArtLibrary");
}

function preferencesFile(): string {
  return path.join(app.getPath("userData"), "preferences.json");
}

function isLanguage(value: unknown): value is AppLanguage {
  return value === "es" || value === "en" || value === "de";
}

export function libraryLocationChoices(): { documents: string; desktop: string } {
  return {
    documents: path.join(app.getPath("documents"), LIBRARY_FOLDER_NAME),
    desktop: path.join(app.getPath("desktop"), LIBRARY_FOLDER_NAME)
  };
}

export function libraryFolderFor(parentDir: string): string {
  return path.join(parentDir, LIBRARY_FOLDER_NAME);
}

export async function readPreferences(): Promise<AppPreferences> {
  try {
    const raw = JSON.parse(await readFile(preferencesFile(), "utf8")) as Partial<AppPreferences>;
    if (raw.setupComplete && typeof raw.libraryPath === "string" && raw.libraryPath) {
      return {
        language: isLanguage(raw.language) ? raw.language : "es",
        libraryPath: raw.libraryPath,
        setupComplete: true
      };
    }
  } catch {
    /* no preferences yet */
  }

  // Someone who used the app before setup existed still gets asked about the
  // language, but with their existing library already filled in.
  const legacy = legacyLibraryPath();
  const hasLegacy = existsSync(path.join(legacy, "inventory.xlsx"));

  return {
    language: "es",
    libraryPath: hasLegacy ? legacy : libraryLocationChoices().documents,
    setupComplete: false
  };
}

export async function writePreferences(
  patch: Partial<AppPreferences>
): Promise<AppPreferences> {
  const current = await readPreferences();
  const next: AppPreferences = {
    language: isLanguage(patch.language) ? patch.language : current.language,
    libraryPath: patch.libraryPath || current.libraryPath,
    setupComplete: patch.setupComplete ?? current.setupComplete
  };
  await mkdir(path.dirname(preferencesFile()), { recursive: true });
  await writeFile(preferencesFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
