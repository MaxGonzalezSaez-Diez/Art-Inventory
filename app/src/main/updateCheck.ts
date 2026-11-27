/**
 * "Hay una versión nueva": compares this build with the newest vX.Y.Z
 * release on GitHub. selfUpdate.ts installs it in one click when it can;
 * otherwise the renderer offers the plain download button.
 */
import { app, shell } from "electron";
import { canSelfUpdate } from "./selfUpdate";

const REPO = "MaxGonzalezSaez-Diez/Art-Inventory";
// INVENTARIO_UPDATE_FEED: only for testing the updater against a local server.
const TEST_FEED = process.env.INVENTARIO_UPDATE_FEED || "";
const RELEASES_URL =
  TEST_FEED || `https://api.github.com/repos/${REPO}/releases?per_page=20`;
export const DOWNLOAD_PREFIX = TEST_FEED
  ? new URL(TEST_FEED).origin + "/"
  : `https://github.com/${REPO}/`;

export interface UpdateInfo {
  current: string;
  latest: string;
  /** Direct link to the DMG (falls back to the release page). */
  downloadUrl: string;
  /** The app can download and install it by itself (one click). */
  canInstall: boolean;
}

function parseVersion(value: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  return match ? match.slice(1).map(Number) : null;
}

function isNewer(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Newer release, or null (up to date, offline, or GitHub unreachable). */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  // `npm run dev` reports package.json's placeholder version (only release
  // builds get the tag's number), so it would always look out of date.
  if (!app.isPackaged && !TEST_FEED) return null;
  const current = parseVersion(app.getVersion());
  if (!current) return null;
  try {
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const releases = (await response.json()) as Array<{
      tag_name?: string;
      draft?: boolean;
      prerelease?: boolean;
      html_url?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    }>;
    let best: { version: number[]; tag: string; url: string; isDmg: boolean } | null = null;
    for (const release of releases) {
      if (release.draft || release.prerelease || !release.tag_name) continue;
      const version = parseVersion(release.tag_name);
      if (!version || (best && !isNewer(version, best.version))) continue;
      const dmg = release.assets?.find((asset) => asset.name?.endsWith(".dmg"));
      const url = dmg?.browser_download_url || release.html_url || "";
      if (url.startsWith(DOWNLOAD_PREFIX)) {
        best = { version, tag: release.tag_name, url, isDmg: Boolean(dmg) };
      }
    }
    if (!best || !isNewer(best.version, current)) return null;
    const latest = best.tag.replace(/^v/, "");
    return {
      current: app.getVersion(),
      latest,
      downloadUrl: best.url,
      canInstall: best.isDmg && (await canSelfUpdate(latest))
    };
  } catch {
    return null;
  }
}

/** Only ever opens this project's GitHub downloads. */
export async function openUpdateDownload(url: string): Promise<void> {
  if (typeof url === "string" && url.startsWith(DOWNLOAD_PREFIX)) {
    await shell.openExternal(url);
  }
}
