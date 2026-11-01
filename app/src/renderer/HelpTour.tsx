import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  HELP_STEPS,
  popupSteps,
  tourViewSection,
  TOUR_VIEWS_NEEDING_ARTWORK,
  type HelpStep,
  type HelpTarget,
  type TourView
} from "./helpContent";
import { useLanguage, type Lang } from "./i18n";

/** Render «label» as bold so button names stand out. */
function withLabels(text: string): ReactNode[] {
  return text.split(/(«[^»]+»)/g).map((part, index) =>
    part.startsWith("«") ? <strong key={index}>{part}</strong> : part
  );
}

type Corner = "br" | "bl" | "tr" | "tl";

const SPOT_PAD = 6;
const SIDEBAR_WIDTH = 268;

function overlaps(a: DOMRect, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** The popup on top, if any (the last one in the page is the newest). */
function topPopup(): HTMLElement | null {
  const popups = document.querySelectorAll<HTMLElement>(".modal");
  return popups.length ? popups[popups.length - 1] : null;
}

function findSpot(spot: string | undefined, popup: HTMLElement | null): HTMLElement | null {
  if (!spot) return null;
  if (popup) {
    if (spot === "@popup") return popup;
    if (spot === "@actions") {
      return (
        popup.querySelector<HTMLElement>(".modal-actions") ??
        popup.querySelector<HTMLElement>(".row-actions")
      );
    }
    return popup.querySelector<HTMLElement>(`[data-help="${spot}"]`);
  }
  return document.querySelector<HTMLElement>(`[data-help="${spot}"]`);
}

type Session = { popup: HTMLElement | null; popupKey: string; steps: HelpStep[]; start: number };

/** Which guide screen the app is showing (some pages have two states). */
function currentView(page: string): TourView | null {
  const has = (spot: string) => Boolean(findSpot(spot, null));
  switch (page) {
    case "detail":
      return "artworkDetail";
    case "form":
      return has("movement-add") ? "artworkMovements" : "artworkEdit";
    case "pricelist":
      return has("pricelist-mode") ? "pricelistNew" : "pricelist";
    case "contactDetail":
      return "contacts";
    case "library":
    case "inbox":
    case "series":
    case "contacts":
    case "exhibitions":
    case "pricing":
    case "financials":
    case "applications":
    case "textGenerator":
    case "examples":
      return page;
    default:
      return null;
  }
}

function openSession(
  lang: Lang,
  hasArtworks: boolean,
  fromStart: boolean,
  page: string
): Session {
  const popup = topPopup();
  if (popup) {
    const popupKey = popup.dataset.helpModal ?? "";
    return { popup, popupKey, steps: popupSteps(lang, popupKey), start: 0 };
  }
  const steps = (HELP_STEPS[lang] ?? HELP_STEPS.es).filter(
    (step) => hasArtworks || !step.view || !TOUR_VIEWS_NEEDING_ARTWORK.has(step.view)
  );
  // Start where she is: the first step about the screen that is open.
  const view = currentView(page);
  let here = view ? steps.findIndex((step) => step.view === view) : -1;
  if (here < 0 && view) {
    const section = tourViewSection(view);
    here = steps.findIndex((step) => step.view === section);
  }
  return { popup: null, popupKey: "", steps, start: fromStart || here < 0 ? 0 : here };
}

/**
 * Walk-through guide. Opened on a screen, it starts at that screen; opened
 * over a popup, it explains the popup. Each step outlines the element it
 * describes, while a small panel in a corner holds the text, so the page
 * stays visible (and usable) while reading.
 */
export function HelpTour({
  hasArtworks,
  page,
  fromStart = false,
  onClose,
  onShow,
  onHighlight
}: {
  hasArtworks: boolean;
  /** The app page that is open (where the guide starts). */
  page: string;
  /** Begin at the welcome step instead of the current screen. */
  fromStart?: boolean;
  onClose: () => void;
  onShow: (view: TourView) => void;
  onHighlight: (target: HelpTarget | null) => void;
}) {
  const { lang, t } = useLanguage();
  const [session, setSession] = useState(() =>
    openSession(lang, hasArtworks, fromStart, page)
  );
  const [index, setIndex] = useState(session.start);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [corner, setCorner] = useState<Corner>("br");
  const panelRef = useRef<HTMLDivElement>(null);
  const { steps, popup } = session;
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const chapters = steps
    .map((item, itemIndex) => ({ name: item.chapter, start: itemIndex }))
    .filter((item, itemIndex, all) => itemIndex === 0 || all[itemIndex - 1].name !== item.name);

  // Open the step's screen (only if its element isn't already showing),
  // then follow the element while it exists.
  useEffect(() => {
    onHighlight(step.view ? tourViewSection(step.view) : null);
    if (step.view && !findSpot(step.spot, popup)) onShow(step.view);
    setRect(null);
    let scrolled = false;
    const tick = () => {
      if (popup) {
        // The popup closed: nothing left to explain.
        if (!popup.isConnected) {
          onClose();
          return;
        }
        // Same popup, next stage (e.g. photo editor: straighten → edit).
        const key = popup.dataset.helpModal ?? "";
        if (key !== session.popupKey) {
          setSession({ popup, popupKey: key, steps: popupSteps(lang, key), start: 0 });
          setIndex(0);
          return;
        }
      }
      const element = findSpot(step.spot, popup);
      if (!element) {
        setRect(null);
        return;
      }
      if (!scrolled) {
        scrolled = true;
        // Instant, and only if needed, so the outline never trails a scroll.
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      setRect(element.getBoundingClientRect());
    };
    tick();
    const timer = window.setInterval(tick, 120);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, session]);

  useEffect(() => () => onHighlight(null), [onHighlight]);

  // Keep the panel in a corner that doesn't cover the outlined element.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !rect) {
      setCorner("br");
      return;
    }
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const gap = 20;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const boxes: Record<Corner, { left: number; top: number; right: number; bottom: number }> = {
      br: { left: vw - gap - w, top: vh - gap - h, right: vw - gap, bottom: vh - gap },
      bl: { left: SIDEBAR_WIDTH + gap, top: vh - gap - h, right: SIDEBAR_WIDTH + gap + w, bottom: vh - gap },
      tr: { left: vw - gap - w, top: gap, right: vw - gap, bottom: gap + h },
      tl: { left: SIDEBAR_WIDTH + gap, top: gap, right: SIDEBAR_WIDTH + gap + w, bottom: gap + h }
    };
    const pick = (["br", "bl", "tr", "tl"] as Corner[]).find((c) => !overlaps(rect, boxes[c]));
    setCorner(pick ?? "br");
  }, [rect?.left, rect?.top, rect?.width, rect?.height, index]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowRight") setIndex((i) => Math.min(steps.length - 1, i + 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length]);

  return (
    <>
      {rect ? (
        <div
          className="tour-spot"
          data-for={step.spot}
          aria-hidden
          style={{
            left: rect.left - SPOT_PAD,
            top: rect.top - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2
          }}
        />
      ) : null}
      <div
        ref={panelRef}
        className={`tour-panel tour-panel-${corner}`}
        role="dialog"
        aria-labelledby="tour-title"
      >
        <div className="tour-head">
          {popup || chapters.length < 2 ? (
            <span className="tour-chapter-label">{step.chapter}</span>
          ) : (
            <select
              className="tour-chapters"
              aria-label={t("help.topics")}
              value={chapters.filter((c) => c.start <= index).pop()?.start ?? 0}
              onChange={(event) => setIndex(Number(event.target.value))}
            >
              {chapters.map((chapter) => (
                <option key={chapter.start} value={chapter.start}>
                  {chapter.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="ghost small tour-close"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <p className="tour-count">{t("help.stepOf", { n: index + 1, total: steps.length })}</p>
        <h3 id="tour-title">{step.title}</h3>
        <p className="tour-body">{withLabels(step.body)}</p>
        <div className="tour-actions">
          <button
            type="button"
            className="ghost"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            ← {t("help.prev")}
          </button>
          {last ? (
            <button type="button" onClick={onClose}>
              {t("help.finish")}
            </button>
          ) : (
            <button type="button" onClick={() => setIndex(index + 1)}>
              {t("help.next")} →
            </button>
          )}
        </div>
      </div>
    </>
  );
}
