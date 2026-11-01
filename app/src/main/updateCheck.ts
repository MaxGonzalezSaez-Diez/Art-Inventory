/**
 * "Hay una versión nueva": compares this build with the newest vX.Y.Z
 * release on GitHub. No auto-install (that needs a paid Apple certificate);
 * the renderer offers a download button instead.
 */
import { app, shell } from "electron";

const REPO = "MaxGonzalezSaez-Diez/Art-Inventory";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/`;

export interface UpdateInfo {
  current: string;
  latest: string;
  /** Direct link to the DMG (falls back to the release page). */
  downloadUrl: string;
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
    let best: { version: number[]; tag: string; url: string } | null = null;
    for (const release of releases) {
      if (release.draft || release.prerelease || !release.tag_name) continue;
      const version = parseVersion(release.tag_name);
      if (!version || (best && !isNewer(version, best.version))) continue;
      const dmg = release.assets?.find((asset) => asset.name?.endsWith(".dmg"));
      const url = dmg?.browser_download_url || release.html_url || "";
      if (url.startsWith(DOWNLOAD_PREFIX)) best = { version, tag: release.tag_name, url };
    }
    if (!best || !isNewer(best.version, current)) return null;
    return { current: app.getVersion(), latest: best.tag.replace(/^v/, ""), downloadUrl: best.url };
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
