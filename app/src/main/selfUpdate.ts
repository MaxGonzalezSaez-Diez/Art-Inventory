/**
 * One-click update on macOS, without a paid Apple certificate:
 *  1. download the new DMG (the app downloads it itself, so macOS does not
 *     mark it as "from the internet" and asks nothing on the next open);
 *  2. check it really is this app in the expected version, and copy it next
 *     to the installed one;
 *  3. after the user agrees, quit; a small script waits for the app to close,
 *     swaps the two copies (putting the old one back if anything fails) and
 *     opens the app again.
 * The library and settings live outside the app, so they are never touched.
 * Anything unusual (dev build, app opened from the DMG, folder not writable)
 * → the renderer falls back to the plain download button.
 */
import { app } from "electron";
import { execFile, spawn } from "child_process";
import { constants, createWriteStream, existsSync } from "fs";
import { access, mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";

const BUNDLE_ID = "com.mumart.inventory";

export interface PreparedUpdate {
  version: string;
}

let prepared: { version: string; staged: string; work: string } | null = null;
let preparing = false;

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 4 * 1024 * 1024 }, (error, stdout) =>
      error ? reject(error) : resolve(String(stdout))
    );
  });
}

/** The installed .app, or null when this copy can't replace itself. */
function currentBundle(): string | null {
  if (!app.isPackaged || process.platform !== "darwin") return null;
  const bundle = path.resolve(process.execPath, "../../..");
  if (!bundle.endsWith(".app")) return null;
  // Opened straight from the DMG or from a quarantined download.
  if (bundle.startsWith("/Volumes/") || bundle.includes("/AppTranslocation/")) return null;
  return bundle;
}

function siblings(bundle: string): { staged: string; old: string } {
  const dir = path.dirname(bundle);
  const name = path.basename(bundle, ".app");
  return {
    staged: path.join(dir, `.${name}.update.app`),
    old: path.join(dir, `.${name}.old.app`)
  };
}

function resultFile(): string {
  return path.join(app.getPath("userData"), "update-result.txt");
}

export async function canSelfUpdate(version: string): Promise<boolean> {
  const bundle = currentBundle();
  if (!bundle) return false;
  try {
    await access(path.dirname(bundle), constants.W_OK);
    await access(bundle, constants.W_OK);
  } catch {
    return false;
  }
  // The last try failed: don't loop, use the download button instead.
  try {
    const last = (await readFile(resultFile(), "utf8")).trim();
    if (last.startsWith(`failed ${version} `)) return false;
  } catch {
    /* no earlier attempt */
  }
  return true;
}

/** On launch: remove copies left by an earlier update. */
export async function cleanUpAfterUpdate(): Promise<void> {
  const bundle = currentBundle();
  if (!bundle) return;
  const { staged, old } = siblings(bundle);
  await rm(staged, { recursive: true, force: true }).catch(() => undefined);
  await rm(old, { recursive: true, force: true }).catch(() => undefined);
  // A successful swap means this is the new version: forget earlier failures.
  try {
    const last = (await readFile(resultFile(), "utf8")).trim();
    if (last === `ok ${app.getVersion()}`) await rm(resultFile(), { force: true });
  } catch {
    /* nothing recorded */
  }
}

async function download(
  url: string,
  dest: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(30 * 60 * 1000)
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length")) || 0;
  let received = 0;
  let lastPercent = -1;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      const percent = total ? Math.min(100, Math.floor((received * 100) / total)) : 0;
      if (percent !== lastPercent) {
        lastPercent = percent;
        onProgress(percent);
      }
      done(null, chunk);
    }
  });
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    counter,
    createWriteStream(dest)
  );
  if (total && received !== total) throw new Error("Descarga incompleta");
}

async function plistValue(plist: string, key: string): Promise<string> {
  return (await run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plist])).trim();
}

/**
 * Download and stage the new version. Resolves when it is ready to swap;
 * the app keeps working meanwhile.
 */
export async function prepareUpdate(
  url: string,
  version: string,
  onProgress: (percent: number) => void
): Promise<PreparedUpdate> {
  if (prepared?.version === version && existsSync(prepared.staged)) return { version };
  if (preparing) throw new Error("Ya se está descargando.");
  const bundle = currentBundle();
  if (!bundle || !(await canSelfUpdate(version))) {
    throw new Error("No se puede actualizar sola.");
  }
  preparing = true;
  const work = path.join(os.tmpdir(), `inventario-update-${Date.now()}`);
  const mount = path.join(work, "mnt");
  const { staged } = siblings(bundle);
  let mounted = false;
  try {
    await mkdir(mount, { recursive: true });
    const dmg = path.join(work, "update.dmg");
    await download(url, dmg, onProgress);
    // hdiutil checks the image's own checksum, so a damaged download fails here.
    await run("/usr/bin/hdiutil", [
      "attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount, dmg
    ]);
    mounted = true;
    const appName = (await readdir(mount)).find((name) => name.endsWith(".app"));
    if (!appName) throw new Error("La descarga no contiene el programa.");
    const source = path.join(mount, appName);
    const plist = path.join(source, "Contents", "Info.plist");
    if ((await plistValue(plist, "CFBundleIdentifier")) !== BUNDLE_ID) {
      throw new Error("La descarga no es este programa.");
    }
    const found = await plistValue(plist, "CFBundleShortVersionString");
    if (found !== version) throw new Error(`Versión inesperada (${found}).`);
    await rm(staged, { recursive: true, force: true });
    await run("/usr/bin/ditto", [source, staged]);
    await run("/usr/bin/hdiutil", ["detach", mount, "-force"]).catch(() => undefined);
    mounted = false;
    await rm(dmg, { force: true });
    prepared = { version, staged, work };
    return { version };
  } catch (error) {
    if (mounted) await run("/usr/bin/hdiutil", ["detach", mount, "-force"]).catch(() => undefined);
    await rm(staged, { recursive: true, force: true }).catch(() => undefined);
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    preparing = false;
  }
}

// Runs after the app has quit. Every step that can fail leaves a working app:
// the old one is only removed once the new one is in its place.
const SWAP_SCRIPT = `#!/bin/bash
PID="$1"; APP="$2"; NEW="$3"; OLD="$4"; RESULT="$5"; VERSION="$6"; WORK="$7"
shift 7
for i in $(seq 1 1200); do kill -0 "$PID" 2>/dev/null || break; sleep 0.1; done
if kill -0 "$PID" 2>/dev/null; then
  echo "failed $VERSION still-running" > "$RESULT"; rm -rf "$NEW" "$WORK"; exit 1
fi
rm -rf "$OLD"
if mv "$APP" "$OLD"; then
  if mv "$NEW" "$APP"; then
    xattr -dr com.apple.quarantine "$APP" 2>/dev/null
    rm -rf "$OLD"
    echo "ok $VERSION" > "$RESULT"
  else
    mv "$OLD" "$APP"
    echo "failed $VERSION swap" > "$RESULT"
  fi
else
  echo "failed $VERSION move" > "$RESULT"
fi
rm -rf "$NEW" "$WORK"
if [ "$#" -gt 0 ]; then open "$APP" --args "$@"; else open "$APP"; fi
`;

/** Quit, swap in the staged version and reopen. Call only once all is saved. */
export async function installAndRestart(waitForSaves: () => Promise<void>): Promise<void> {
  const bundle = currentBundle();
  if (!bundle || !prepared || !existsSync(prepared.staged)) {
    throw new Error("La versión nueva no está preparada.");
  }
  await waitForSaves();
  const { old } = siblings(bundle);
  const script = path.join(prepared.work, "swap.sh");
  await writeFile(script, SWAP_SCRIPT, { mode: 0o755 });
  const child = spawn(
    "/bin/bash",
    [
      script,
      String(process.pid),
      bundle,
      prepared.staged,
      old,
      resultFile(),
      prepared.version,
      prepared.work,
      // Same start options as now (normally none).
      ...process.argv.slice(1)
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
  app.quit();
}
