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
  framePadding?: number;
}

export interface ApplicationPdfSection {
  heading: string;
  bodyHtml: string;
}

export interface ApplicationPdfPayload {
  /** Title shown on the PDF cover (not the internal list name). */
  title: string;
  coverSubtitle?: string;
  coverDate?: string;
  coverNote?: string;
  organization?: string;
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
        } else if (
          name === "font-family" &&
          /^[a-z0-9\s,"'_-]+$/i.test(value) &&
          value.length < 80
        ) {
          kept.push(`font-family: ${value}`);
        }
      }
      return kept.length ? ` style="${kept.join("; ")}"` : "";
    }
  );
  out = out.replace(/<font\b([^>]*)>/gi, (_match, attrs: string) => {
    const face = /\bface\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(attrs);
    const name = (face?.[2] || face?.[3] || face?.[4] || "").trim();
    if (!name || !/^[a-z0-9\s,"'_-]+$/i.test(name)) return "<span>";
    return `<span style="font-family: ${name}">`;
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

function pageFooter(n: number): string {
  return `<div class="page-num">${n}</div>`;
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
  const style = payload.style ?? {};
  const fontTitle = style.fontTitle || "Georgia, 'Times New Roman', serif";
  const fontBody = style.fontBody || "Georgia, 'Times New Roman', serif";
  const titleColor = style.titleColor || "#1a1a1a";
  const metaColor = style.metaColor || "#7a7368";
  const labelColor = style.labelColor || "#9a9286";
  const frameBorder = style.frameBorderColor || "#d0c9bb";
  const framePadding = Math.max(0, Number(style.framePadding ?? 8));
  const coverWeight = style.titleBold === false ? "500" : "700";
  const coverStyle = style.titleItalic ? "italic" : "normal";
  const sections = resolveSections(payload);

  // Page map: 1 = cover, then sections, then works.
  let page = 1;
  const coverPage = page;
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
      <div class="toc-row">
        <span class="toc-title">${escapeHtml(section.heading)}</span>
        <span class="toc-leader" aria-hidden="true"></span>
        <span class="toc-num">${section.pageNum}</span>
      </div>`);
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
      <div class="toc-row">
        <span class="toc-title">${escapeHtml(entry.title)}</span>
        <span class="toc-leader" aria-hidden="true"></span>
        <span class="toc-num">${entry.pageNum}</span>
      </div>`
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
      <section class="page section-page">
        ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ""}
        <div class="rich">${section.bodyHtml || ""}</div>
        ${pageFooter(section.pageNum)}
      </section>`
    )
    .join("\n");

  const worksHtml = workPages
    .map((row) => {
      const img = row.imageDataUrl
        ? `<div class="frame"><div class="frame-pad"><img src="${row.imageDataUrl}" alt="" /></div></div>`
        : `<div class="frame"><div class="frame-pad empty">${escapeHtml(
            emptyLabel
          )}</div></div>`;
      const seriesText = row.series?.trim() || noSeriesLabel;
      return `
      <section class="page work-page">
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
        ${pageFooter(row.pageNum)}
      </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 11mm 12mm 14mm; }
    * { box-sizing: border-box; }
    html, body {
      color: #2a2620;
      font-family: ${fontBody};
      font-size: 12pt;
      line-height: 1.45;
      margin: 0;
    }
    .page {
      break-after: page;
      display: flex;
      flex-direction: column;
      min-height: 272mm;
      page-break-after: always;
      page-break-inside: avoid;
      position: relative;
    }
    .page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .page-num {
      bottom: 0;
      color: #a39b8f;
      font-size: 9.5pt;
      left: 0;
      position: absolute;
      right: 0;
      text-align: center;
    }

    .cover {
      display: grid;
      grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
      padding-bottom: 8mm;
    }
    .cover-hero {
      align-content: center;
      display: grid;
      max-width: 160mm;
      padding: 12mm 0 8mm;
    }
    .cover-kicker {
      color: ${metaColor};
      font-size: 10pt;
      font-weight: 600;
      letter-spacing: 0.14em;
      margin: 0 0 5mm;
      text-transform: uppercase;
    }
    .cover-title {
      color: ${titleColor};
      font-family: ${fontTitle};
      font-size: 32pt;
      font-style: ${coverStyle};
      font-weight: ${coverWeight};
      letter-spacing: -0.025em;
      line-height: 1.08;
      margin: 0 0 7mm;
    }
    .cover-meta {
      align-items: center;
      color: ${metaColor};
      display: flex;
      flex-wrap: wrap;
      font-size: 11.5pt;
      gap: 3mm 8mm;
    }
    .cover-note {
      color: ${metaColor};
      font-size: 10.5pt;
      line-height: 1.45;
      margin: 6mm 0 0;
      max-width: 120mm;
    }
    .cover-toc {
      border-top: 1px solid #d8d2c6;
      min-height: 0;
      overflow: hidden;
      padding-top: 7mm;
    }
    .toc-label {
      color: ${metaColor};
      font-size: 9pt;
      font-weight: 600;
      letter-spacing: 0.16em;
      margin: 0 0 5mm;
      text-transform: uppercase;
    }
    .toc {
      display: block;
      max-width: 145mm;
    }
    .toc-group {
      margin: 0 0 6mm;
    }
    .toc-group:last-child {
      margin-bottom: 0;
    }
    .toc-group-label {
      color: ${labelColor};
      font-size: 8.5pt;
      font-weight: 600;
      letter-spacing: 0.14em;
      margin: 0 0 2.5mm;
      text-transform: uppercase;
    }
    .toc-row {
      align-items: baseline;
      color: ${titleColor};
      display: flex;
      font-size: 11pt;
      gap: 2mm;
      line-height: 1.35;
      margin: 0 0 2.2mm;
      width: 100%;
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

    .section-page { padding-bottom: 10mm; }
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

    .work-page {
      gap: 2.5mm;
      height: 272mm;
      overflow: hidden;
      padding-bottom: 8mm;
    }
    .work-head { flex: 0 0 auto; }
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
      font-size: 16pt;
      font-weight: 700;
      line-height: 1.15;
      margin: 0 0 1.5mm;
    }
    .work-head .meta {
      color: ${metaColor};
      display: block;
      font-size: 10.5pt;
      font-style: normal;
      font-weight: 400;
      line-height: 1.45;
      margin: 0 0 0.35mm;
    }
    .frame-slot {
      align-items: center;
      container-type: size;
      display: flex;
      flex: 1 1 auto;
      justify-content: center;
      min-height: 0;
      overflow: hidden;
      width: 100%;
    }
    .frame {
      border: 1px solid ${frameBorder};
      flex: none;
      height: 100cqmin;
      max-height: 100%;
      max-width: 100%;
      overflow: hidden;
      padding: 0;
      width: 100cqmin;
    }
    .frame-pad {
      align-items: center;
      display: flex;
      height: 100%;
      justify-content: center;
      overflow: hidden;
      padding: ${framePadding}px;
      width: 100%;
    }
    .frame-pad img {
      max-height: 100%;
      max-width: 100%;
      object-fit: contain;
    }
    .frame-pad.empty {
      color: #9a9286;
      font-style: italic;
    }

    @media screen {
      body { background: #e6e0d4; padding: 16px; }
      .page {
        background: #fff;
        box-shadow: 0 8px 28px rgba(30, 24, 16, 0.12);
        margin: 0 auto 18px;
        max-width: 210mm;
        min-height: 297mm;
        padding: 12mm 12mm 16mm;
        width: 100%;
      }
      .work-page { height: calc(297mm - 28mm); }
      .page-num { bottom: 8mm; }
    }

    @media print {
      body { background: #fff; padding: 0; }
      .page {
        box-shadow: none;
        margin: 0;
        max-width: none;
        min-height: 272mm;
        padding: 0 0 8mm;
      }
      .work-page { height: 272mm; }
    }
  </style>
</head>
<body>
  <section class="page cover">
    <div class="cover-hero">
      ${
        payload.coverSubtitle?.trim()
          ? `<p class="cover-kicker">${escapeHtml(payload.coverSubtitle.trim())}</p>`
          : ""
      }
      <h1 class="cover-title">${escapeHtml(payload.title || "Solicitud")}</h1>
      <div class="cover-meta">
        ${
          payload.organization?.trim()
            ? `<span>${escapeHtml(payload.organization.trim())}</span>`
            : ""
        }
        ${
          payload.coverDate?.trim()
            ? `<span>${escapeHtml(payload.coverDate.trim())}</span>`
            : ""
        }
      </div>
      ${
        payload.coverNote?.trim()
          ? `<p class="cover-note">${escapeHtml(payload.coverNote.trim())}</p>`
          : ""
      }
    </div>
    <div class="cover-toc">
      <p class="toc-label">${escapeHtml(tocLabel)}</p>
      <div class="toc">${tocHtml || `<p class="cover-line">—</p>`}</div>
    </div>
    ${pageFooter(coverPage)}
  </section>
  ${sectionHtml}
  ${worksHtml}
</body>
</html>`;
}
