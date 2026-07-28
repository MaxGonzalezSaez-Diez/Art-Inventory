/**
 * Clean, printable Certificate of Authenticity PDF for a single artwork.
 */
import {
  BrowserWindow,
  dialog,
  shell,
  type SaveDialogOptions
} from "electron";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import path from "path";
import { makeGeneratedFileEditable } from "./makeFileEditable";

export type CertificateLang = "es" | "en" | "de";

export interface CertificatePayload {
  title: string;
  year?: string;
  medium?: string;
  size?: string;
  series?: string;
  /** If omitted, derived from editionMode / copyNumber. */
  edition?: string;
  editionMode?: "unique" | "multiple";
  editionCount?: number;
  /** Which copy in a multiple edition (1-based). */
  copyNumber?: number;
  /** Optional custom label for that copy (e.g. edition.label). */
  copyLabel?: string;
  artistName?: string;
  language?: CertificateLang;
}

type Copy = {
  langAttr: string;
  title: string;
  untitled: string;
  certify: string;
  series: string;
  yearLabel: string;
  sizeLabel: string;
  mediumLabel: string;
  editionLabel: string;
  unique: string;
  /** e.g. Exemplar 3 von 12 */
  copyOf: (num: number, total: number) => string;
  artistNamed: (name: string) => string;
  artistAnon: string;
  confirms: string;
  date: string;
  signature: string;
  openQuote: string;
  closeQuote: string;
  saveTitle: string;
  filePrefix: string;
};

const COPY: Record<CertificateLang, Copy> = {
  es: {
    langAttr: "es",
    title: "Certificado de autenticidad",
    untitled: "Sin título",
    certify: "Por la presente se certifica que la obra",
    series: "Serie",
    yearLabel: "Año de producción",
    sizeLabel: "Medidas",
    mediumLabel: "Técnica",
    editionLabel: "Edición",
    unique: "Obra única",
    copyOf: (num, total) => `Ejemplar ${num} de ${total}`,
    artistNamed: (name) =>
      `es una obra original de <strong>${name}</strong>`,
    artistAnon: "es una obra original de la artista",
    confirms:
      "Este documento confirma la autenticidad de la pieza arriba descrita y su autoría.",
    date: "Fecha",
    signature: "Firma de la artista",
    openQuote: "«",
    closeQuote: "»",
    saveTitle: "Guardar certificado de autenticidad",
    filePrefix: "certificado"
  },
  en: {
    langAttr: "en",
    title: "Certificate of Authenticity",
    untitled: "Untitled",
    certify: "This is to certify that the work",
    series: "Series",
    yearLabel: "Year of production",
    sizeLabel: "Dimensions",
    mediumLabel: "Medium",
    editionLabel: "Edition",
    unique: "Unique work",
    copyOf: (num, total) => `Number ${num} of ${total}`,
    artistNamed: (name) => `is an original work by <strong>${name}</strong>`,
    artistAnon: "is an original work by the artist",
    confirms:
      "This document confirms the authenticity and authorship of the work described above.",
    date: "Date",
    signature: "Artist’s signature",
    openQuote: "“",
    closeQuote: "”",
    saveTitle: "Save certificate of authenticity",
    filePrefix: "certificate"
  },
  de: {
    langAttr: "de",
    title: "Echtheitszertifikat",
    untitled: "Ohne Titel",
    certify: "Hiermit wird bestätigt, dass das Werk",
    series: "Serie",
    yearLabel: "Entstehungsjahr",
    sizeLabel: "Maße",
    mediumLabel: "Technik",
    editionLabel: "Auflage",
    unique: "Unikat",
    copyOf: (num, total) => `Exemplar ${num} von ${total}`,
    artistNamed: (name) =>
      `ein Originalwerk von <strong>${name}</strong> ist`,
    artistAnon: "ein Originalwerk der Künstlerin ist",
    confirms:
      "Dieses Dokument bestätigt die Echtheit und Urheberschaft des oben beschriebenen Werks.",
    date: "Datum",
    signature: "Unterschrift der Künstlerin",
    // German low-high quotes: bottom opening, top closing
    openQuote: "„",
    closeQuote: "“",
    saveTitle: "Echtheitszertifikat speichern",
    filePrefix: "zertifikat"
  }
};

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveLang(raw?: string): CertificateLang {
  if (raw === "en" || raw === "de" || raw === "es") return raw;
  return "es";
}

function buildHtml(payload: CertificatePayload): string {
  const t = COPY[resolveLang(payload.language)];
  const title = (payload.title || t.untitled).trim() || t.untitled;
  const artist = (payload.artistName || "").trim();
  const year = (payload.year || "").trim();
  const medium = (payload.medium || "").trim();
  const size = (payload.size || "").trim();
  const series = (payload.series || "").trim();
  const total = Math.max(1, Number(payload.editionCount) || 1);
  const copyNum = Math.max(1, Number(payload.copyNumber) || 1);
  const copyLabel = (payload.copyLabel || "").trim();

  let edition = (payload.edition || "").trim();
  if (!edition) {
    if (payload.editionMode === "multiple") {
      edition = t.copyOf(Math.min(copyNum, total), total);
      // Only append a custom label when it adds info beyond "n of total"
      // (e.g. a named state). Skip bare "9/10" / "9 de 10" style labels.
      if (copyLabel) {
        const normalized = copyLabel.replace(/\s+/g, "").toLowerCase();
        const bareFraction = `${copyNum}/${total}`;
        const alreadySaid =
          normalized === bareFraction ||
          normalized === `${copyNum}de${total}` ||
          normalized === `${copyNum}of${total}` ||
          normalized === `${copyNum}von${total}`;
        if (!alreadySaid && copyLabel !== edition) {
          edition = `${edition} (${copyLabel})`;
        }
      }
    } else {
      edition = t.unique;
    }
  }

  const detailRow = (label: string, value: string) =>
    `          <div class="detail-label">${escapeHtml(label)}</div>` +
    `<div class="detail-value">${escapeHtml(value)}</div>`;

  const detailLines: string[] = [];
  if (year) detailLines.push(detailRow(t.yearLabel, year));
  if (medium) detailLines.push(detailRow(t.mediumLabel, medium));
  if (size) detailLines.push(detailRow(t.sizeLabel, size));
  if (series) detailLines.push(detailRow(t.series, series));
  detailLines.push(detailRow(t.editionLabel, edition));

  const artistClause = artist
    ? t.artistNamed(escapeHtml(artist))
    : t.artistAnon;

  return `<!DOCTYPE html>
<html lang="${t.langAttr}">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    /*
      Editorial pairing: a high-contrast display serif for the headings and an
      old-style text serif for reading copy. Both ship with macOS; the stacks
      fall back to widely installed serifs elsewhere.
    */
    html, body {
      background: #fff;
      color: #17150f;
      font-family: "Hoefler Text", Baskerville, "Palatino Linotype", Palatino,
        Georgia, "Times New Roman", serif;
      font-kerning: normal;
      height: 100%;
      margin: 0;
      padding: 0;
      text-rendering: geometricPrecision;
      width: 100%;
    }
    .display {
      font-family: Didot, "Bodoni 72", "Hoefler Text", Baskerville, Georgia,
        "Times New Roman", serif;
    }
    .page {
      display: flex;
      flex-direction: column;
      min-height: 297mm;
      padding: 16mm;
      width: 210mm;
    }
    /* Double hairline frame: the classic engraved-certificate border. */
    .frame {
      border: 1.6pt solid #1d1a15;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      padding: 2.4mm;
    }
    .frame-inner {
      border: 0.5pt solid #9a9184;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      padding: 15mm 17mm 13mm;
      text-align: left;
    }
    .letterhead {
      border-bottom: 0.5pt solid #cdc5b6;
      flex: 0 0 auto;
      padding-bottom: 4mm;
    }
    .letterhead .who {
      font-size: 9.5pt;
      font-weight: 400;
      letter-spacing: 0.3em;
      text-transform: uppercase;
    }
    .main {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      justify-content: center;
      padding: 11mm 0;
    }
    h1 {
      font-size: 23pt;
      font-weight: 400;
      letter-spacing: 0.22em;
      line-height: 1.28;
      margin: 0 0 4mm;
      text-transform: uppercase;
    }
    .rule {
      border: 0;
      border-top: 1.2pt solid #1d1a15;
      height: 0;
      margin: 0 0 11mm;
      width: 30mm;
    }
    .lede {
      font-size: 11.5pt;
      line-height: 1.75;
      margin: 0;
      max-width: 138mm;
    }
    .work-title {
      font-size: 18pt;
      font-style: italic;
      font-weight: 400;
      line-height: 1.32;
      margin: 6mm 0 9mm;
      overflow-wrap: anywhere;
    }
    .details {
      border-left: 0.5pt solid #cdc5b6;
      display: grid;
      gap: 3.4mm 7mm;
      /* Wide enough for the longest label in any language, e.g. AÑO DE PRODUCCIÓN. */
      grid-template-columns: 50mm minmax(0, 1fr);
      margin: 0 0 10mm;
      padding-left: 7mm;
    }
    .detail-label {
      color: #6b6355;
      font-size: 8.5pt;
      letter-spacing: 0.14em;
      line-height: 1.5;
      padding-top: 0.7mm;
      text-transform: uppercase;
    }
    .detail-value {
      font-size: 11.5pt;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .closing {
      font-size: 11.5pt;
      line-height: 1.75;
      margin: 0 0 4mm;
      max-width: 138mm;
    }
    .closing strong { font-weight: 600; }
    .confirm {
      color: #4a453e;
      font-size: 10pt;
      font-style: italic;
      line-height: 1.7;
      margin: 0;
      max-width: 138mm;
    }
    .foot {
      align-items: start;
      display: grid;
      flex: 0 0 auto;
      gap: 16mm;
      grid-template-columns: 1fr 1fr;
    }
    /* Equal writing band so both underlines sit on the same baseline. */
    .field-line {
      border-bottom: 0.7pt solid #1d1a15;
      height: 18mm;
      margin: 0;
      width: 100%;
    }
    .field-label {
      color: #6b6355;
      font-size: 8pt;
      letter-spacing: 0.18em;
      margin-top: 2.5mm;
      text-transform: uppercase;
    }
    .field-value {
      font-size: 10.5pt;
      margin-top: 1.5mm;
      min-height: 1.2em;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="frame">
      <div class="frame-inner">
        <div class="letterhead">
          <div class="who display">${
            artist ? escapeHtml(artist) : escapeHtml(t.title)
          }</div>
        </div>
        <div class="main">
          <h1 class="display">${escapeHtml(t.title)}</h1>
          <hr class="rule" />
          <p class="lede">${escapeHtml(t.certify)}</p>
          <p class="work-title display">${escapeHtml(t.openQuote)}${escapeHtml(
            title
          )}${escapeHtml(t.closeQuote)}</p>
          <div class="details">
${detailLines.join("\n")}
          </div>
          <p class="closing">${artistClause}.</p>
          <p class="confirm">${escapeHtml(t.confirms)}</p>
        </div>
        <div class="foot">
          <div class="field">
            <div class="field-line"></div>
            <div class="field-label">${escapeHtml(t.signature)}</div>
            <div class="field-value">${
              artist ? escapeHtml(artist) : "&nbsp;"
            }</div>
          </div>
          <div class="field">
            <div class="field-line"></div>
            <div class="field-label">${escapeHtml(t.date)}</div>
            <div class="field-value">&nbsp;</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function generateCertificateOfAuthenticity(
  parentWindow: BrowserWindow | null,
  payload: CertificatePayload
): Promise<string | null> {
  const lang = resolveLang(payload.language);
  const t = COPY[lang];
  const safeName =
    `${t.filePrefix}-${(payload.title || "obra")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50)}` || t.filePrefix;

  const options: SaveDialogOptions = {
    title: t.saveTitle,
    defaultPath: `${safeName}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }]
  };

  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) return null;

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true }
  });
  const tempFile = path.join(tmpdir(), `coa-${randomUUID()}.html`);
  try {
    await writeFile(tempFile, buildHtml(payload), "utf8");
    await win.loadFile(tempFile);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: "none" },
      displayHeaderFooter: false
    });
    await writeFile(result.filePath, pdf);
    await makeGeneratedFileEditable(result.filePath);
    void shell.openPath(result.filePath);
    return result.filePath;
  } finally {
    win.destroy();
    void unlink(tempFile).catch(() => undefined);
  }
}
