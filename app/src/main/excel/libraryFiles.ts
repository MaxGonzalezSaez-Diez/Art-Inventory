/**
 * Safe writes and dated snapshots for the library's data file.
 *
 * inventory.json is the only complete copy of the user's data, so it is
 * written atomically (temp file + rename) and snapshotted into backups/
 * before it is replaced (at most one snapshot every 30 minutes). All
 * snapshots of the last two days are kept, then one per day forever, so no
 * day of history is ever lost.
 */
import { access, copyFile, mkdir, open, readdir, rename, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const SNAPSHOT_EVERY_MS = 30 * 60 * 1000;
const KEEP_ALL_MS = 2 * 24 * 60 * 60 * 1000;

// inventory-2026-10-11T12-30-00-000Z.json (same stamp as the Excel backups)
const SNAPSHOT_RE = /^inventory-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.(json|xlsx)$/;

export interface Snapshot {
  file: string;
  ms: number;
}

function stamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function backupsDir(libraryPath: string): string {
  return path.join(libraryPath, "backups");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Write via a temp file and rename, so a crash never leaves a half file. */
export async function writeFileAtomic(target: string, text: string): Promise<void> {
  // Unique per write, so two saves at once never share a temp file.
  const temp = `${target}.${process.pid}-${randomUUID().slice(0, 8)}.tmp`;
  const handle = await open(temp, "w");
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, target);
}

/** Dated snapshots of one kind, newest first. */
export async function listSnapshots(
  libraryPath: string,
  extension: "json" | "xlsx"
): Promise<Snapshot[]> {
  let names: string[] = [];
  try {
    names = await readdir(backupsDir(libraryPath));
  } catch {
    return [];
  }
  const snapshots: Snapshot[] = [];
  for (const name of names) {
    const match = SNAPSHOT_RE.exec(name);
    if (!match || match[6] !== extension) continue;
    const [, day, hh, mm, ss, ms] = match;
    const time = Date.parse(`${day}T${hh}:${mm}:${ss}.${ms}Z`);
    if (Number.isFinite(time)) {
      snapshots.push({ file: path.join(backupsDir(libraryPath), name), ms: time });
    }
  }
  return snapshots.sort((a, b) => b.ms - a.ms);
}

/** Keep everything from the last two days, then the newest of each day. */
export async function pruneSnapshots(
  libraryPath: string,
  extension: "json" | "xlsx",
  now = Date.now()
): Promise<void> {
  const snapshots = await listSnapshots(libraryPath, extension);
  const seenDays = new Set<string>();
  for (const snapshot of snapshots) {
    const age = now - snapshot.ms;
    const day = new Date(snapshot.ms).toISOString().slice(0, 10);
    const keep = age < KEEP_ALL_MS || !seenDays.has(day);
    seenDays.add(day);
    if (!keep) await unlink(snapshot.file).catch(() => undefined);
  }
}

/** The data file as it was just before the latest save (one rolling copy). */
export function previousCopyPath(libraryPath: string): string {
  return path.join(backupsDir(libraryPath), "inventory-previous.json");
}

/**
 * Before replacing the data file: keep it as the rolling previous copy, and
 * as a dated snapshot at most every 30 minutes.
 */
export async function backupBeforeWrite(libraryPath: string, dataPath: string): Promise<void> {
  if (!(await exists(dataPath))) return;
  await mkdir(backupsDir(libraryPath), { recursive: true });
  await copyFile(dataPath, previousCopyPath(libraryPath));
  await snapshotDataFile(libraryPath, dataPath);
}

/** Copy the current data file into backups/ (at most every 30 minutes). */
export async function snapshotDataFile(
  libraryPath: string,
  dataPath: string
): Promise<void> {
  if (!(await exists(dataPath))) return;
  const [latest] = await listSnapshots(libraryPath, "json");
  if (latest && Date.now() - latest.ms < SNAPSHOT_EVERY_MS) return;
  await mkdir(backupsDir(libraryPath), { recursive: true });
  await copyFile(dataPath, path.join(backupsDir(libraryPath), `inventory-${stamp()}.json`));
  await pruneSnapshots(libraryPath, "json");
}

/** Set an unreadable data file aside (never pruned) before it is replaced. */
export async function keepUnreadable(libraryPath: string, dataPath: string): Promise<void> {
  if (!(await exists(dataPath))) return;
  await mkdir(backupsDir(libraryPath), { recursive: true });
  await copyFile(
    dataPath,
    path.join(backupsDir(libraryPath), `unreadable-inventory-${stamp()}.json`)
  );
}
