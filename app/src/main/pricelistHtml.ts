/**
 * Pure HTML builder for the folleto / price list (PDF + live preview).
 * No Electron imports — safe for main and renderer. The preview iframe and
 * printToPDF render this same document, so the PDF matches the preview.
 */

export interface PriceListRow {
  title: string;
  series: string;
  material: string;
  size: string;
  year: string;
  price: string;
  imageDataUrl?: string;
  /** Library file path — preferred over imageDataUrl for compression. */
  imagePath?: string;
  widthCm?: number;
  heightCm?: number;
}

export interface PriceListFonts {
  header: string;
  subtitle: string;
  body: string;
}

export interface PriceListStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface PriceListPayload {
  header: string;
  subtitle?: string;
  leftHeader?: string;
  rightHeader?: string;
  /** Optional text under the header, before the works. Blank lines = paragraphs. */
  introText?: string;
  showPrice: boolean;
  priceBold?: boolean;
  titleFontSize?: number;
  textFontSize?: number;
  priceFontSize?: number;
  textBold?: boolean;
  imagesPerPage?: number;
  imageGap?: number; // horizontal space (px) between the frame and the text
  frameBorderColor?: string; // hex colour of the image frame border
  fonts?: PriceListFonts;
  headerStyle?: PriceListStyle;
  subtitleStyle?: PriceListStyle;
  rows: PriceListRow[];
  /** Language of the words the dossier adds itself ("Perteneciente a la serie"). */
  language?: "es" | "en" | "de";
  /** Words before the series name. Missing → SERIES_PREFIX of the language; "" → none. */
  seriesPrefix?: string;
  /** "3 / 12" in the bottom-right corner of every page. */
  pageNumbers?: boolean;
  /** One line at the bottom-left of every page (name, web, email…). */
  footerText?: string;
  /** Optional cap for the generated PDF, in megabytes. */
  maxMb?: number;
}

/** Default words before the series name; the user can change them per dossier. */
export const SERIES_PREFIX: Record<"es" | "en" | "de", string> = {
  es: "Perteneciente a la serie",
  en: "From the series",
  de: "Aus der Serie"
};

// A4 with 0.6in margins on every side.
const PAGE_MARGIN_MM = 15.24;

function chunk<T>(items: T[], size: number): T[][] {
  const per = Math.max(1, size);
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += per) {
    pages.push(items.slice(index, index + per));
  }
  return pages.length > 0 ? pages : [[]];
}

const DEFAULT_FONTS: PriceListFonts = {
  header: "Georgia",
  subtitle: "Georgia",
  body: "Georgia"
};

// Every image shares the same HEIGHT so a fixed number fit per page.
// Width follows each painting's own aspect ratio.
function rowImageHeight(imagesPerPage: number, usable = 980, reserve = 110): number {
  const per = (usable - reserve) / Math.max(1, imagesPerPage);
  return Math.max(60, Math.min(340, Math.round(per - 30)));
}

// Catalogue style: every artwork sits in an identical square frame and the
// photo is scaled to fit inside it while keeping its aspect ratio. Some leave
// whitespace on the sides, others above/below — the eye compares the frames.
function fitInSquare(
  row: PriceListRow,
  size: number
): { width: number; height: number } {
  const w = row.widthCm ?? 0;
  const h = row.heightCm ?? 0;
  if (w > 0 && h > 0) {
    const aspect = w / h;
    if (aspect >= 1) return { width: size, height: Math.round(size / aspect) };
    return { width: Math.round(size * aspect), height: size };
  }
  return { width: size, height: size };
}

function normalizeColor(color: string | undefined, fallback: string): string {
  const value = (color || fallback).replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : fallback;
}

function clampPdfFontSize(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(36, Math.max(8, Math.round(n * 2) / 2));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cssFont(name: string): string {
  const safe = (name || "Georgia").replace(/["\\]/g, "");
  return `"${safe}", Georgia, "Times New Roman", serif`;
}

function introParagraphs(text: string | undefined): string {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function buildPriceListHtml(
  payload: PriceListPayload,
  options?: { preview?: boolean }
): string {
  const fonts = payload.fonts ?? DEFAULT_FONTS;
  const perPage = payload.imagesPerPage ?? 4;
  // One per page: a big centred frame with the details underneath.
  const single = perPage === 1;
  const imgHeight = single ? 560 : rowImageHeight(perPage);
  const headerColor = `#${normalizeColor(payload.headerStyle?.color, "1C1C1C")}`;
  const subtitleColor = `#${normalizeColor(payload.subtitleStyle?.color, "555555")}`;

  const frame = imgHeight;
  const gap = Math.max(0, Math.round(payload.imageGap ?? 16));
  const borderColor = `#${normalizeColor(payload.frameBorderColor, "E4E4E4")}`;
  // Keep the image strictly inside the frame so the border is never covered by
  // the (often white-edged) picture. The box is `frame`, the image fits the
  // padded inner area.
  const framePad = 8;
  const innerFrame = Math.max(20, frame - 2 * (framePad + 1));

  const seriesPrefix = escapeHtml(
    String(
      payload.seriesPrefix ?? SERIES_PREFIX[payload.language ?? "es"] ?? SERIES_PREFIX.es
    ).trim()
  );
  const footerText = String(payload.footerText ?? "").trim();
  const pageNumbers = payload.pageNumbers === true;

  function renderRow(row: PriceListRow): string {
    const fit = fitInSquare(row, innerFrame);
    const innerImg = row.imageDataUrl
      ? `<img src="${row.imageDataUrl}" alt="" style="width:${fit.width}px;height:${fit.height}px;object-fit:fill;" />`
      : `<span class="noimg">Sin imagen</span>`;
    const imageCell = `<td class="img-cell"><div class="img-box" style="width:${frame}px;height:${frame}px;">${innerImg}</div></td>`;
    const seriesName = String(row.series ?? "").trim();
    const seriesLine = seriesName
      ? `<div class="meta">${seriesPrefix ? `${seriesPrefix} ` : ""}<em>${escapeHtml(seriesName)}</em></div>`
      : "";
    const meta =
      seriesLine +
      [row.material, row.size]
        .filter((value) => value && value.trim())
        .map((value) => `<div class="meta">${escapeHtml(value)}</div>`)
        .join("");
    const yearLine = row.year ? `<div class="meta">${escapeHtml(row.year)}</div>` : "";
    const priceLine =
      payload.showPrice && row.price
        ? `<div class="price">${escapeHtml(row.price)}</div>`
        : "";
    const details = [
      `<div class="title">${escapeHtml(row.title || "Sin título")}</div>`,
      meta,
      yearLine,
      priceLine
    ]
      .filter(Boolean)
      .join("");
    if (single) {
      return `<tr class="work single"><td class="single-cell"><div class="single-wrap" style="width:${frame}px;"><div class="single-info">${details}</div><div class="img-box" style="width:${frame}px;height:${frame}px;">${innerImg}</div></div></td></tr>`;
    }
    return `<tr class="work">${imageCell}<td class="info-cell">${details}</td></tr>`;
  }

  const priceWeight = payload.priceBold === false ? 400 : 700;
  const textWeight = payload.textBold ? 700 : 400;
  const titleSizePx = clampPdfFontSize(payload.titleFontSize, 15);
  const textSizePx = clampPdfFontSize(payload.textFontSize, 12.5);
  const priceSizePx = clampPdfFontSize(payload.priceFontSize, 15);

  const subHeaderRow =
    payload.leftHeader || payload.rightHeader
      ? `<div class="subhead">
          <span class="subhead-left">${escapeHtml(payload.leftHeader || "")}</span>
          <span class="subhead-right">${escapeHtml(payload.rightHeader || "")}</span>
        </div>`
      : "";
  const intro = introParagraphs(payload.introText);

  const headHtml = `<div class="sheet-head">
    ${subHeaderRow}
    <div class="header">
      <h1>${escapeHtml(payload.header || "Dossier de obras")}</h1>
      ${payload.subtitle ? `<p class="subtitle">${escapeHtml(payload.subtitle)}</p>` : ""}
    </div>
    <hr class="rule" />
    ${intro ? `<div class="intro">${intro}</div>` : ""}
  </div>`;

  // Fixed chunks are the no-script fallback; the script below re-flows rows
  // so a page never holds more than fits (a painting is never cut in half).
  const pagesHtml = chunk(payload.rows, perPage)
    .map(
      (pageRows, index) => `<section class="page"><div class="page-inner">${
        index === 0 ? headHtml : ""
      }<table><tbody>${pageRows.map(renderRow).join("")}</tbody></table></div></section>`
    )
    .join("");

  const previewScript = options?.preview
    ? `
      window.__previewZoom = 1;
      // Zoom is applied only after pagination, so it never changes which
      // works land on which page.
      function fitPages() {
        var avail = Math.max(280, document.documentElement.clientWidth - 32);
        var pageWidth = (210 * 96) / 25.4;
        var scale = Math.min(1, avail / pageWidth) * (Number(window.__previewZoom) || 1);
        document.querySelectorAll(".page").forEach(function (page) {
          page.style.zoom = String(scale);
        });
      }
      window.setPreviewZoom = function (zoom) {
        window.__previewZoom = Math.max(0.4, Math.min(2.5, Number(zoom) || 1));
        fitPages();
      };
      window.addEventListener("resize", fitPages);
      window.__pricelistReady.then(fitPages);`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    font-family: ${cssFont(fonts.body)};
    color: #1c1c1c;
    margin: 0;
    padding: 0;
  }
  /* Same box on screen and in print, so the measured layout is identical. */
  .page {
    background: #fff;
    break-after: page;
    height: 297mm;
    overflow: hidden;
    padding: ${PAGE_MARGIN_MM}mm;
    page-break-after: always;
    width: 210mm;
  }
  .page:last-child { break-after: auto; page-break-after: auto; }
  .page { position: relative; }
  /* Footer sits in the bottom margin, so it never moves the works. */
  .page-foot {
    align-items: baseline; bottom: 7mm; color: #666; display: flex;
    font-size: 10.5px; gap: 12px; justify-content: space-between;
    left: ${PAGE_MARGIN_MM}mm; position: absolute; right: ${PAGE_MARGIN_MM}mm;
  }
  .page-foot-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .page-foot-number { flex: none; margin-left: auto; }
  .page-inner { height: 100%; overflow: hidden; }
  .header { text-align: center; margin-bottom: 6px; }
  .header h1 {
    font-family: ${cssFont(fonts.header)};
    font-size: 26px; letter-spacing: 0.5px; margin: 0 0 4px;
    color: ${headerColor};
    font-weight: ${payload.headerStyle?.bold === false ? 400 : 700};
    font-style: ${payload.headerStyle?.italic ? "italic" : "normal"};
  }
  .header .subtitle {
    font-family: ${cssFont(fonts.subtitle)};
    font-size: 13px; margin: 0;
    color: ${subtitleColor};
    font-weight: ${payload.subtitleStyle?.bold ? 700 : 400};
    font-style: ${payload.subtitleStyle?.italic === false ? "normal" : "italic"};
  }
  .subhead {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 12.5px; color: #333; margin: 0 2px 14px;
  }
  .subhead-left { font-weight: 600; }
  .subhead-right { text-align: right; }
  .rule { border: none; border-top: 1.5px solid #1c1c1c; margin: 12px 0 18px; }
  .intro {
    color: #333; font-size: ${textSizePx}px; line-height: 1.55; margin: 0 2px 18px;
  }
  .intro p { margin: 0 0 0.6em; }
  .intro p:last-child { margin-bottom: 0; }
  table { width: 100%; border-collapse: collapse; }
  tr { border-bottom: 0.6px solid #d8d8d8; page-break-inside: avoid; break-inside: avoid; }
  /* A grey line above the first painting on every page. */
  table tr:first-child { border-top: 0.6px solid #d8d8d8; }
  td { padding: 12px 10px; vertical-align: middle; }
  .img-cell { width: ${frame + 12}px; text-align: left; padding-right: 0; }
  .img-box {
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: 1px solid ${borderColor};
    padding: ${framePad}px; overflow: hidden;
  }
  /* One per page: details above the painting, lined up with its frame. */
  .single-cell { padding: 18px 0; }
  .single-wrap { margin: 0 auto; }
  /* The header already ends in a black rule: no grey line under it. */
  .sheet-head + table tr.single:first-child { border-top: none; }
  .single-info { margin-bottom: ${gap}px; text-align: left; }
  .single-info .title { font-size: ${titleSizePx}px; font-weight: 600; margin-bottom: 3px; }
  .single-info .meta { font-size: ${textSizePx}px; font-weight: ${textWeight}; color: #444; line-height: 1.5; }
  .single-info .price {
    font-size: ${priceSizePx}px; font-weight: ${priceWeight}; color: #1c1c1c; margin-top: 10px;
  }
  .noimg { font-size: 10px; color: #aaa; font-family: Arial, sans-serif; }
  .info-cell { text-align: left; padding-left: ${gap}px; }
  .info-cell .title { font-size: ${titleSizePx}px; font-weight: 600; margin-bottom: 3px; }
  .info-cell .meta { font-size: ${textSizePx}px; font-weight: ${textWeight}; color: #444; line-height: 1.5; }
  .info-cell .price {
    font-size: ${priceSizePx}px; font-weight: ${priceWeight}; color: #1c1c1c; margin-top: 14px;
  }
  @media screen {
    body { background: #e6e0d4; display: flex; flex-direction: column; align-items: center; padding: 16px; }
    .page { box-shadow: 0 8px 28px rgba(30, 24, 16, 0.12); flex: none; margin: 0 0 18px; }
  }
  @media print {
    body { background: #fff; }
    .page { box-shadow: none; margin: 0; }
  }
</style></head>
<body>
  <div id="sheets">${pagesHtml}</div>
  <script>
    (function () {
      var perPage = ${Math.max(1, perPage)};
      function paginate() {
        var root = document.getElementById("sheets");
        var head = root.querySelector(".sheet-head");
        var rows = Array.prototype.slice.call(root.querySelectorAll("tr.work"));
        root.innerHTML = "";
        var inner, tbody, count;
        function newPage(withHead) {
          var page = document.createElement("section");
          page.className = "page";
          inner = document.createElement("div");
          inner.className = "page-inner";
          if (withHead && head) inner.appendChild(head);
          var table = document.createElement("table");
          tbody = document.createElement("tbody");
          table.appendChild(tbody);
          inner.appendChild(table);
          page.appendChild(inner);
          root.appendChild(page);
          count = 0;
        }
        newPage(true);
        var hasHead = Boolean(head);
        rows.forEach(function (row) {
          if (count >= perPage) {
            newPage(false);
            hasHead = false;
          }
          tbody.appendChild(row);
          count += 1;
          // Too tall for what is left of this page: start a new one. A row
          // alone on a page without the header always stays.
          if (inner.scrollHeight > inner.clientHeight + 1 && (count > 1 || hasHead)) {
            tbody.removeChild(row);
            newPage(false);
            hasHead = false;
            tbody.appendChild(row);
            count = 1;
          }
        });
      }
      var footerText = ${JSON.stringify(footerText).replace(/</g, "\u003c")};
      var pageNumbers = ${pageNumbers ? "true" : "false"};
      function addFooters() {
        if (!footerText && !pageNumbers) return;
        var pages = document.querySelectorAll(".page");
        pages.forEach(function (page, index) {
          var foot = document.createElement("div");
          foot.className = "page-foot";
          var text = document.createElement("span");
          text.className = "page-foot-text";
          text.textContent = footerText;
          foot.appendChild(text);
          if (pageNumbers) {
            var number = document.createElement("span");
            number.className = "page-foot-number";
            number.textContent = (index + 1) + " / " + pages.length;
            foot.appendChild(number);
          }
          page.appendChild(foot);
        });
      }
      var fontsReady = document.fonts && document.fonts.ready
        ? document.fonts.ready
        : Promise.resolve();
      function layout() {
        paginate();
        addFooters();
      }
      window.__pricelistReady = fontsReady.then(layout, layout);
      ${previewScript}
    })();
  </script>
</body></html>`;
}
