/**
 * Pure HTML builder for solicitudes (PDF + live preview).
 * No Electron imports — safe for main and renderer.
 */

export interface ApplicationPdfRow {
  title: string;
  series: string;
  material: string;
  size: string;
  year: string;
  imageDataUrl?: string;
}

export interface ApplicationPdfStyle {
  fontTitle?: string;
  fontBody?: string;
  titleColor?: string;
  titleBold?: boolean;
  titleItalic?: boolean;
  metaColor?: string;
  labelColor?: string;
  frameBorderColor?: string;
  /** Frame border thickness 1–5 (px). Default 3. Grows inward. */
  frameBorderWidth?: number;
  /** Gap between frame border and painting (px). Grows inward; larger = smaller image. */
  framePadding?: number;
  /** When false, no gray frame border. Default true. */
  showFrame?: boolean;
}

export interface ApplicationPdfSection {
  heading: string;
  bodyHtml: string;
}

export interface ApplicationCoverLineStyle {
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
}

export interface ApplicationCoverStylesPayload {
  above?: ApplicationCoverLineStyle;
  title?: ApplicationCoverLineStyle;
  below?: ApplicationCoverLineStyle;
  belowRight?: ApplicationCoverLineStyle;
  second?: ApplicationCoverLineStyle;
}

export interface ApplicationPdfPayload {
  /** Title shown on the PDF cover (not the internal list name). */
  title: string;
  /** Línea por encima del título */
  coverSubtitle?: string;
  /** A la derecha de la línea por debajo */
  coverDate?: string;
  /** Segunda línea */
  coverNote?: string;
  /** Línea por debajo (izquierda) */
  organization?: string;
  coverStyles?: ApplicationCoverStylesPayload;
  sections?: ApplicationPdfSection[];
  /** @deprecated */
  textAboutWorks?: string;
  textAboutProject?: string;
  headingAboutWorks?: string;
  headingAboutProject?: string;
  headingWorks?: string;
  seriesPrefix?: string;
  noSeriesLabel?: string;
  sizeLabel?: string;
  yearLabel?: string;
  typeLabel?: string;
  tocLabel?: string;
  sectionsLabel?: string;
  emptyImageLabel?: string;
  /**
   * Cover TOC for paintings:
   * - list: one row per work
   * - bySeries: one row per series + count
   * - worksOnly: single works heading → first work page
   */
  tocWorksMode?: "list" | "bySeries" | "worksOnly";
  /** e.g. "cuadro" / "cuadros" for bySeries labels */
  workSingularLabel?: string;
  workPluralLabel?: string;
  /** Running header / footer: artist name */
  headerArtistName?: string;
  /** Running header / footer: competition / call name */
  headerCompetition?: string;
  style?: ApplicationPdfStyle;
  rows: ApplicationPdfRow[];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cssQuoteFont(font: string): string {
  const clean = font.replace(/["']/g, "").trim();
  if (!clean) return "Georgia";
  const quoted = /[\s,]/.test(clean) ? `"${clean}"` : clean;
  if (/courier/i.test(clean)) return `${quoted}, monospace`;
  if (/helvetica|arial|verdana|futura/i.test(clean)) {
    return `${quoted}, sans-serif`;
  }
  return `${quoted}, serif`;
}

function coverLineCss(
  line: ApplicationCoverLineStyle | undefined,
  defaults: {
    font: string;
    sizePt: number;
    bold?: boolean;
    italic?: boolean;
    color: string;
    extra?: string;
  }
): string {
  const font = cssQuoteFont(line?.font?.trim() || defaults.font);
  const sizePt =
    line?.sizePt != null && Number.isFinite(line.sizePt)
      ? line.sizePt
      : defaults.sizePt;
  const bold = line?.bold ?? defaults.bold ?? false;
  const italic = line?.italic ?? defaults.italic ?? false;
  const parts = [
    `font-family:${font}`,
    `font-size:${sizePt}pt`,
    `font-weight:${bold ? 700 : 500}`,
    `font-style:${italic ? "italic" : "normal"}`,
    `color:${defaults.color}`
  ];
  if (defaults.extra) parts.push(defaults.extra);
  return parts.join(";");
}

export type ApplicationTocWorksMode = "list" | "bySeries" | "worksOnly";

export function buildWorkTocEntries(
  workPages: Array<{ title: string; series: string; pageNum: number }>,
  options: {
    mode?: ApplicationTocWorksMode;
    worksHeading: string;
    noSeriesLabel: string;
    singular: string;
    plural: string;
  }
): Array<{ title: string; pageNum: number }> {
  if (workPages.length === 0) return [];
  const mode = options.mode || "list";
  if (mode === "worksOnly") {
    return [{ title: options.worksHeading, pageNum: workPages[0].pageNum }];
  }
  if (mode === "bySeries") {
    const groups: Array<{ name: string; count: number; pageNum: number }> = [];
    const byKey = new Map<string, { name: string; count: number; pageNum: number }>();
    for (const row of workPages) {
      const name = row.series?.trim() || options.noSeriesLabel;
      const key = name.toLowerCase();
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        const group = { name, count: 1, pageNum: row.pageNum };
        byKey.set(key, group);
        groups.push(group);
      }
    }
    return groups.map((group) => ({
      title: `${group.name} (${group.count} ${
        group.count === 1 ? options.singular : options.plural
      })`,
      pageNum: group.pageNum
    }));
  }
  return workPages.map((row) => ({ title: row.title, pageNum: row.pageNum }));
}

/** Allow only basic formatting tags used by the rich-text editor. */
export function sanitizeRichHtml(html: string): string {
  if (!html) return "";
  let out = String(html);
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/javascript:/gi, "");
  out = out.replace(/<\/?(?!\/?(?:b|strong|i|em|u|br|p|div|span|font)\b)[^>]*>/gi, "");
  out = out.replace(
    /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (_match, _q, doubleStyle, singleStyle) => {
      const raw = doubleStyle ?? singleStyle ?? "";
      const kept: string[] = [];
      for (const part of raw.split(";")) {
        const [prop, ...rest] = part.split(":");
        if (!prop || rest.length === 0) continue;
        const name = prop.trim().toLowerCase();
        const value = rest.join(":").trim();
        if (!value) continue;
        if (name === "color" && /^#[0-9a-f]{3,8}$/i.test(value)) {
          kept.push(`color: ${value}`);
        } else if (
          name === "font-size" &&
          /^\d+(\.\d+)?(px|pt|em|rem|%)$/i.test(value)
        ) {
          kept.push(`font-size: ${value}`);
        } else if (name === "font-weight" && /^(bold|normal|[1-9]00)$/i.test(value)) {
          kept.push(`font-weight: ${value}`);
        } else if (name === "font-style" && /^(italic|normal)$/i.test(value)) {
          kept.push(`font-style: ${value}`);
        } else if (
          name === "text-decoration" &&
          /^(underline|none|line-through)$/i.test(value)
        ) {
          kept.push(`text-decoration: ${value}`);
        } else         if (
          name === "font-family" &&
          /^[a-z0-9\s,"'_-]+$/i.test(value) &&
          value.length < 80
        ) {
          const cleaned = value.replace(/^["']|["']$/g, "").trim();
          const quoted = /\s/.test(cleaned) ? `"${cleaned}"` : cleaned;
          kept.push(`font-family: ${quoted}`);
        }
      }
      return kept.length ? ` style="${kept.join("; ")}"` : "";
    }
  );
  out = out.replace(/<font\b([^>]*)>/gi, (_match, attrs: string) => {
    const face = /\bface\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(attrs);
    const name = (face?.[2] || face?.[3] || face?.[4] || "").trim();
    if (!name || !/^[a-z0-9\s,"'_-]+$/i.test(name)) return "<span>";
    const quoted = /\s/.test(name) ? `"${name.replace(/"/g, "")}"` : name;
    return `<span style="font-family: ${quoted}">`;
  });
  out = out.replace(/<\/font>/gi, "</span>");
  return out;
}

export function richHtmlToPlainText(html: string): string {
  return sanitizeRichHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveSections(payload: ApplicationPdfPayload): ApplicationPdfSection[] {
  if (Array.isArray(payload.sections) && payload.sections.length > 0) {
    return payload.sections
      .map((section) => ({
        heading: String(section.heading ?? "").trim(),
        bodyHtml: sanitizeRichHtml(section.bodyHtml ?? "")
      }))
      .filter((section) => section.heading || section.bodyHtml.trim());
  }
  const legacy: ApplicationPdfSection[] = [];
  if (payload.textAboutWorks?.trim()) {
    legacy.push({
      heading: payload.headingAboutWorks?.trim() || "Sobre las obras",
      bodyHtml: `<p>${escapeHtml(payload.textAboutWorks).replace(/\n/g, "<br/>")}</p>`
    });
  }
  if (payload.textAboutProject?.trim()) {
    legacy.push({
      heading: payload.headingAboutProject?.trim() || "Sobre el proyecto",
      bodyHtml: `<p>${escapeHtml(payload.textAboutProject).replace(/\n/g, "<br/>")}</p>`
    });
  }
  return legacy;
}

function pageFooter(
  n: number,
  artistName?: string,
  competition?: string
): string {
  const left = artistName?.trim() || "";
  const right = competition?.trim() || "";
  return `<div class="page-foot">
    <span class="foot-left">${escapeHtml(left)}</span>
    <span class="page-num">${n}</span>
    <span class="foot-right">${escapeHtml(right)}</span>
  </div>`;
}

export function buildApplicationHtml(payload: ApplicationPdfPayload): string {
  const emptyLabel = payload.emptyImageLabel?.trim() || "Sin imagen";
  const seriesPrefix = payload.seriesPrefix?.trim() || "Serie";
  const noSeriesLabel = payload.noSeriesLabel?.trim() || "sin serie";
  const sizeLabel = payload.sizeLabel?.trim() || "Tamaño";
  const yearLabel = payload.yearLabel?.trim() || "Año";
  const typeLabel = payload.typeLabel?.trim() || "Técnica";
  const tocLabel = payload.tocLabel?.trim() || "Índice";
  const sectionsLabel = payload.sectionsLabel?.trim() || "Textos";
  const worksHeading = payload.headingWorks?.trim() || "Obras";
  const artistName = payload.headerArtistName?.trim() || "";
  const competition = payload.headerCompetition?.trim() || "";
  const style = payload.style ?? {};
  const fontTitle = style.fontTitle || "Georgia, 'Times New Roman', serif";
  const fontBody = style.fontBody || "Georgia, 'Times New Roman', serif";
  const titleColor = style.titleColor || "#1a1a1a";
  const metaColor = style.metaColor || "#7a7368";
  const labelColor = style.labelColor || "#9a9286";
  const frameBorder = style.frameBorderColor || "#d0c9bb";
  const frameBorderWidth = Math.max(
    1,
    Math.min(5, Math.round(Number(style.frameBorderWidth ?? 3)))
  );
  const framePadding = Math.max(0, Math.min(40, Number(style.framePadding ?? 12)));
  const showFrame = style.showFrame !== false;
  const frameBorderCss = showFrame
    ? `${frameBorderWidth}px solid ${frameBorder}`
    : "none";
  const coverStyles = payload.coverStyles ?? {};
  const titleLineDefaults = {
    font: (style.fontTitle || "Georgia").replace(/,.*/, "").trim() || "Georgia",
    sizePt: 28,
    bold: style.titleBold !== false,
    italic: Boolean(style.titleItalic),
    color: titleColor
  };
  const bodyFontDefault =
    (style.fontBody || "Georgia").replace(/,.*/, "").trim() || "Georgia";
  const aboveCss = coverLineCss(coverStyles.above, {
    font: bodyFontDefault,
    sizePt: 10,
    bold: true,
    color: metaColor,
    extra: "letter-spacing:0.14em;text-transform:uppercase;margin:0 0 5mm"
  });
  const titleCss = coverLineCss(coverStyles.title, {
    ...titleLineDefaults,
    extra: "letter-spacing:-0.025em;line-height:1.08;margin:0 0 6mm;overflow-wrap:anywhere"
  });
  const belowCss = coverLineCss(coverStyles.below, {
    font: bodyFontDefault,
    sizePt: 11.5,
    color: metaColor
  });
  const secondCss = coverLineCss(coverStyles.second, {
    font: bodyFontDefault,
    sizePt: 10.5,
    color: metaColor,
    extra: "line-height:1.45;margin:5mm 0 0;max-width:100%"
  });
  const sections = resolveSections(payload);

  // Page map: 1 = cover, then sections, then works.
  let page = 1;
  const sectionPages = sections.map((section) => {
    page += 1;
    return { ...section, pageNum: page };
  });
  const workPages = payload.rows.map((row) => {
    page += 1;
    return { ...row, pageNum: page };
  });

  const sectionTocRows: string[] = [];
  for (const section of sectionPages) {
    if (!section.heading) continue;
    sectionTocRows.push(`
      <a class="toc-row" href="#app-page-${section.pageNum}">
        <span class="toc-title">${escapeHtml(section.heading)}</span>
        <span class="toc-leader" aria-hidden="true"></span>
        <span class="toc-num">${section.pageNum}</span>
      </a>`);
  }
  const workTocEntries = buildWorkTocEntries(workPages, {
    mode: payload.tocWorksMode || "list",
    worksHeading,
    noSeriesLabel,
    singular: payload.workSingularLabel?.trim() || "cuadro",
    plural: payload.workPluralLabel?.trim() || "cuadros"
  });
  const workTocRows = workTocEntries.map(
    (entry) => `
      <a class="toc-row" href="#app-page-${entry.pageNum}">
        <span class="toc-title">${escapeHtml(entry.title)}</span>
        <span class="toc-leader" aria-hidden="true"></span>
        <span class="toc-num">${entry.pageNum}</span>
      </a>`
  );
  const tocHtml = [
    sectionTocRows.length
      ? `<div class="toc-group">
          <p class="toc-group-label">${escapeHtml(sectionsLabel)}</p>
          ${sectionTocRows.join("")}
        </div>`
      : "",
    workTocRows.length
      ? `<div class="toc-group">
          ${
            payload.tocWorksMode === "worksOnly"
              ? ""
              : `<p class="toc-group-label">${escapeHtml(worksHeading)}</p>`
          }
          ${workTocRows.join("")}
        </div>`
      : ""
  ].join("");

  const sectionHtml = sectionPages
    .map(
      (section) => `
      <section class="page section-page" id="app-page-${section.pageNum}">
        <div class="page-main">
          ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ""}
          <div class="rich">${section.bodyHtml || ""}</div>
        </div>
        ${pageFooter(section.pageNum, artistName, competition)}
      </section>`
    )
    .join("\n");

  const worksHtml = workPages
    .map((row) => {
      const img = row.imageDataUrl
        ? `<div class="frame-box"><div class="frame"><img src="${row.imageDataUrl}" alt="" /></div></div>`
        : `<div class="frame-box"><div class="frame frame-empty">${escapeHtml(emptyLabel)}</div></div>`;
      const seriesText = row.series?.trim() || noSeriesLabel;
      return `
      <section class="page work-page" id="app-page-${row.pageNum}">
        <div class="page-main work-main">
          <header class="work-head">
            <p class="works-label">${escapeHtml(worksHeading)}</p>
            <h2>${escapeHtml(row.title)}</h2>
            <div class="meta">${escapeHtml(seriesPrefix)}: ${escapeHtml(seriesText)}</div>
            <div class="meta">${escapeHtml(typeLabel)}: ${escapeHtml(
              row.material?.trim() || "—"
            )}</div>
            <div class="meta">${escapeHtml(sizeLabel)}: ${escapeHtml(
              row.size?.trim() || "—"
            )}</div>
            <div class="meta">${escapeHtml(yearLabel)}: ${escapeHtml(
              row.year?.trim() || "—"
            )}</div>
          </header>
          <div class="frame-slot">${img}</div>
        </div>
        ${pageFooter(row.pageNum, artistName, competition)}
      </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    /*
      Page margins live on @page so Chromium's PDF never clips content at the
      physical edge (that was shaving the frame's right border and the footer).
    */
    @page { size: A4; margin: 12mm 16mm 14mm 16mm; }
    * { box-sizing: border-box; }
    html, body {
      color: #2a2620;
      font-family: ${fontBody};
      font-size: 12pt;
      line-height: 1.45;
      margin: 0;
      padding: 0;
      width: 100%;
    }
    .page {
      background: #fff;
      break-after: page;
      display: flex;
      flex-direction: column;
      min-height: 257mm;
      overflow: visible;
      padding: 0;
      page-break-after: always;
      page-break-inside: avoid;
      position: relative;
      width: 100%;
    }
    .page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .page-main {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
      overflow: visible;
      width: 100%;
    }
    .page-num {
      color: #8a8278;
      font-size: 9.5pt;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    .page-foot {
      align-items: center;
      color: #8a8278;
      display: grid;
      flex: 0 0 auto;
      font-size: 8.5pt;
      gap: 4mm;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      margin-top: auto;
      max-width: 100%;
      min-height: 6mm;
      padding-top: 5mm;
      width: 100%;
    }
    .page-foot .foot-left {
      overflow: hidden;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .page-foot .foot-right {
      overflow: hidden;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cover .page-main {
      display: grid;
      gap: 4mm;
      grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
    }
    .cover-hero {
      align-content: center;
      display: grid;
      max-width: 100%;
      min-height: 0;
      overflow: hidden;
      padding: 2mm 0;
    }
    .cover-kicker {
      margin: 0 0 5mm;
    }
    .cover-title {
      margin: 0 0 6mm;
    }
    .cover-meta {
      align-items: baseline;
      display: flex;
      flex-wrap: wrap;
      gap: 3mm 8mm;
      justify-content: space-between;
      width: 100%;
    }
    .cover-below-right {
      margin-left: auto;
      text-align: right;
    }
    .cover-note {
      margin: 5mm 0 0;
      max-width: 100%;
    }
    .cover-toc {
      border-top: 1px solid #d8d2c6;
      min-height: 0;
      overflow: hidden;
      padding-top: 6mm;
      width: 100%;
    }
    .toc-label {
      color: ${metaColor};
      font-size: 9pt;
      font-weight: 600;
      letter-spacing: 0.16em;
      margin: 0 0 4mm;
      text-transform: uppercase;
    }
    .toc { display: block; max-width: 100%; width: 100%; }
    .toc-group { margin: 0 0 5mm; }
    .toc-group:last-child { margin-bottom: 0; }
    .toc-group-label {
      color: ${labelColor};
      font-size: 8.5pt;
      font-weight: 600;
      letter-spacing: 0.14em;
      margin: 0 0 2mm;
      text-transform: uppercase;
    }
    .toc-row {
      align-items: baseline;
      color: ${titleColor};
      display: flex;
      font-size: 11pt;
      gap: 2mm;
      line-height: 1.35;
      margin: 0 0 2mm;
      max-width: 100%;
      text-decoration: none;
      width: 100%;
    }
    a.toc-row:hover .toc-title {
      text-decoration: underline;
    }
    .toc-title {
      flex: 0 1 auto;
      max-width: 78%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .toc-leader {
      border-bottom: 1px dotted #c4bdb0;
      flex: 1 1 auto;
      min-width: 8mm;
      position: relative;
      top: -2px;
    }
    .toc-num {
      color: ${metaColor};
      flex: 0 0 auto;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .section-page h2 {
      border-bottom: 1px solid #e0d9cd;
      color: ${titleColor};
      font-family: ${fontTitle};
      font-size: 17pt;
      font-weight: 700;
      margin: 0 0 5mm;
      padding-bottom: 3mm;
    }
    .section-page .rich {
      color: #3a3530;
      font-size: 12pt;
      text-align: justify;
    }
    .section-page .rich p { margin: 0 0 0.65em; }
    .section-page .rich p:last-child { margin-bottom: 0; }

    .work-main {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 3mm;
      min-height: 0;
      min-width: 0;
      width: 100%;
    }
    .work-head {
      flex: 0 0 auto;
      max-width: 100%;
      min-width: 0;
    }
    .works-label {
      color: ${labelColor};
      font-size: 8.5pt;
      font-weight: 500;
      letter-spacing: 0.1em;
      margin: 0 0 1.5mm;
      text-transform: uppercase;
    }
    .work-head h2 {
      color: ${titleColor};
      font-family: ${fontTitle};
      font-size: 15pt;
      font-weight: 700;
      line-height: 1.15;
      margin: 0 0 1.5mm;
      overflow-wrap: anywhere;
    }
    .work-head .meta {
      color: ${metaColor};
      display: block;
      font-size: 10.5pt;
      line-height: 1.4;
      margin: 0 0 0.3mm;
      overflow-wrap: anywhere;
    }
    /*
      Square frame at 95% width, centered; painting inscribed.
      .frame-box uses the padding-top % square trick so Chromium printToPDF
      (which often ignores aspect-ratio) still keeps a real square.
      Border + padding use border-box so thickness grows inward.
    */
    .frame-slot {
      align-items: center;
      display: flex;
      flex: 1 1 auto;
      justify-content: center;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
      padding: 2mm 0 0;
      width: 100%;
    }
    .frame-box {
      flex: 0 0 auto;
      margin: 0 auto;
      max-width: 95%;
      position: relative;
      width: 95%;
    }
    .frame-box::before {
      content: "";
      display: block;
      padding-top: 100%;
    }
    .frame {
      align-items: center;
      border: ${frameBorderCss};
      box-sizing: border-box;
      display: flex;
      inset: 0;
      justify-content: center;
      overflow: hidden;
      padding: ${framePadding}px;
      position: absolute;
    }
    .frame img {
      display: block;
      height: 100%;
      max-height: 100%;
      max-width: 100%;
      object-fit: contain;
      object-position: center;
      width: 100%;
    }
    .frame.frame-empty {
      color: #9a9286;
      font-style: italic;
    }

    @media screen {
      body {
        background: #e6e0d4;
        padding: 16px;
      }
      /* Preview card = full A4; inner padding mirrors @page margins. */
      .page {
        box-shadow: 0 8px 28px rgba(30, 24, 16, 0.12);
        height: 297mm;
        margin: 0 0 18px;
        max-width: 210mm;
        min-height: 297mm;
        overflow: hidden;
        padding: 12mm 16mm 14mm;
        transform-origin: top left;
        width: 210mm;
      }
    }

    @media print {
      html, body {
        background: #fff !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
      }
      .page {
        box-shadow: none !important;
        /* Exact printable height inside @page margins so the footer stays on-page. */
        height: 271mm !important;
        margin: 0 !important;
        max-height: 271mm !important;
        max-width: none !important;
        min-height: 271mm !important;
        overflow: hidden !important;
        padding: 0 0 11mm !important;
        position: relative !important;
        transform: none !important;
        width: 100% !important;
      }
      .page-main {
        display: flex !important;
        flex: 1 1 auto !important;
        flex-direction: column !important;
        height: 100% !important;
        max-height: 100% !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }
      .work-main {
        display: flex !important;
        flex: 1 1 auto !important;
        flex-direction: column !important;
        height: 100% !important;
        min-height: 0 !important;
      }
      .frame-slot {
        align-items: center !important;
        display: flex !important;
        flex: 1 1 auto !important;
        justify-content: center !important;
        min-height: 0 !important;
        overflow: hidden !important;
        padding: 2mm 0 0 !important;
        width: 100% !important;
      }
      .frame-box {
        /* Fixed square in mm — print engines honor this; aspect-ratio often does not. */
        height: 160mm !important;
        margin: 0 auto !important;
        max-width: 95% !important;
        padding: 0 !important;
        position: relative !important;
        width: 160mm !important;
      }
      .frame-box::before {
        display: none !important;
        padding-top: 0 !important;
      }
      .frame {
        border: ${frameBorderCss} !important;
        box-sizing: border-box !important;
        height: 100% !important;
        inset: 0 !important;
        padding: ${framePadding}px !important;
        position: absolute !important;
        width: 100% !important;
      }
      .frame img {
        height: 100% !important;
        object-fit: contain !important;
        width: 100% !important;
      }
      .page-foot {
        bottom: 0 !important;
        left: 0 !important;
        margin-top: 0 !important;
        padding-top: 2mm !important;
        position: absolute !important;
        right: 0 !important;
        width: 100% !important;
      }
      .page.cover .page-foot {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <section class="page cover">
    <div class="page-main">
      <div class="cover-hero">
        ${
          payload.coverSubtitle?.trim()
            ? `<p class="cover-kicker" style="${aboveCss}">${escapeHtml(payload.coverSubtitle.trim())}</p>`
            : ""
        }
        <h1 class="cover-title" style="${titleCss}">${escapeHtml(payload.title || "Solicitud")}</h1>
        ${
          payload.organization?.trim()
            ? `<div class="cover-meta"><span class="cover-below" style="${belowCss}">${escapeHtml(payload.organization.trim())}</span></div>`
            : ""
        }
        ${
          payload.coverNote?.trim()
            ? `<p class="cover-note" style="${secondCss}">${escapeHtml(payload.coverNote.trim())}</p>`
            : ""
        }
      </div>
      <div class="cover-toc">
        <p class="toc-label">${escapeHtml(tocLabel)}</p>
        <div class="toc">${tocHtml || `<p class="cover-line">—</p>`}</div>
      </div>
    </div>
    ${"" /* cover: no footer */}
  </section>
  ${sectionHtml}
  ${worksHtml}
  <script>
    (function () {
      window.__previewZoom = 1;
      function fitPages() {
        if (window.matchMedia && window.matchMedia("print").matches) return;
        var pages = document.querySelectorAll(".page");
        if (!pages.length) return;
        var viewW = document.documentElement.clientWidth;
        var avail = Math.max(280, viewW - 32);
        var pageWidth = pages[0].offsetWidth || 794;
        var fit = Math.min(1, avail / pageWidth);
        var zoom = Number(window.__previewZoom) || 1;
        var scale = fit * zoom;
        document.body.style.display = "flex";
        document.body.style.flexDirection = "column";
        document.body.style.alignItems = "center";
        document.body.style.width = "100%";
        document.body.style.boxSizing = "border-box";
        document.body.style.overflowX = "hidden";
        pages.forEach(function (page) {
          page.style.transformOrigin = "top center";
          page.style.transform = "scale(" + scale + ")";
          page.style.marginLeft = "0";
          page.style.marginRight = "0";
          page.style.marginBottom =
            Math.round(page.offsetHeight * (scale - 1) + 18) + "px";
        });
      }
      /** Size painting frames to a centered square before PDF print. */
      window.__preparePrintLayout = function () {
        document.body.style.display = "";
        document.body.style.flexDirection = "";
        document.body.style.alignItems = "";
        document.body.style.width = "";
        document.body.style.overflowX = "";
        document.querySelectorAll(".page").forEach(function (page) {
          page.style.transform = "";
          page.style.marginLeft = "";
          page.style.marginRight = "";
          page.style.marginBottom = "";
        });
        document.querySelectorAll(".work-page").forEach(function (page) {
          var box = page.querySelector(".frame-box");
          var frame = page.querySelector(".frame");
          var head = page.querySelector(".work-head");
          if (!box || !frame) return;
          var pageW = page.clientWidth || 794;
          var pageH = page.clientHeight || 1023;
          var headH = head ? head.offsetHeight : 0;
          var side = Math.floor(Math.min(pageW * 0.95, Math.max(120, pageH - headH - 48)));
          side = Math.max(140, side);
          box.style.setProperty("width", side + "px", "important");
          box.style.setProperty("height", side + "px", "important");
          box.style.setProperty("max-width", "95%", "important");
          box.style.setProperty("margin-left", "auto", "important");
          box.style.setProperty("margin-right", "auto", "important");
          frame.style.setProperty("position", "absolute", "important");
          frame.style.setProperty("inset", "0", "important");
          frame.style.setProperty("width", "100%", "important");
          frame.style.setProperty("height", "100%", "important");
          frame.style.setProperty("box-sizing", "border-box", "important");
        });
      };
      window.setPreviewZoom = function (zoom) {
        window.__previewZoom = Math.max(0.4, Math.min(2.5, Number(zoom) || 1));
        fitPages();
      };
      window.addEventListener("resize", fitPages);
      if (document.readyState === "complete") fitPages();
      else window.addEventListener("load", fitPages);
      setTimeout(fitPages, 50);
      setTimeout(fitPages, 250);
    })();
  </script>
</body>
</html>`;
}
