import { pruneSnapshots } from "./libraryFiles";
import ExcelJS from "exceljs";
import { access, copyFile, mkdir } from "fs/promises";
import path from "path";
import {
  DEFAULT_LOOKUPS,
  LIBRARY_DIRECTORIES,
  SHEETS,
  WORKBOOK_FILE,
  type SheetName
} from "./schema";

export async function ensureLibrary(libraryPath: string): Promise<string> {
  await mkdir(libraryPath, { recursive: true });

  await Promise.all(
    LIBRARY_DIRECTORIES.map((directory) =>
      mkdir(path.join(libraryPath, directory), { recursive: true })
    )
  );

  const workbookPath = path.join(libraryPath, WORKBOOK_FILE);
  if (!(await exists(workbookPath))) {
    const workbook = createEmptyWorkbook();
    await workbook.xlsx.writeFile(workbookPath);
  }

  return workbookPath;
}

export async function backupWorkbook(libraryPath: string): Promise<void> {
  const workbookPath = path.join(libraryPath, WORKBOOK_FILE);
  if (!(await exists(workbookPath))) return;

  const safeStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    libraryPath,
    "backups",
    `inventory-${safeStamp}.xlsx`
  );
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(workbookPath, backupPath);
}

const LEGACY_SHEETS = [
  "Transactions",
  "PeopleAndOrganizations",
  "CustomFields",
  "CustomFieldValues",
  "ArtworkWebsiteExport",
  "EditionWebsiteExport",
  "README",
  "AuditLog"
];

export async function loadWorkbook(
  libraryPath: string
): Promise<ExcelJS.Workbook> {
  let workbookPath = await ensureLibrary(libraryPath);
  let workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  if (isLegacyWorkbook(workbook)) {
    await archiveLegacyWorkbook(libraryPath, workbookPath);
    const fresh = createEmptyWorkbook();
    await fresh.xlsx.writeFile(workbookPath);
    workbook = new ExcelJS.Workbook();
    workbookPath = await ensureLibrary(libraryPath);
    await workbook.xlsx.readFile(workbookPath);
  }

  ensureWorkbookShape(workbook);
  return workbook;
}

function isLegacyWorkbook(workbook: ExcelJS.Workbook): boolean {
  if (workbook.worksheets.some((sheet) => LEGACY_SHEETS.includes(sheet.name))) {
    return true;
  }
  const exhibitions = workbook.getWorksheet("Exhibitions");
  if (exhibitions) {
    const headers = getHeaderRow(exhibitions);
    if (headers.includes("artworkId") || (headers.length > 0 && !headers.includes("title"))) {
      return true;
    }
  }
  const contacts = workbook.getWorksheet("Contacts");
  if (contacts) {
    const headers = getHeaderRow(contacts);
    if (headers.includes("type") && !headers.includes("kind")) return true;
  }
  return false;
}

async function archiveLegacyWorkbook(
  libraryPath: string,
  workbookPath: string
): Promise<void> {
  const safeStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = path.join(
    libraryPath,
    "backups",
    `inventory-legacy-${safeStamp}.xlsx`
  );
  await mkdir(path.dirname(archivePath), { recursive: true });
  await copyFile(workbookPath, archivePath);
}

export async function saveWorkbook(
  libraryPath: string,
  workbook: ExcelJS.Workbook
): Promise<void> {
  await ensureLibrary(libraryPath);
  await backupWorkbook(libraryPath);
  await pruneSnapshots(libraryPath, "xlsx");
  await workbook.xlsx.writeFile(path.join(libraryPath, WORKBOOK_FILE));
}

export function createEmptyWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Inventario de Arte";
  workbook.created = new Date();
  workbook.modified = new Date();

  for (const [sheetName, headers] of Object.entries(SHEETS)) {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  const lookups = workbook.getWorksheet("Lookups");
  DEFAULT_LOOKUPS.forEach((lookup) =>
    lookups?.addRow([lookup.category, lookup.value, lookup.label])
  );

  return workbook;
}

export function ensureWorkbookShape(workbook: ExcelJS.Workbook): void {
  for (const [sheetName, headers] of Object.entries(SHEETS)) {
    let sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      sheet = workbook.addWorksheet(sheetName);
      sheet.addRow(headers);
      continue;
    }

    const existingHeaders = getHeaderRow(sheet);
    const missingHeaders = headers.filter(
      (header) => !existingHeaders.includes(header)
    );

    if (existingHeaders.length === 0) {
      sheet.insertRow(1, headers);
    } else {
      missingHeaders.forEach((header) => {
        sheet.getRow(1).getCell(sheet.columnCount + 1).value = header;
      });
    }
  }

  const lookups = workbook.getWorksheet("Lookups");
  if (lookups && lookups.rowCount <= 1) {
    DEFAULT_LOOKUPS.forEach((lookup) =>
      lookups.addRow([lookup.category, lookup.value, lookup.label])
    );
  }
}

export function rowsToObjects<T extends object>(
  workbook: ExcelJS.Workbook,
  sheetName: SheetName
): T[] {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return [];

  const headers = getHeaderRow(sheet);
  const rows: T[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const record: Record<string, unknown> = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      const value = normalizeCellValue(row.getCell(index + 1).value);
      record[header] = value;
      if (value !== "") hasValue = true;
    });

    if (hasValue) rows.push(record as T);
  });

  return rows;
}

export function replaceSheetRows<T extends object>(
  workbook: ExcelJS.Workbook,
  sheetName: SheetName,
  rows: T[]
): void {
  const headers = SHEETS[sheetName];
  let sheet = workbook.getWorksheet(sheetName);
  if (!sheet) sheet = workbook.addWorksheet(sheetName);

  sheet.spliceRows(1, sheet.rowCount);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };

  rows.forEach((record) => {
    const row = record as Record<string, unknown>;
    sheet?.addRow(headers.map((header) => serializeCellValue(row[header])));
  });
}

export function getWorkbookPath(libraryPath: string): string {
  return path.join(libraryPath, WORKBOOK_FILE);
}

function getHeaderRow(sheet: ExcelJS.Worksheet): string[] {
  const row = sheet.getRow(1);
  const headers: string[] = [];
  row.eachCell((cell) => {
    headers.push(String(cell.value ?? "").trim());
  });
  return headers.filter(Boolean);
}

function normalizeCellValue(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && value.text) return String(value.text);
    if ("result" in value && value.result != null) return String(value.result);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text).join("");
    }
  }
  return String(value);
}

function serializeCellValue(value: unknown): string {
  if (Array.isArray(value)) return value.join("|");
  if (typeof value === "boolean") return value ? "true" : "false";
  return value == null ? "" : String(value);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
