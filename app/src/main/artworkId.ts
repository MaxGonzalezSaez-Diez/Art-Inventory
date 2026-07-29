/**
 * Compact numeric catalog IDs — digits only, no dashes.
 *
 * Layout (12 digits): HHHWWWYYXXXX
 *   HHH  height in cm, 0–999, zero-padded (018 = 18 cm)
 *   WWW  width in cm, 0–999, zero-padded  (055 = 55 cm)
 *   YY   year made, last two digits
 *   XXXX 4-digit hash of the title (bumped on collision)
 *
 * Example: 18×55 cm, 2024, title "Flor azul" → 01805524####
 * No size (e.g. iPad Drawing) → 00000024####
 */

export interface ArtworkIdParts {
  title?: string;
  yearMade?: string;
  height?: string;
  width?: string;
  unit?: "cm" | "in" | string;
}

function yearShort(yearMade?: string): string {
  const digits = String(yearMade ?? "").replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(-2);
  return String(new Date().getFullYear()).slice(-2);
}

function parseMeasureCm(value: string | undefined, unit?: string): number {
  const raw = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!raw) return 0;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  const cm = unit === "in" ? num * 2.54 : num;
  return Math.round(cm);
}

function pad3(n: number): string {
  const clamped = Math.max(0, Math.min(999, n));
  return String(clamped).padStart(3, "0");
}

/** Stable 4-digit decimal hash of the title (0000–9999). */
function titleHash4(title?: string): string {
  const text = String(title ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!text) return "0000";
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(Math.abs(hash) % 10000).padStart(4, "0");
}

function sizeYearPrefix(parts: ArtworkIdParts): string {
  const h = parseMeasureCm(parts.height, parts.unit);
  const w = parseMeasureCm(parts.width, parts.unit);
  return `${pad3(h)}${pad3(w)}${yearShort(parts.yearMade)}`;
}

/** Base catalog id (12 digits) without uniqueness bump. */
export function buildArtworkIdBase(parts: ArtworkIdParts): string {
  return `${sizeYearPrefix(parts)}${titleHash4(parts.title)}`;
}

/**
 * Unique among existing ids. On clash, bumps the last 4 digits (+1)
 * so the id stays digits-only with no separators.
 */
export function allocateArtworkId(base: string, existingIds: string[]): string {
  const prefix = base.slice(0, 8);
  let suffix = Number(base.slice(8, 12) || "0");
  if (!Number.isFinite(suffix)) suffix = 0;

  let candidate = `${prefix}${String(suffix).padStart(4, "0")}`;
  const taken = new Set(existingIds);
  let guard = 0;
  while (taken.has(candidate) && guard < 10000) {
    suffix = (suffix + 1) % 10000;
    candidate = `${prefix}${String(suffix).padStart(4, "0")}`;
    guard += 1;
  }
  return candidate;
}

export function createArtworkId(
  parts: ArtworkIdParts,
  existingIds: string[]
): string {
  return allocateArtworkId(buildArtworkIdBase(parts), existingIds);
}
