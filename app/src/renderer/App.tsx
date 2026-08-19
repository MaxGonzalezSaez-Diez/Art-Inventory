import {
  Fragment,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type DragEvent as ReactDragEvent,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction
} from "react";
import { flushSync } from "react-dom";
import type { ImageEditSaveResult } from "./imageEditTypes";

const ImageEditModal = lazy(async () => {
  const mod = await import("./ImageEditModal");
  return { default: mod.ImageEditModal };
});
import type {
  AppSettings,
  Artwork,
  ArtworkImage,
  ArtworkInput,
  Contact,
  ContactInput,
  ContactKind,
  EditionInput,
  Exhibition,
  ExhibitionInput,
  InventoryData,
  LookupOption,
  Movement,
  MovementContext,
  MovementInput,
  FactorPeriod,
  SizeType,
  TaxRate,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  SeriesInfo,
  SeriesInfoInput,
  FixedTypePrice,
  FixedPricePeriod,
  SeriesText,
  Application,
  ApplicationInput,
  ApplicationKind,
  ApplicationCoverStyles,
  ApplicationTextSection,
  CoverLineStyle,
  TextGeneratorExample,
  ContactReminder,
  ReminderChannel,
  ReminderIntervalUnit,
  InboxNote,
  InboxTodo,
  PriceListDoc,
  PriceListDocInput
} from "../main/types/inventory";
import { DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT, DEFAULT_FIXED_TYPE_PRICES } from "../main/types/inventory";
import { buildArtworkIdBase } from "../main/artworkId";
import { DEFAULT_LOOKUPS } from "../main/excel/schema";
import type { AppPreferences } from "../main/preferences";
import {
  LANGUAGE_OPTIONS,
  LanguageProvider,
  lookupLabel,
  translate,
  useLanguage,
  useT,
  type Lang,
  type StringKey,
  type Translate
} from "./i18n";
import { buildApplicationHtml } from "../main/applicationDocumentHtml";

/** Import an edited JPEG/PNG data-URL as an artwork main photo. */
async function importEditedArtworkImage(
  dataUrl: string,
  artworkId: string,
  options?: { originalDataUrl?: string; keepOriginalAsExtra?: boolean }
) {
  const api = window.inventoryApi as typeof window.inventoryApi & {
    importImageFromDataUrl?: (
      dataUrl: string,
      targetType: "artwork",
      targetId: string,
      category: string,
      originalName?: string
    ) => Promise<{ image: unknown; inventory: InventoryData } | null>;
    dataUrlToTempPath?: (dataUrl: string) => Promise<string>;
    updateImageCaption?: (
      imageId: string,
      caption: string
    ) => Promise<InventoryData>;
  };

  async function importOne(
    url: string,
    category: string,
    originalName: string
  ): Promise<{ image: { id: string }; inventory: InventoryData } | null> {
    if (typeof api.importImageFromDataUrl === "function") {
      return (await api.importImageFromDataUrl(
        url,
        "artwork",
        artworkId,
        category,
        originalName
      )) as { image: { id: string }; inventory: InventoryData } | null;
    }
    if (typeof api.dataUrlToTempPath === "function") {
      const tempPath = await api.dataUrlToTempPath(url);
      const data = (await api.importImageFromPath(
        tempPath,
        "artwork",
        artworkId,
        category
      )) as
        | InventoryData
        | { image: unknown; inventory: InventoryData }
        | null;
      if (!data) return null;
      const inventory =
        "artworks" in data ? data : data.inventory;
      return { image: { id: "" }, inventory };
    }
    throw new Error(
      "La app necesita reiniciarse para guardar la foto. Cierra la ventana y vuelve a abrirla."
    );
  }

  // Original first so it becomes the first additional image.
  if (options?.keepOriginalAsExtra && options.originalDataUrl) {
    await importOne(
      options.originalDataUrl,
      "extra",
      "foto-original.jpg"
    );
  }

  const main = await importOne(
    dataUrl,
    "main",
    /^data:image\/png/i.test(dataUrl) ? "foto.png" : "foto.jpg"
  );
  return main;
}

const DROP_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "tiff",
  "tif",
  "bmp",
  "heic"
]);

function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isDropImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return DROP_IMAGE_EXTENSIONS.has(fileExtension(file.name));
}

function pathForDroppedFile(file: File): string {
  const api = window.inventoryApi as typeof window.inventoryApi & {
    getPathForFile?: (file: File) => string;
  };
  if (typeof api.getPathForFile === "function") {
    const path = api.getPathForFile(file);
    if (path) return path;
  }
  const legacy = (file as File & { path?: string }).path;
  return legacy || "";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("No se pudo leer el archivo."));
    };
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function filesFromDropEvent(event: ReactDragEvent): File[] {
  const list = event.dataTransfer?.files;
  if (!list?.length) return [];
  return Array.from(list);
}

function useFileDragOver(enabled = true) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  function reset() {
    depth.current = 0;
    setOver(false);
  }

  const handlers = {
    onDragEnter: (event: ReactDragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!enabled) return;
      depth.current += 1;
      setOver(true);
    },
    onDragOver: (event: ReactDragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!enabled) return;
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: ReactDragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!enabled) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDropCapture: () => {
      reset();
    }
  };

  return { over, reset, handlers };
}

type Page =
  | "library"
  | "form"
  | "detail"
  | "contacts"
  | "contactDetail"
  | "exhibitions"
  | "pricelist"
  | "pricing"
  | "financials"
  | "series"
  | "applications"
  | "textGenerator"
  | "examples"
  | "inbox";

interface PriceListPreset {
  exhibitionId?: string;
  artworkIds?: string[];
}
type FormTab = "info" | "movimientos";
type DetailTab = "info" | "movimientos" | "precio";

const emptyArtwork: ArtworkInput = {
  title: "",
  series: "",
  type: "oil_canvas",
  yearMade: "",
  height: "",
  width: "",
  depth: "",
  unit: "cm",
  status: "in_studio",
  galleryContactId: "",
  editionMode: "unique",
  editionPersonalCopies: "0",
  editionSaleCopies: "0",
  notes: "",
  editions: [],
  movements: []
};

export function App() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [page, setPage] = useState<Page>("library");
  const [selectedArtworkId, setSelectedArtworkId] = useState("");
  const [editingArtwork, setEditingArtwork] = useState<ArtworkInput>(emptyArtwork);
  const [formKey, setFormKey] = useState("new");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [exhibitionToOpen, setExhibitionToOpen] = useState<string | null>(null);
  const [pricelistPreset, setPricelistPreset] = useState<PriceListPreset | null>(null);
  const [pricelistResetToken, setPricelistResetToken] = useState(0);
  const [history, setHistory] = useState<
    Array<{ page: Page; artworkId: string; contactId: string }>
  >([]);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<null | (() => Promise<boolean>)>(null);
  // Bumped when the user clicks the "Exposiciones" tab so the page closes any
  // exhibition form that is open (otherwise "salir sin guardar" appears to do
  // nothing because the page does not change).
  const [exhResetToken, setExhResetToken] = useState(0);
  const [appResetToken, setAppResetToken] = useState(0);

  useEffect(() => {
    void (async () => {
      const loaded = await loadPreferences();
      setPrefs(loaded);
      if (loaded.setupComplete) await refresh();
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4200);
    return () => clearTimeout(timer);
  }, [message]);

  async function refresh() {
    try {
      const data = await window.inventoryApi.loadInventory();
      setInventory(data);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.error.load"));
    }
  }

  async function chooseLibrary() {
    await window.inventoryApi.chooseLibrary();
    setPrefs(await loadPreferences());
    await refresh();
  }

  async function changeLanguage(next: Lang) {
    setPrefs((current) => (current ? { ...current, language: next } : current));
    try {
      await requireApi("setLanguage", t)(next);
    } catch {
      /* the choice still applies to this session */
    }
  }

  function guarded(action: () => void) {
    if (dirty) {
      setPendingNav(() => action);
    } else {
      action();
    }
  }

  function goTo(next: Page) {
    setHistory((current) => [
      ...current,
      { page, artworkId: selectedArtworkId, contactId: selectedContactId }
    ]);
    setToast("");
    setMessage("");
    setPage(next);
  }

  function goBack() {
    setHistory((current) => {
      if (current.length === 0) {
        setPage("library");
        return current;
      }
      const prev = current[current.length - 1];
      setPage(prev.page);
      setSelectedArtworkId(prev.artworkId);
      setSelectedContactId(prev.contactId);
      return current.slice(0, -1);
    });
    setToast("");
    setMessage("");
  }

  function startAdd() {
    setEditingArtwork({ ...emptyArtwork });
    setSelectedArtworkId("");
    setFormKey(`new-${Date.now()}`);
    goTo("form");
  }

  function openPriceList(preset: PriceListPreset | null) {
    setPricelistPreset(preset);
    goTo("pricelist");
  }

  function startEdit(artwork: Artwork) {
    setEditingArtwork(toInput(artwork, inventory!));
    setSelectedArtworkId(artwork.id);
    setFormKey(artwork.id);
    goTo("form");
  }

  function openContact(contactId: string) {
    setSelectedContactId(contactId);
    goTo("contactDetail");
  }

  const selectedArtwork = inventory?.artworks.find(
    (artwork) => artwork.id === selectedArtworkId
  );
  const selectedContact = inventory?.contacts.find(
    (contact) => contact.id === selectedContactId
  );
  const dueReminderCount = (inventory?.contactReminders ?? []).filter(
    (reminder) => reminderDueInfo(reminder).daysUntil <= 3
  ).length;
  const openTodoCount = (inventory?.inboxTodos ?? []).filter(
    (todo) => !todo.doneAt
  ).length;
  const inboxBadgeCount = dueReminderCount + openTodoCount;

  if (!prefs) return <div className="boot-screen">…</div>;

  const lang = prefs.language;
  const t: Translate = (key, vars) => translate(lang, key, vars);

  if (!prefs.setupComplete) {
    return (
      <LanguageProvider value={{ lang, t }}>
        <SetupScreen
          preferences={prefs}
          onLanguageChange={(next) =>
            setPrefs((current) =>
              current ? { ...current, language: next } : current
            )
          }
          onDone={async (saved) => {
            setPrefs((current) =>
              current ? { ...current, ...saved, setupComplete: true } : current
            );
            await refresh();
          }}
        />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider value={{ lang, t }}>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="eyebrow">{t("brand.eyebrow")}</p>
          <h1>{t("brand.title")}</h1>
        </div>
        <nav>
          <div className="nav-inbox-block">
            <NavButton
              className="nav-button-inbox"
              active={page === "inbox"}
              onClick={() => guarded(() => goTo("inbox"))}
            >
              <span className="nav-inbox-mark" aria-hidden>
                ✉
              </span>
              {t("nav.inbox")}
              {inboxBadgeCount > 0 ? (
                <span
                  className="nav-badge"
                  title={t("inbox.badgeTitle", { n: inboxBadgeCount })}
                >
                  {inboxBadgeCount}
                </span>
              ) : null}
            </NavButton>
          </div>
          <div className="nav-rest">
          <NavButton active={page === "library" || page === "form" || page === "detail"} onClick={() => guarded(() => goTo("library"))}>
            <span className="nav-dot dot-obras" /> {t("nav.library")}
          </NavButton>
          <NavButton active={page === "series"} onClick={() => guarded(() => goTo("series"))}>
            <span className="nav-dot dot-series" /> {t("nav.series")}
          </NavButton>
          <NavButton active={page === "contacts"} onClick={() => guarded(() => goTo("contacts"))}>
            <span className="nav-dot dot-people" /> {t("nav.contacts")}
          </NavButton>
          <NavButton
            active={page === "exhibitions"}
            onClick={() =>
              guarded(() => {
                setExhibitionToOpen(null);
                setExhResetToken((value) => value + 1);
                goTo("exhibitions");
              })
            }
          >
            <span className="nav-dot dot-exh" /> {t("nav.exhibitions")}
          </NavButton>
          <NavButton
            active={page === "pricelist"}
            onClick={() =>
              guarded(() => {
                setPricelistResetToken((token) => token + 1);
                openPriceList(null);
              })
            }
          >
            <span className="nav-dot dot-price" /> {t("nav.pricelist")}
          </NavButton>
          <NavButton active={page === "pricing"} onClick={() => guarded(() => goTo("pricing"))}>
            <span className="nav-dot dot-factor" /> {t("nav.pricing")}
          </NavButton>
          <NavButton
            active={page === "financials"}
            onClick={() => guarded(() => goTo("financials"))}
          >
            <span className="nav-dot dot-money" /> {t("nav.financials")}
          </NavButton>
          <NavButton
            active={page === "applications"}
            onClick={() =>
              guarded(() => {
                setAppResetToken((token) => token + 1);
                goTo("applications");
              })
            }
          >
            <span className="nav-dot dot-app" /> {t("nav.applications")}
          </NavButton>
          <NavButton
            active={page === "textGenerator"}
            onClick={() => guarded(() => goTo("textGenerator"))}
          >
            <span className="nav-dot dot-textgen" /> {t("nav.textGenerator")}
          </NavButton>
          <NavButton
            active={page === "examples"}
            onClick={() => guarded(() => goTo("examples"))}
          >
            <span className="nav-dot dot-examples" /> {t("nav.examples")}
          </NavButton>
          </div>
        </nav>
        <div className="library-path">
          <label className="sidebar-language">
            {t("sidebar.language")}
            <select
              value={lang}
              onChange={(event) => void changeLanguage(event.target.value as Lang)}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span>{t("sidebar.folder")}</span>
          <strong>{inventory?.libraryPath ?? "..."}</strong>
          <button className="ghost small" onClick={chooseLibrary}>
            {t("sidebar.changeFolder")}
          </button>
        </div>
      </aside>

      <main className="main-panel">
        {(history.length > 0 ||
          page === "form" ||
          page === "detail" ||
          page === "contactDetail") && (
          <button
            type="button"
            className="floating-back"
            onClick={() => guarded(() => goBack())}
          >
            {t("nav.floatingBack")}
          </button>
        )}
        {toast && (
          <div className="toast toast-enter" key={`t-${toast}`}>
            {toast}
          </div>
        )}
        {message && (
          <div className="notice notice-enter" key={`m-${message}`}>
            {message}
            <button
              type="button"
              className="banner-dismiss"
              aria-label={t("common.close")}
              onClick={() => setMessage("")}
            >
              ✕
            </button>
          </div>
        )}
        {!inventory ? (
          <div className="empty-state">{t("app.loadingExcel")}</div>
        ) : page === "library" ? (
          <LibraryPage
            inventory={inventory}
            setInventory={setInventory}
            onAdd={startAdd}
            onSelect={(artwork) => {
              setSelectedArtworkId(artwork.id);
              goTo("detail");
            }}
          />
        ) : page === "form" ? (
          <ArtworkForm
            key={formKey}
            inventory={inventory}
            artwork={editingArtwork}
            setInventory={setInventory}
            onNew={() => guarded(startAdd)}
            onSaved={(savedId) => {
              setSelectedArtworkId(savedId);
              setToast(t("common.toast.saved"));
            }}
            onBackToList={() => guarded(goBack)}
            onDirtyChange={setDirty}
            saveRef={saveRef}
          />
        ) : page === "detail" && selectedArtwork ? (
          <ArtworkDetail
            artwork={selectedArtwork}
            inventory={inventory}
            setInventory={setInventory}
            onEdit={() => startEdit(selectedArtwork)}
            onBack={goBack}
            onToast={setToast}
            onError={setMessage}
            onDeleted={(data) => {
              setInventory(data);
              goBack();
            }}
            onOpenExhibition={(exhibitionId) =>
              guarded(() => {
                setExhibitionToOpen(exhibitionId);
                goTo("exhibitions");
              })
            }
          />
        ) : page === "contacts" ? (
          <ContactsPage
            inventory={inventory}
            setInventory={setInventory}
            onOpen={openContact}
          />
        ) : page === "contactDetail" && selectedContact ? (
          <ContactDetail
            contact={selectedContact}
            inventory={inventory}
            setInventory={setInventory}
            onBack={goBack}
            onOpenArtwork={(artworkId) => {
              setSelectedArtworkId(artworkId);
              goTo("detail");
            }}
            onOpenExhibition={(exhibitionId) => {
              setExhibitionToOpen(exhibitionId);
              goTo("exhibitions");
            }}
            onOpenContact={openContact}
            onDeleted={goBack}
          />
        ) : page === "exhibitions" ? (
          <ExhibitionsPage
            inventory={inventory}
            setInventory={setInventory}
            onError={setMessage}
            openId={exhibitionToOpen}
            onOpened={() => setExhibitionToOpen(null)}
            resetToken={exhResetToken}
            guard={guarded}
            onDirtyChange={setDirty}
            saveRef={saveRef}
            onOpenArtwork={(artworkId) =>
              guarded(() => {
                setSelectedArtworkId(artworkId);
                goTo("detail");
              })
            }
            onGeneratePriceList={(exhibitionId) =>
              guarded(() => openPriceList({ exhibitionId }))
            }
          />
        ) : page === "pricelist" ? (
          <PriceListPage
            inventory={inventory}
            setInventory={setInventory}
            preset={pricelistPreset}
            onPresetConsumed={() => setPricelistPreset(null)}
            onError={setMessage}
            onToast={setToast}
            onDirtyChange={setDirty}
            saveRef={saveRef}
            guard={guarded}
            resetToken={pricelistResetToken}
          />
        ) : page === "pricing" ? (
          <PricingSettingsPage
            inventory={inventory}
            setInventory={setInventory}
            onError={setMessage}
            onToast={setToast}
          />
        ) : page === "financials" ? (
          <FinancialsPage
            inventory={inventory}
            setInventory={setInventory}
            onError={setMessage}
            onToast={setToast}
          />
        ) : page === "series" ? (
          <SeriesPage
            inventory={inventory}
            setInventory={setInventory}
            onError={setMessage}
            onToast={setToast}
            onOpenArtwork={(artworkId) =>
              guarded(() => {
                setSelectedArtworkId(artworkId);
                goTo("detail");
              })
            }
          />
        ) : page === "applications" ? (
          <ApplicationsPage
            inventory={inventory}
            setInventory={setInventory}
            onError={setMessage}
            onToast={setToast}
            onDirtyChange={setDirty}
            saveRef={saveRef}
            guard={guarded}
            resetToken={appResetToken}
          />
        ) : page === "textGenerator" ? (
          <TextGeneratorPage
            inventory={inventory}
            setInventory={setInventory}
            onError={setMessage}
            onToast={setToast}
            onOpenExampleLibrary={() => guarded(() => goTo("examples"))}
          />
        ) : page === "examples" ? (
          <ExampleLibraryPage
            inventory={inventory}
            setInventory={setInventory}
            onError={setMessage}
            onToast={setToast}
            onDirtyChange={setDirty}
            saveRef={saveRef}
          />
        ) : page === "inbox" ? (
          <InboxPage
            inventory={inventory}
            setInventory={setInventory}
            onError={setMessage}
            onToast={setToast}
            onDirtyChange={setDirty}
            saveRef={saveRef}
            onOpenContact={(contactId) =>
              guarded(() => {
                setSelectedContactId(contactId);
                goTo("contactDetail");
              })
            }
          />
        ) : (
          <div className="empty-state">{t("app.selectArtwork")}</div>
        )}
      </main>

      {pendingNav && (
        <div className="modal-backdrop" onClick={() => setPendingNav(null)}>
          <div className="modal confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>{t("unsaved.title")}</h3>
            </div>
            <p className="confirm-message">{t("unsaved.question")}</p>
            <div className="leave-choices">
              <button
                className="leave-choice"
                disabled={saving}
                onClick={async () => {
                  const action = pendingNav;
                  setSaving(true);
                  const ok = saveRef.current ? await saveRef.current() : true;
                  setSaving(false);
                  // On failure, close the modal and stay on the form so the
                  // red error message (e.g. missing title) is visible.
                  setPendingNav(null);
                  if (!ok) return;
                  setDirty(false);
                  action?.();
                }}
              >
                <strong>{saving ? t("common.saving") : t("unsaved.saveExit")}</strong>
                <span>{t("unsaved.saveExit.hint")}</span>
              </button>
              <button
                className="leave-choice danger-choice"
                disabled={saving}
                onClick={() => {
                  const action = pendingNav;
                  setPendingNav(null);
                  setDirty(false);
                  action?.();
                }}
              >
                <strong>{t("unsaved.discard")}</strong>
                <span>{t("unsaved.discard.hint")}</span>
              </button>
              <button
                className="leave-choice ghost-choice"
                disabled={saving}
                onClick={() => setPendingNav(null)}
              >
                <strong>{t("unsaved.stay")}</strong>
                <span>{t("unsaved.stay.hint")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </LanguageProvider>
  );
}

interface Preferences extends AppPreferences {
  choices: { documents: string; desktop: string };
}

async function loadPreferences(): Promise<Preferences> {
  const api = window.inventoryApi?.getPreferences;
  if (typeof api !== "function") {
    // Stale preload during development: behave like a finished setup.
    const libraryPath = await window.inventoryApi.getLibraryPath();
    return {
      language: "es",
      libraryPath,
      setupComplete: true,
      choices: { documents: libraryPath, desktop: libraryPath }
    };
  }
  return api();
}

/** First run: pick a language and where the library folder should be created. */
function SetupScreen({
  preferences,
  onLanguageChange,
  onDone
}: {
  preferences: Preferences;
  onLanguageChange: (lang: Lang) => void;
  onDone: (saved: { language: Lang; libraryPath: string }) => Promise<void>;
}) {
  const t = useT();
  const [target, setTarget] = useState(
    preferences.libraryPath || preferences.choices.documents
  );
  const [customPath, setCustomPath] = useState(() =>
    preferences.libraryPath === preferences.choices.documents ||
    preferences.libraryPath === preferences.choices.desktop
      ? ""
      : preferences.libraryPath
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const choice =
    target === preferences.choices.documents
      ? "documents"
      : target === preferences.choices.desktop
        ? "desktop"
        : "custom";

  async function pickCustom() {
    try {
      const picked = await requireApi("pickLibraryParent", t)();
      if (!picked) return;
      setCustomPath(picked);
      setTarget(picked);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("setup.failed"));
    }
  }

  async function start() {
    setWorking(true);
    setError("");
    try {
      const saved = await requireApi("completeSetup", t)({
        language: preferences.language,
        libraryPath: target
      });
      await onDone({ language: saved.language, libraryPath: saved.libraryPath });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("setup.failed"));
      setWorking(false);
    }
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <p className="eyebrow">{t("setup.welcome")}</p>
        <h1>{t("setup.title")}</h1>
        <p className="page-lead">{t("setup.lead")}</p>

        <section className="setup-block">
          <h2>{t("setup.step1")}</h2>
          <div className="setup-options">
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={`setup-option${
                  preferences.language === option.value ? " is-picked" : ""
                }`}
                onClick={() => onLanguageChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="muted small-note">{t("setup.step1Help")}</p>
        </section>

        <section className="setup-block">
          <h2>{t("setup.step2")}</h2>
          <div className="setup-options">
            <button
              type="button"
              className={`setup-option${choice === "documents" ? " is-picked" : ""}`}
              onClick={() => setTarget(preferences.choices.documents)}
            >
              {t("setup.documents")}
            </button>
            <button
              type="button"
              className={`setup-option${choice === "desktop" ? " is-picked" : ""}`}
              onClick={() => setTarget(preferences.choices.desktop)}
            >
              {t("setup.desktop")}
            </button>
            <button
              type="button"
              className={`setup-option${choice === "custom" ? " is-picked" : ""}`}
              onClick={() => (customPath ? setTarget(customPath) : void pickCustom())}
            >
              {t("setup.custom")}
            </button>
            {choice === "custom" && (
              <button type="button" className="ghost small" onClick={() => void pickCustom()}>
                {t("setup.chooseFolder")}
              </button>
            )}
          </div>
          <p className="muted small-note">{t("setup.step2Help")}</p>
          <p className="setup-path">{target}</p>
          <p className="muted small-note">{t("setup.existingNote")}</p>
        </section>

        {error && <p className="notice">{error}</p>}

        <button
          type="button"
          className="cuentas-primary setup-start"
          disabled={working}
          onClick={() => void start()}
        >
          {working ? t("setup.working") : t("setup.start")}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Library + filters + sort
 * ------------------------------------------------------------------------- */

type SortKey =
  | "recent"
  | "title"
  | "series"
  | "year_desc"
  | "year_asc"
  | "type"
  | "price_desc"
  | "price_asc";

function LibraryPage({
  inventory,
  setInventory,
  onAdd,
  onSelect
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onAdd: () => void;
  onSelect: (artwork: Artwork) => void;
}) {
  const { lang, t } = useLanguage();
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [seriesSel, setSeriesSel] = useState<string[]>([]);
  const [editionModes, setEditionModes] = useState<string[]>([]);
  const [yearRange, setYearRange] = useState<Range>(null);
  const [heightRange, setHeightRange] = useState<Range>(null);
  const [widthRange, setWidthRange] = useState<Range>(null);
  const [priceRange, setPriceRange] = useState<Range>(null);
  const [bulkExportOpen, setBulkExportOpen] = useState(false);

  const yearBounds = bounds(inventory.artworks.map((a) => parseNum(a.yearMade)));
  const heightBounds = bounds(inventory.artworks.map((a) => parseNum(a.height)));
  const widthBounds = bounds(inventory.artworks.map((a) => parseNum(a.width)));
  const priceBounds = bounds(inventory.artworks.map((a) => parseNum(a.soldPrice)));

  const seriesOptions = uniqueValues(inventory.artworks.map((a) => a.series))
    .filter((value) => value.trim())
    .map((value) => ({
      category: "series",
      value,
      label: isNoSeries(value) ? t("series.field.none") : value
    }));

  const activeFilterCount =
    types.length +
    statuses.length +
    seriesSel.length +
    editionModes.length +
    (yearRange ? 1 : 0) +
    (heightRange ? 1 : 0) +
    (widthRange ? 1 : 0) +
    (priceRange ? 1 : 0);

  function clearAll() {
    setSearch("");
    setTypes([]);
    setStatuses([]);
    setSeriesSel([]);
    setEditionModes([]);
    setYearRange(null);
    setHeightRange(null);
    setWidthRange(null);
    setPriceRange(null);
  }

  const artworks = useMemo(() => {
    const filtered = inventory.artworks.filter((artwork) => {
      const haystack = [
        artwork.title,
        seriesLabel(artwork.series, t),
        artwork.series,
        artwork.notes,
        artwork.id
      ]
        .join(" ")
        .toLowerCase();
      return (
        haystack.includes(search.toLowerCase()) &&
        (types.length === 0 || types.includes(artwork.type)) &&
        (statuses.length === 0 || statuses.includes(artwork.status)) &&
        (seriesSel.length === 0 || seriesSel.includes(artwork.series ?? "")) &&
        (editionModes.length === 0 ||
          editionModes.includes(artwork.editionMode ?? "unique")) &&
        inRange(parseNum(artwork.yearMade), yearRange) &&
        inRange(parseNum(artwork.height), heightRange) &&
        inRange(parseNum(artwork.width), widthRange) &&
        inRange(parseNum(artwork.soldPrice), priceRange)
      );
    });
    return sortArtworks(filtered, sort, inventory);
  }, [
    editionModes,
    heightRange,
    inventory,
    priceRange,
    search,
    seriesSel,
    sort,
    statuses,
    t,
    types,
    widthRange,
    yearRange
  ]);

  return (
    <section className={showFilters ? "library-layout" : "library-layout collapsed"}>
      {showFilters && (
        <aside className="filter-rail">
          <div className="filter-rail-head">
            <h3>{t("library.filters")}</h3>
            <button className="link-button" onClick={clearAll}>
              {t("common.clearAll")}
            </button>
          </div>
          <input
            className="search-input"
            placeholder={t("library.search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <CheckboxFilter
            title={t("library.filter.type")}
            options={translatedLookupOptions(inventory, "artworkType", lang)}
            selected={types}
            onChange={setTypes}
          />
          <CheckboxFilter
            title={t("library.filter.status")}
            options={translatedLookupOptions(inventory, "status", lang)}
            selected={statuses}
            onChange={setStatuses}
          />
          <CheckboxFilter
            title={t("library.filter.edition")}
            options={[
              { category: "editionMode", value: "unique", label: t("library.edition.unique") },
              { category: "editionMode", value: "multiple", label: t("library.edition.multiple") }
            ]}
            selected={editionModes}
            onChange={setEditionModes}
          />
          <CheckboxFilter
            title={t("library.filter.series")}
            options={seriesOptions}
            selected={seriesSel}
            onChange={setSeriesSel}
          />
          <RangeFilter
            title={t("library.filter.year")}
            bounds={yearBounds}
            value={yearRange}
            onChange={setYearRange}
            format={(value) => String(Math.round(value))}
          />
          <RangeFilter
            title={t("library.filter.height")}
            bounds={heightBounds}
            value={heightRange}
            onChange={setHeightRange}
            format={(value) => String(Math.round(value))}
          />
          <RangeFilter
            title={t("library.filter.width")}
            bounds={widthBounds}
            value={widthRange}
            onChange={setWidthRange}
            format={(value) => String(Math.round(value))}
          />
          <RangeFilter
            title={t("library.filter.soldPrice")}
            bounds={priceBounds}
            value={priceRange}
            onChange={setPriceRange}
            format={(value) => `${Math.round(value)}`}
          />
        </aside>
      )}

      <div className="library-main">
        <div className="table-toolbar">
          <button
            className="ghost"
            onClick={() => setShowFilters((value) => !value)}
          >
            {showFilters ? t("library.filtersHide") : t("library.filtersShow")}
            {activeFilterCount > 0 ? t("library.filtersCount", { count: activeFilterCount }) : ""}
          </button>
          <div className="toolbar-right">
            <label className="sort-control">
              {t("common.sort")}
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                <option value="recent">{t("library.sort.recent")}</option>
                <option value="title">{t("library.sort.title")}</option>
                <option value="series">{t("library.sort.series")}</option>
                <option value="year_desc">{t("library.sort.yearDesc")}</option>
                <option value="year_asc">{t("library.sort.yearAsc")}</option>
                <option value="type">{t("library.sort.type")}</option>
                <option value="price_desc">{t("library.sort.priceDesc")}</option>
                <option value="price_asc">{t("library.sort.priceAsc")}</option>
              </select>
            </label>
            <span className="count-pill">{t("library.count", { count: artworks.length })}</span>
            <button
              type="button"
              className="ghost"
              onClick={() => setBulkExportOpen(true)}
            >
              {t("library.bulkExport")}
            </button>
            <button onClick={onAdd}>{t("library.add")}</button>
          </div>
        </div>
        <div className="library-table-wrap">
          <div className="art-table">
            <div className="art-row art-row-header">
              <span>{t("library.col.photo")}</span>
              <span>{t("library.col.artwork")}</span>
              <span>{t("library.col.series")}</span>
              <span>{t("library.col.type")}</span>
              <span>{t("library.col.year")}</span>
              <span>{t("library.col.status")}</span>
            </div>
            {artworks.length === 0 ? (
              <div className="table-empty">{t("library.empty")}</div>
            ) : (
              artworks.map((artwork) => (
                <ArtworkRow
                  key={artwork.id}
                  artwork={artwork}
                  inventory={inventory}
                  setInventory={setInventory}
                  onSelect={() => onSelect(artwork)}
                />
              ))
            )}
          </div>
        </div>
      </div>
      {bulkExportOpen ? (
        <BulkImageExportModal
          inventory={inventory}
          onClose={() => setBulkExportOpen(false)}
        />
      ) : null}
    </section>
  );
}

function ArtworkRow({
  artwork,
  inventory,
  setInventory,
  onSelect
}: {
  artwork: Artwork;
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onSelect: () => void;
}) {
  const { lang, t } = useLanguage();
  const image = mainImageFor(artwork, inventory);
  const imageUrl = useImageDataUrl(image?.absolutePath);
  const overdue = overdueMovement(artwork, inventory);
  const statusLabel = labelFor(inventory, "status", artwork.status, lang);

  return (
    <div className="art-row" onClick={onSelect} role="button" tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="thumb">
        {imageUrl ? (
          <img src={imageUrl} alt="" />
        ) : image?.absolutePath ? (
          <span className="thumb-file-icon" title={documentDisplayName(image, "")}>
            <FileKindIcon kind={fileKindFromName(image.absolutePath)} size={22} />
          </span>
        ) : (
          <span>{t("common.noPhoto")}</span>
        )}
      </div>
      <div className="title-cell">
        <strong>{artwork.title}</strong>
      </div>
      <span className="art-cell-text" title={seriesLabel(artwork.series, t)}>
        {seriesLabel(artwork.series, t)}
      </span>
      <span className="art-cell-text">
        {labelFor(inventory, "artworkType", artwork.type, lang)}
      </span>
      <span className="art-cell-year">{artwork.yearMade || "—"}</span>
      <div className={`status-cell status-${slugify(artwork.status)}`}>
        <span
          className={`status-pill st-${slugify(artwork.status)}`}
          title={statusLabel}
        >
          {statusLabel}
        </span>
        {overdue && (
          <RetrievalMark
            artwork={artwork}
            movement={overdue}
            inventory={inventory}
            setInventory={setInventory}
          />
        )}
      </div>
    </div>
  );
}

function RetrievalMark({
  artwork,
  movement,
  inventory,
  setInventory
}: {
  artwork: Artwork;
  movement: Movement;
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const where =
    movementKind(movement.type) === "exhibition"
      ? movement.exhibitionTitle ||
        exhibitionTitle(inventory, movement.exhibitionId) ||
        t("library.overdue.whereExhibition")
      : movement.contactName ||
        contactName(inventory, movement.contactId) ||
        t("library.overdue.whereLoan");

  async function markBack() {
    const data = await window.inventoryApi.markMovementReturned(movement.id);
    setInventory(data);
    setConfirming(false);
  }

  return (
    <>
      <button
        type="button"
        className="retrieve-mark"
        title={t("library.overdue.tooltip")}
        onClick={(event) => {
          event.stopPropagation();
          setConfirming(true);
        }}
      >
        !
      </button>
      {confirming && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            setConfirming(false);
          }}
        >
          <div className="modal confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>{t("library.overdue.title")}</h3>
            </div>
            <p className="confirm-message">
              {t("library.overdue.message", { title: artwork.title, where })}
            </p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setConfirming(false)}>
                {t("library.overdue.notYet")}
              </button>
              <button onClick={markBack}>{t("library.overdue.confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ----------------------------------------------------------------------------
 * Artwork form
 * ------------------------------------------------------------------------- */

function ArtworkForm({
  inventory,
  artwork,
  setInventory,
  onNew,
  onSaved,
  onBackToList,
  onDirtyChange,
  saveRef
}: {
  inventory: InventoryData;
  artwork: ArtworkInput;
  setInventory: (data: InventoryData) => void;
  onNew: () => void;
  onSaved: (savedId: string, data: InventoryData) => void;
  onBackToList: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: MutableRefObject<null | (() => Promise<boolean>)>;
}) {
  const { lang, t } = useLanguage();
  const [form, setForm] = useState<ArtworkInput>(artwork);
  const [tab, setTab] = useState<FormTab>("info");
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [collapseSignal, setCollapseSignal] = useState(0);
  // Photo chosen/edited before saving: kept locally and imported when the
  // artwork is saved, so choosing a photo never requires a title first.
  const [pendingImage, setPendingImage] = useState<{
    path?: string;
    dataUrl: string;
    originalDataUrl?: string;
    keepOriginalAsExtra?: boolean;
  } | null>(null);
  const [imageEditorSrc, setImageEditorSrc] = useState<string | null>(null);
  const photoDrop = useFileDragOver(!locked);

  useEffect(() => {
    onDirtyChange?.(false);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = async () => {
      const data = await persistCurrent();
      if (data) onDirtyChange?.(false);
      return Boolean(data);
    };
    return () => {
      if (saveRef) saveRef.current = null;
    };
  });

  const isSeries = form.editionMode === "multiple";
  const isIpadDrawing = form.type === "ipad_drawing";

  function update<K extends keyof ArtworkInput>(key: K, value: ArtworkInput[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      // Ipad Drawings have no physical size — clear measures when switching to it.
      if (key === "type" && value === "ipad_drawing") {
        next.height = "";
        next.width = "";
        next.depth = "";
      }
      return next;
    });
    onDirtyChange?.(true);
  }

  function setMovements(movements: MovementInput[]) {
    setForm((current) => ({ ...current, movements }));
    onDirtyChange?.(true);
  }

  function validateArtworkForm(): string | null {
    if (!form.title.trim()) return t("artwork.error.needTitle");
    if (!form.type.trim()) return t("artwork.error.needType");
    if (!(form.series ?? "").trim()) return t("artwork.error.needSeries");
    if (!String(form.yearMade ?? "").trim()) return t("artwork.error.needYear");
    if (!isIpadDrawing) {
      const h = String(form.height ?? "").trim();
      const w = String(form.width ?? "").trim();
      if (!h || !(Number(h.replace(",", ".")) > 0)) {
        return t("artwork.error.needHeight");
      }
      if (!w || !(Number(w.replace(",", ".")) > 0)) {
        return t("artwork.error.needWidth");
      }
      if (!form.unit) return t("artwork.error.needUnit");
    }
    if (!form.editionMode) return t("artwork.error.needEdition");
    if (form.editionMode === "multiple") {
      const sale = Math.max(0, Number(form.editionSaleCopies || 0));
      if (sale <= 0) return t("artwork.error.needSaleCopies");
      const editions = form.editions ?? [];
      const saleEditions = editions.filter((e) => e.kind !== "personal");
      if (saleEditions.length === 0) return t("artwork.error.needGenerateCopies");
    }
    return null;
  }

  async function persistCurrent(): Promise<InventoryData | null> {
    const problem = validateArtworkForm();
    if (problem) {
      setError(problem);
      setTab("info");
      return null;
    }
    const payload: ArtworkInput = isIpadDrawing
      ? { ...form, height: "", width: "", depth: "" }
      : form;
    setError("");
    let data = await window.inventoryApi.saveArtwork(payload);
    let saved =
      (form.id && data.artworks.find((item) => item.id === form.id)) ||
      [...data.artworks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (saved && pendingImage) {
      const result = await importEditedArtworkImage(
        pendingImage.dataUrl,
        saved.id,
        {
          originalDataUrl: pendingImage.originalDataUrl,
          keepOriginalAsExtra: pendingImage.keepOriginalAsExtra
        }
      );
      if (result?.inventory) {
        data = result.inventory;
        saved = data.artworks.find((item) => item.id === saved!.id) ?? saved;
      }
      setPendingImage(null);
    }
    setInventory(data);
    if (saved) setForm(toInput(saved, data));
    return saved ? data : null;
  }

  async function save() {
    try {
      const data = await persistCurrent();
      if (!data) return;
      const saved = [...data.artworks].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      )[0];
      const target = (form.id && data.artworks.find((i) => i.id === form.id)) || saved;
      setLocked(true);
      setCollapseSignal((value) => value + 1);
      onDirtyChange?.(false);
      if (target) onSaved(target.id, data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error.save"));
    }
  }

  async function addImage() {
    try {
      const picked = await window.inventoryApi.pickImagePath();
      if (!picked) return;
      setImageEditorSrc(picked.dataUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("artwork.error.addPhoto"));
    }
  }

  async function acceptDroppedMainImage(file: File) {
    if (locked || !isDropImageFile(file)) {
      setError(t("artwork.error.dropImageOnly"));
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageEditorSrc(dataUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("artwork.error.addPhoto"));
    }
  }

  function saveEditedImage(result: ImageEditSaveResult) {
    setPendingImage({
      dataUrl: result.editedDataUrl,
      originalDataUrl: result.originalDataUrl,
      keepOriginalAsExtra: result.keepOriginalAsExtra
    });
    setImageEditorSrc(null);
    onDirtyChange?.(true);
  }

  const image = form.id
    ? mainImageFor({ id: form.id, mainImageId: form.mainImageId } as Artwork, inventory)
    : undefined;
  const imageUrl = useImageDataUrl(image?.absolutePath);
  const editions = form.editions ?? [];

  return (
    <div className="form-card artwork-form">
      <div className="form-head artwork-form-head">
        <div>
          <p className="eyebrow">
            {form.id ? t("artwork.form.titleEdit") : t("artwork.form.titleNew")}
          </p>
          <h2>{form.title.trim() || t("artwork.form.fallbackTitle")}</h2>
        </div>
        <div className="form-head-actions">
          {locked ? (
            <>
              <span className="saved-badge">{t("common.saved")}</span>
              <button type="button" onClick={() => setLocked(false)}>
                {t("common.edit")}
              </button>
              <button type="button" className="ghost" onClick={onNew}>
                {t("artwork.form.newButton")}
              </button>
              <button type="button" className="ghost" onClick={onBackToList}>
                {t("common.back")}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void save()}>
                {t("common.save")}
              </button>
              <button type="button" className="ghost" onClick={onNew}>
                {t("artwork.form.newButton")}
              </button>
              <button type="button" className="ghost" onClick={onBackToList}>
                {t("common.cancel")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="artwork-form-layout">
        <aside
          className={`artwork-form-photo${photoDrop.over ? " is-file-drag" : ""}`}
          {...photoDrop.handlers}
          onDrop={(event) => {
            if (locked) return;
            event.preventDefault();
            event.stopPropagation();
            photoDrop.reset();
            const file = filesFromDropEvent(event).find(isDropImageFile);
            if (file) void acceptDroppedMainImage(file);
            else if (filesFromDropEvent(event).length > 0) {
              setError(t("artwork.error.dropImageOnly"));
            }
          }}
        >
          <button
            type="button"
            className={`artwork-photo-frame${
              pendingImage || imageUrl || image?.absolutePath ? " has-image" : ""
            }${photoDrop.over ? " is-file-drag" : ""}`}
            onClick={() => {
              if (!locked) void addImage();
            }}
            disabled={locked}
            title={
              pendingImage || imageUrl || image?.absolutePath
                ? t("artwork.photo.change")
                : t("artwork.photo.add")
            }
          >
            {pendingImage ? (
              <img src={pendingImage.dataUrl} alt="" />
            ) : imageUrl ? (
              <img src={imageUrl} alt="" />
            ) : image?.absolutePath ? (
              <span className="artwork-photo-file-fallback">
                <FileKindIcon kind={fileKindFromName(image.absolutePath)} size={40} />
                <span>{documentDisplayName(image, t("common.documentOne"))}</span>
              </span>
            ) : (
              <span className="artwork-photo-empty">
                <span className="artwork-photo-plus">+</span>
                <span>{t("artwork.photo.add")}</span>
              </span>
            )}
          </button>
          <p className="muted small-note artwork-photo-hint">
            {pendingImage
              ? t("artwork.photo.hint.ready")
              : locked
                ? t("artwork.photo.hint.locked")
                : t("artwork.photo.hint.click")}
          </p>
        </aside>

        <div className="artwork-form-main">
          <div className="subtabs artwork-form-tabs">
            <SubTab active={tab === "info"} onClick={() => setTab("info")}>
              {t("artwork.tab.info")}
            </SubTab>
            <SubTab
              active={tab === "movimientos"}
              onClick={() => setTab("movimientos")}
            >
              {(form.movements?.length ?? 0) > 0
                ? t("artwork.tab.movementsCount", {
                    count: form.movements!.length
                  })
                : t("artwork.tab.movements")}
            </SubTab>
          </div>

          <fieldset className="tab-fieldset" disabled={locked}>
            {tab === "info" && (
              <div className="form-section artwork-form-section">
                <div className="form-group">
                  <p className="form-group-label">{t("artwork.section.identity")}</p>
                  <label className="field">
                    {t("artwork.field.title")}
                    <input
                      value={form.title}
                      placeholder={t("artwork.field.titlePlaceholder")}
                      onChange={(event) => update("title", event.target.value)}
                    />
                  </label>

                  <label className="field">
                    {t("artwork.field.id")}
                    <input
                      className="artwork-id-readonly"
                      value={
                        form.id ||
                        buildArtworkIdBase({
                          title: form.title,
                          yearMade: form.yearMade,
                          height: isIpadDrawing ? "" : form.height,
                          width: isIpadDrawing ? "" : form.width,
                          unit: form.unit
                        })
                      }
                      placeholder={t("artwork.field.idPlaceholder")}
                      readOnly
                      disabled
                      title={
                        form.id
                          ? t("artwork.field.idHintSaved")
                          : t("artwork.field.idHintPreview")
                      }
                    />
                  </label>

                  <div className="form-row">
                    <LookupSelect
                      inventory={inventory}
                      setInventory={setInventory}
                      category="artworkType"
                      label={t("artwork.field.type")}
                      value={form.type}
                      onChange={(value) => update("type", value)}
                    />
                    <SeriesField
                      inventory={inventory}
                      value={form.series ?? ""}
                      onChange={(value) => update("series", value)}
                    />
                  </div>

                  <div className="form-row">
                    <label className="field">
                      {t("artwork.field.year")}
                      <input
                        inputMode="numeric"
                        maxLength={4}
                        placeholder={t("artwork.field.yearPlaceholder")}
                        value={form.yearMade ?? ""}
                        onChange={(event) =>
                          update(
                            "yearMade",
                            event.target.value.replace(/[^0-9]/g, "").slice(0, 4)
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      {t("artwork.field.status")}
                      <input
                        className="artwork-status-readonly"
                        value={
                          isSeries
                            ? t("artwork.status.perCopy")
                            : labelFor(
                                inventory,
                                "status",
                                displayStatusFromMovements(
                                  form.movements ?? [],
                                  inventory
                                ),
                                lang
                              )
                        }
                        disabled
                        readOnly
                      />
                    </label>
                  </div>
                  <p className="muted small-note">
                    {t("artwork.status.hint")}
                  </p>
                </div>

                <div className="form-group">
                  <p className="form-group-label">{t("artwork.section.dimensions")}</p>
                  {isIpadDrawing ? (
                    <p className="muted small-note">{t("artwork.dimensions.ipadNote")}</p>
                  ) : (
                    <div className="dimensions-row">
                      <label className="field">
                        {t("artwork.field.height")}
                        <input
                          inputMode="decimal"
                          value={form.height ?? ""}
                          onChange={(event) =>
                            update("height", event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        {t("artwork.field.width")}
                        <input
                          inputMode="decimal"
                          value={form.width ?? ""}
                          onChange={(event) =>
                            update("width", event.target.value)
                          }
                        />
                      </label>
                      <label className="field">
                        {t("artwork.field.depth")}
                        <input
                          inputMode="decimal"
                          value={form.depth ?? ""}
                          placeholder={t("artwork.field.depthOptional")}
                          onChange={(event) =>
                            update("depth", event.target.value)
                          }
                        />
                      </label>
                      <label className="field unit-field">
                        {t("artwork.field.unit")}
                        <select
                          value={form.unit}
                          onChange={(event) =>
                            update("unit", event.target.value as "cm" | "in")
                          }
                        >
                          <option value="cm">cm</option>
                          <option value="in">{t("artwork.field.inches")}</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <p className="form-group-label">{t("artwork.section.edition")}</p>
                  <EditionBlock
                    inventory={inventory}
                    setInventory={setInventory}
                    form={form}
                    update={update}
                    setForm={setForm}
                  />
                </div>

                <div className="form-group">
                  <p className="form-group-label">{t("artwork.section.notes")}</p>
                  <label className="field">
                    <span className="sr-only">{t("artwork.section.notes")}</span>
                    <textarea
                      className="notes-area"
                      placeholder={t("artwork.field.notesPlaceholder")}
                      value={form.notes ?? ""}
                      onChange={(event) => update("notes", event.target.value)}
                    />
                  </label>
                </div>
              </div>
            )}

            {tab === "movimientos" && (
              <MovementEditor
                inventory={inventory}
                setInventory={setInventory}
                isSeries={isSeries}
                editions={editions}
                movements={form.movements ?? []}
                onChange={setMovements}
                artworkDraft={form}
                collapseSignal={collapseSignal}
              />
            )}
          </fieldset>
        </div>
      </div>

      {imageEditorSrc ? (
        <Suspense fallback={null}>
          <ImageEditModal
            sourceDataUrl={imageEditorSrc}
            mode="upload"
            onCancel={() => setImageEditorSrc(null)}
            onSave={saveEditedImage}
          />
        </Suspense>
      ) : null}

      {error && <div className="error-banner">{error}</div>}

      {!locked && (
        <div className="form-actions artwork-form-actions">
          <button type="button" onClick={() => void save()}>
            {t("common.save")}
          </button>
          <button type="button" className="ghost" onClick={onBackToList}>
            {t("common.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}

function EditionBlock({
  inventory,
  form,
  update,
  setForm
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  form: ArtworkInput;
  update: <K extends keyof ArtworkInput>(key: K, value: ArtworkInput[K]) => void;
  setForm: Dispatch<SetStateAction<ArtworkInput>>;
}) {
  const { lang, t } = useLanguage();
  function generate() {
    const personal = Math.max(0, Number(form.editionPersonalCopies || 0));
    const sale = Math.max(0, Number(form.editionSaleCopies || 0));
    const existing = form.editions ?? [];
    const byLabel = new Map(existing.map((item) => [item.label, item]));
    const next: EditionInput[] = [];
    for (let i = 1; i <= personal; i += 1) {
      const label = `P/A ${i}`;
      next.push(
        byLabel.get(label) ?? {
          id: uid(),
          label,
          kind: "personal",
          status: "not_made",
          notes: ""
        }
      );
    }
    for (let i = 1; i <= sale; i += 1) {
      const label = `${i}/${sale}`;
      next.push(
        byLabel.get(label) ?? {
          id: uid(),
          label,
          kind: "edition",
          status: "not_made",
          notes: ""
        }
      );
    }
    setForm((current) => ({ ...current, editions: next }));
  }

  function setEditionStatus(id: string | undefined, status: string) {
    setForm((current) => ({
      ...current,
      editions: (current.editions ?? []).map((edition) =>
        (edition.id ?? edition.label) === id ? { ...edition, status } : edition
      )
    }));
  }

  const editions = form.editions ?? [];

  return (
    <div className="edition-block">
      <label className="field">
        {t("artwork.edition.question")}
        <select
          value={form.editionMode ?? "unique"}
          onChange={(event) =>
            update("editionMode", event.target.value as ArtworkInput["editionMode"])
          }
        >
          <option value="unique">{t("artwork.edition.unique")}</option>
          <option value="multiple">{t("artwork.edition.multiple")}</option>
        </select>
      </label>

      {form.editionMode === "multiple" && (
        <div className="edition-detail">
          <div className="form-row">
            <label className="field">
              {t("artwork.edition.personalCopies")}
              <input
                type="number"
                min="0"
                value={form.editionPersonalCopies ?? "0"}
                onChange={(event) => update("editionPersonalCopies", event.target.value)}
              />
            </label>
            <label className="field">
              {t("artwork.edition.editionCopies")}
              <input
                type="number"
                min="0"
                value={form.editionSaleCopies ?? "0"}
                onChange={(event) => update("editionSaleCopies", event.target.value)}
              />
            </label>
          </div>
          <button type="button" className="ghost small" onClick={generate}>
            {t("artwork.edition.generate")}
          </button>
          {editions.length > 0 && (
            <div className="copy-list">
              <div className="copy-list-head">{t("artwork.edition.copyStatus")}</div>
              {editions.map((edition) => (
                <div className="copy-row" key={edition.id ?? edition.label}>
                  <span className="copy-chip">{edition.label}</span>
                  <select
                    value={edition.status || "not_made"}
                    onChange={(event) =>
                      setEditionStatus(edition.id ?? edition.label, event.target.value)
                    }
                  >
                    {translatedLookupOptions(inventory, "status", lang)
                      .filter((option) => option.value !== "per_copy")
                      .map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          <p className="muted small-note">{t("artwork.edition.copyHint")}</p>
        </div>
      )}
    </div>
  );
}

function MovementEditor({
  inventory,
  setInventory,
  isSeries,
  editions,
  movements,
  onChange,
  artworkDraft
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  isSeries: boolean;
  editions: EditionInput[];
  movements: MovementInput[];
  onChange: (items: MovementInput[]) => void;
  artworkDraft: ArtworkInput;
  collapseSignal?: number;
}) {
  const { lang, t } = useLanguage();
  const [editing, setEditing] = useState<
    { mode: "new" } | { mode: "edit"; index: number } | null
  >(null);
  const [saveError, setSaveError] = useState("");

  const newDraft: MovementInput = {
    type: "exhibition",
    recipientType: "person",
    contactId: "",
    editionId: "",
    exhibitionId: "",
    context: "",
    returned: true,
    keptAtGallery: false,
    date: "",
    price: "",
    currency: "EUR",
    taxCharged: true,
    notes: ""
  };

  function update(index: number, patch: Partial<MovementInput>) {
    onChange(
      movements.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function remove(index: number) {
    onChange(movements.filter((_item, itemIndex) => itemIndex !== index));
  }

  function validateSale(next: MovementInput, editIndex: number | null): string {
    if (movementKind(next.type) !== "sale") return "";
    const others = movements.filter((_item, index) => index !== editIndex);
    if (!isSeries) {
      if (others.some((item) => movementKind(item.type) === "sale")) {
        return t("movement.error.singleSale");
      }
      return "";
    }
    const key = (next.editionId ?? "").trim();
    const clash = others.some(
      (item) =>
        movementKind(item.type) === "sale" &&
        (item.editionId ?? "").trim() === key
    );
    if (clash) {
      return key
        ? t("movement.error.copySale")
        : t("movement.error.wholeSaleDup");
    }
    return "";
  }

  function validateMovement(
    next: MovementInput,
    editIndex: number | null
  ): string {
    const date = (next.date ?? "").trim();
    if (!date) {
      return t("movement.error.needDate");
    }
    const saleError = validateSale(next, editIndex);
    if (saleError) return saleError;

    if (isSeries) return "";

    const others = movements.filter((_item, index) => index !== editIndex);
    const otherTerminal = others.find((item) => isTerminalMovementType(item.type));
    if (isTerminalMovementType(next.type) && otherTerminal) {
      return t("movement.error.singleTerminal");
    }
    const terminal = isTerminalMovementType(next.type) ? next : otherTerminal;
    if (!terminal) return "";
    const terminalMs = movementDateValue(terminal as Movement);
    if (isTerminalMovementType(next.type)) {
      const later = others.find(
        (item) => movementDateValue(item as Movement) > terminalMs
      );
      if (later) {
        return t("movement.error.afterTerminal");
      }
      return "";
    }
    if (movementDateValue(next as Movement) > terminalMs) {
      return t("movement.error.afterTerminal");
    }
    return "";
  }

  const order = movements
    .map((movement, index) => ({ movement, index }))
    .sort((a, b) => movementDateValue(b.movement) - movementDateValue(a.movement));

  return (
    <div className="form-section movements-editor">
      <div className="movements-intro">
        <p>{t("movement.intro")}</p>
      </div>
      <div className="movements-timeline">
        {order.length === 0 ? (
          <div className="movements-empty">
            <strong>{t("movement.empty.title")}</strong>
            <p className="muted">
              {t("movement.empty.hint")}
            </p>
          </div>
        ) : (
          order.map(({ movement, index }) => {
            const kind = movementKind(movement.type);
            return (
              <div
                className={`mv-card mv-card-${kind}`}
                key={`${index}-${movement.type}-${movement.date}`}
              >
                <div className="mv-card-main">
                  <span className={`mv-pill mv-pill-${kind}`}>
                    {labelFor(inventory, "movementType", movement.type, lang) ||
                      movement.type}
                  </span>
                  <button
                    type="button"
                    className="mv-card-open"
                    onClick={() => {
                      setSaveError("");
                      setEditing({ mode: "edit", index });
                    }}
                  >
                    <strong>
                      {movementSummary(movement as Movement, inventory, t, lang)}
                    </strong>
                    <span className="muted">
                      {[
                        movement.date || t("common.noDate"),
                        movementSubtitle(movement as Movement, inventory, t)
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  className="ghost danger small"
                  onClick={() => remove(index)}
                >
                  {t("movement.remove")}
                </button>
              </div>
            );
          })
        )}
      </div>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          setSaveError("");
          setEditing({ mode: "new" });
        }}
      >
        {t("movement.add")}
      </button>
      {saveError && <p className="error-inline">{saveError}</p>}

      {editing && (
        <MovementModal
          inventory={inventory}
          setInventory={setInventory}
          isSeries={isSeries}
          editions={editions}
          artworkDraft={artworkDraft}
          isNew={editing.mode === "new"}
          draft={editing.mode === "edit" ? movements[editing.index] : newDraft}
          blockTerminalTypes={
            !isSeries &&
            movements.some(
              (item, index) =>
                (editing.mode === "new" || index !== editing.index) &&
                isTerminalMovementType(item.type)
            )
          }
          onClose={() => {
            setSaveError("");
            setEditing(null);
          }}
          onSave={(value) => {
            const error = validateMovement(
              value,
              editing.mode === "edit" ? editing.index : null
            );
            if (error) return error;
            setSaveError("");
            if (editing.mode === "new") {
              onChange([...movements, value]);
            } else {
              update(editing.index, value);
            }
            setEditing(null);
            return null;
          }}
          onRemove={
            editing.mode === "edit"
              ? () => {
                  remove(editing.index);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function MovementModal({
  inventory,
  setInventory,
  isSeries,
  editions,
  artworkDraft,
  draft,
  isNew,
  blockTerminalTypes = false,
  onSave,
  onClose,
  onRemove
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  isSeries: boolean;
  editions: EditionInput[];
  artworkDraft: ArtworkInput;
  draft: MovementInput;
  isNew: boolean;
  blockTerminalTypes?: boolean;
  onSave: (movement: MovementInput) => string | null;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const t = useT();
  const [m, setM] = useState<MovementInput>(draft);
  const [localError, setLocalError] = useState("");
  const set = (patch: Partial<MovementInput>) => {
    setLocalError("");
    setM((current) => ({ ...current, ...patch }));
  };
  const kind = movementKind(m.type);
  const isGallery = m.recipientType === "gallery";
  const dateMissing = !(m.date ?? "").trim();
  const settings: AppSettings = {
    sizeTypes: inventory.settings.sizeTypes ?? [],
    taxRates: inventory.settings.taxRates ?? [],
    textGeneratorSystemPrompt: inventory.settings.textGeneratorSystemPrompt
  };

  function paymentHalfAt(date?: string) {
    const ms = dateToMs(date);
    const at = Number.isFinite(ms) ? (ms as number) : Date.now();
    return galleryPaymentHalfInfo(artworkDraft, settings, at, t);
  }

  function applyType(value: string) {
    const nextKind = movementKind(value);
    if (nextKind === "payment") {
      const { half } = paymentHalfAt(m.date);
      set({
        type: value,
        recipientType: "gallery",
        price: half != null ? String(half) : ""
      });
      return;
    }
    set({ type: value });
  }

  const paymentInfo = kind === "payment" ? paymentHalfAt(m.date) : null;

  useEffect(() => {
    if (kind !== "payment") return;
    if (paymentInfo?.half == null) return;
    const current = parseMoney(m.price);
    // Fill when empty; keep a manual value if the user already typed one
    // that differs from the auto amount.
    if (current == null) {
      setM((currentMove) =>
        currentMove.price
          ? currentMove
          : { ...currentMove, price: String(paymentInfo.half) }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, m.date, artworkDraft.height, artworkDraft.width, artworkDraft.unit]);

  const hideTerminal = blockTerminalTypes
    ? ["sale", "venta", "payment", "pago", "lost", "perdido", "perdida"]
    : undefined;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{isNew ? t("movement.modal.add") : t("movement.modal.edit")}</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {blockTerminalTypes && isTerminalMovementType(m.type) && (
            <p className="error-inline">{t("movement.error.terminalExists")}</p>
          )}
          {isSeries && (
            <label className="field">
              {t("movement.copy.which")}
              <select
                value={m.editionId ?? ""}
                onChange={(event) => set({ editionId: event.target.value })}
              >
                <option value="">{t("movement.copy.whole")}</option>
                {editions.map((edition) => (
                  <option key={edition.id ?? edition.label} value={edition.id ?? ""}>
                    {edition.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="form-row">
            <LookupSelect
              inventory={inventory}
              setInventory={setInventory}
              category="movementType"
              label={t("movement.field.type")}
              value={m.type}
              onChange={applyType}
              hideValues={hideTerminal}
            />
            {kind !== "exhibition" && kind !== "loan" && (
              <label className="field">
                {t("movement.field.date")}
                <DateField
                  value={m.date ?? ""}
                  onChange={(value) => {
                    if (kind === "payment") {
                      const { half } = paymentHalfAt(value);
                      set({
                        date: value,
                        price: half != null ? String(half) : ""
                      });
                    } else {
                      set({ date: value });
                    }
                  }}
                />
              </label>
            )}
          </div>

          {kind === "loan" ? (
            <div className="context-box">
              <div className="form-row">
                <label className="field">
                  {t("movement.loan.from")}
                  <DateField value={m.date ?? ""} onChange={(value) => set({ date: value })} />
                </label>
                <label className="field">
                  {t("movement.loan.until")}
                  <DateField
                    value={m.endDate ?? ""}
                    onChange={(value) => set({ endDate: value })}
                  />
                </label>
              </div>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={m.indefinite ?? false}
                  onChange={(event) =>
                    set({
                      indefinite: event.target.checked,
                      endDate: event.target.checked ? "" : m.endDate
                    })
                  }
                />
                {t("movement.loan.indefinite")}
              </label>
              <div className="form-row">
                <label className="field">
                  {t("movement.loan.personOrGallery")}
                  <select
                    value={m.recipientType ?? "person"}
                    onChange={(event) =>
                      set({
                        recipientType: event.target.value as ContactKind,
                        contactId: ""
                      })
                    }
                  >
                    <option value="person">{t("movement.loan.person")}</option>
                    <option value="gallery">{t("movement.loan.gallery")}</option>
                  </select>
                </label>
                <ContactSelect
                  inventory={inventory}
                  setInventory={setInventory}
                  label={
                    isGallery ? t("movement.loan.gallery") : t("movement.loan.person")
                  }
                  kind={isGallery ? "gallery" : "person"}
                  value={m.contactId ?? ""}
                  onChange={(value) => set({ contactId: value })}
                />
              </div>
              <label className="checkline strong">
                <input
                  type="checkbox"
                  checked={m.returned ?? false}
                  onChange={(event) => set({ returned: event.target.checked })}
                />
                {t("movement.loan.returned")}
              </label>
              <p className="muted small-note">{t("movement.loan.warningHint")}</p>
            </div>
          ) : kind === "payment" ? (
            <div className="context-box">
              <p className="muted small-note">{t("movement.payment.hint")}</p>
              <ContactSelect
                inventory={inventory}
                setInventory={setInventory}
                label={t("movement.payment.gallery")}
                kind="gallery"
                value={m.contactId ?? ""}
                onChange={(value) => set({ contactId: value, recipientType: "gallery" })}
              />
              <label className="field">
                {t("movement.payment.value")}
                <div className="payment-value-row">
                  <input
                    inputMode="decimal"
                    placeholder={t("movement.payment.valuePlaceholder")}
                    value={m.price ?? ""}
                    onChange={(event) => set({ price: event.target.value })}
                  />
                  {paymentInfo?.problem ? (
                    <span
                      className="payment-value-warn"
                      title={paymentInfo.problem}
                      aria-label={paymentInfo.problem}
                    >
                      !
                    </span>
                  ) : null}
                </div>
                {paymentInfo?.problem ? (
                  <span className="payment-value-hint error-inline">
                    {paymentInfo.problem}
                  </span>
                ) : paymentInfo?.half != null ? (
                  <span className="muted small-note">
                    {t("movement.payment.autoCalc", {
                      amount: formatMoney(paymentInfo.half * 2)
                    })}
                  </span>
                ) : (
                  <span className="muted small-note">
                    {t("movement.payment.autoFill")}
                  </span>
                )}
              </label>
            </div>
          ) : kind === "lost" ? (
            <div className="context-box">
              <p className="muted small-note">{t("movement.lost.hint")}</p>
            </div>
          ) : kind === "exhibition" ? (
            <div className="context-box">
              <ExhibitionSelect
                inventory={inventory}
                setInventory={setInventory}
                value={m.exhibitionId ?? ""}
                onChange={(value) =>
                  set({
                    exhibitionId: value,
                    date:
                      inventory.exhibitions.find((item) => item.id === value)?.startDate ??
                      m.date
                  })
                }
              />
              <p className="muted small-note">
                {t("movement.exhibition.dateFromShow")}
              </p>
              <label className="checkline strong">
                <input
                  type="checkbox"
                  checked={m.returned ?? false}
                  onChange={(event) =>
                    set({
                      returned: event.target.checked,
                      keptAtGallery: event.target.checked ? false : m.keptAtGallery
                    })
                  }
                />
                {t("movement.loan.returned")}
              </label>
              {!(m.returned ?? false) && (
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={m.keptAtGallery ?? false}
                    onChange={(event) => set({ keptAtGallery: event.target.checked })}
                  />
                  {t("movement.exhibition.stayedWithGallery")}
                </label>
              )}
              <p className="muted small-note">
                {t("movement.exhibition.warningHint")}
              </p>
              <label className="field">
                {t("movement.exhibition.listedPriceOptional")}
                <input
                  inputMode="decimal"
                  placeholder={t("movement.exhibition.listedPricePlaceholder")}
                  value={m.listedPrice ?? ""}
                  onChange={(event) => set({ listedPrice: event.target.value })}
                />
              </label>
            </div>
          ) : kind === "sale" ? (
            <>
              <div className="form-row">
                <label className="field">
                  {t("movement.field.price")}
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={m.price ?? ""}
                    onChange={(event) => set({ price: event.target.value })}
                  />
                </label>
                <label className="field">
                  {t("movement.sale.context")}
                  <select
                    value={m.context ?? ""}
                    onChange={(event) =>
                      set({
                        context: event.target.value as MovementContext,
                        contactId: "",
                        exhibitionId: ""
                      })
                    }
                  >
                    <option value="">{t("movement.sale.direct")}</option>
                    <option value="gallery">{t("movement.sale.viaGallery")}</option>
                    <option value="exhibition">{t("movement.sale.atExhibition")}</option>
                  </select>
                </label>
              </div>
              <label className="field">
                {t("movement.sale.taxAsked")}
                <select
                  value={m.taxCharged === false ? "no" : "yes"}
                  onChange={(event) =>
                    set({ taxCharged: event.target.value !== "no" })
                  }
                >
                  <option value="yes">{t("common.yes")}</option>
                  <option value="no">{t("common.no")}</option>
                </select>
                <span className="muted small-note">
                  {t("movement.sale.taxNoNote")}
                </span>
              </label>
              <div className="context-box">
                {m.context === "gallery" ? (
                  <ContactSelect
                    inventory={inventory}
                    setInventory={setInventory}
                    label={t("movement.sale.galleryQuestion")}
                    kind="gallery"
                    value={m.contactId ?? ""}
                    onChange={(value) => set({ contactId: value })}
                  />
                ) : (
                  <ContactSelect
                    inventory={inventory}
                    setInventory={setInventory}
                    label={t("movement.sale.buyer")}
                    kind="person"
                    value={m.contactId ?? ""}
                    onChange={(value) => set({ contactId: value })}
                  />
                )}
                {m.context === "exhibition" && (
                  <ExhibitionSelect
                    inventory={inventory}
                    setInventory={setInventory}
                    value={m.exhibitionId ?? ""}
                    onChange={(value) => set({ exhibitionId: value })}
                  />
                )}
                {(m.context === "gallery" || m.context === "exhibition") && (
                  <label className="field">
                    {t("movement.sale.received")}
                    <input
                      inputMode="decimal"
                      placeholder={t("movement.sale.receivedPlaceholder")}
                      value={m.received ?? ""}
                      onChange={(event) => set({ received: event.target.value })}
                    />
                    <span className="muted small-note">
                      {t("movement.sale.commissionNote")}
                    </span>
                  </label>
                )}
              </div>
            </>
          ) : (
            <div className="form-row">
              <label className="field">
                {t("movement.loan.personOrGallery")}
                <select
                  value={m.recipientType ?? "person"}
                  onChange={(event) =>
                    set({
                      recipientType: event.target.value as ContactKind,
                      contactId: ""
                    })
                  }
                >
                  <option value="person">{t("movement.loan.person")}</option>
                  <option value="gallery">{t("movement.loan.gallery")}</option>
                </select>
              </label>
              <ContactSelect
                inventory={inventory}
                setInventory={setInventory}
                label={
                  isGallery ? t("movement.loan.gallery") : t("movement.loan.person")
                }
                kind={isGallery ? "gallery" : "person"}
                value={m.contactId ?? ""}
                onChange={(value) => set({ contactId: value })}
              />
            </div>
          )}

          <label className="field">
            {t("movement.field.notes")}
            <input
              value={m.notes ?? ""}
              onChange={(event) => set({ notes: event.target.value })}
            />
          </label>
          {localError && <p className="error-inline">{localError}</p>}
        </div>
        <div className="modal-actions">
          {!isNew && onRemove && (
            <button type="button" className="ghost danger-text" onClick={onRemove}>
              {t("movement.removeFull")}
            </button>
          )}
          <button
            type="button"
            disabled={blockTerminalTypes && isTerminalMovementType(m.type)}
            onClick={() => {
              if (dateMissing) {
                setLocalError(t("movement.error.needDate"));
                return;
              }
              let toSave = m;
              if (kind === "payment") {
                const { half } = paymentHalfAt(m.date);
                const stored = parseMoney(m.price);
                if (half != null && (stored == null || stored <= 0)) {
                  toSave = { ...m, price: String(half) };
                }
              }
              const error = onSave(toSave);
              if (error) {
                setLocalError(error);
                return;
              }
              setLocalError("");
            }}
          >
            {t("movement.save")}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExhibitionSelect({
  inventory,
  setInventory,
  value,
  onChange
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [showModal, setShowModal] = useState(false);
  const exhibitions = [...inventory.exhibitions].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  return (
    <div className="field lookup-field">
      <span className="field-label">{t("movement.exhibition.select")}</span>
      <div className="lookup-row">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t("common.selectPlaceholder")}</option>
          {exhibitions.map((exhibition) => (
            <option key={exhibition.id} value={exhibition.id}>
              {exhibition.title}
              {exhibition.city ? ` · ${exhibition.city}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button add wide"
          title={t("movement.exhibition.createNew")}
          onClick={() => setShowModal(true)}
        >
          +
        </button>
      </div>
      {showModal && (
        <ExhibitionModal
          setInventory={setInventory}
          onClose={() => setShowModal(false)}
          onCreated={(id) => {
            onChange(id);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Detail
 * ------------------------------------------------------------------------- */

function formatBytes(bytes: number): string {
  return bytes >= 1000 * 1000
    ? `${(bytes / 1000 / 1000).toFixed(2)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function cmFromPixels(px: number, dpi: number): number {
  return (px / dpi) * 2.54;
}

function pxFromCm(cm: number, dpi: number): number {
  return Math.round((cm / 2.54) * dpi);
}

function formatCm(cm: number): string {
  return cm >= 10 ? cm.toFixed(0) : cm.toFixed(1);
}

function ExportThumb({
  image,
  active,
  label,
  onClick
}: {
  image: ArtworkImage;
  active: boolean;
  label?: string;
  onClick: () => void;
}) {
  const name = documentDisplayName(image, "");
  const kind = fileKindFromName(name);
  const showInline = canInlineImagePreview(name);
  const url = useImageDataUrl(showInline ? image.absolutePath : undefined);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [image.id, url]);
  const showImage = showInline && Boolean(url) && !broken;
  return (
    <button
      type="button"
      className={`export-thumb${active ? " active" : ""}${
        showImage ? "" : " is-icon"
      }`}
      onClick={onClick}
    >
      {showImage ? (
        <img src={url} alt="" onError={() => setBroken(true)} />
      ) : (
        <span className="export-thumb-icon">
          <FileKindIcon kind={kind} size={28} />
        </span>
      )}
      {label ? <span className="export-thumb-label">{label}</span> : null}
    </button>
  );
}

type ExportIntent = "metadata" | "print" | "simple";

const EXPORT_QUALITY_PRESETS = [
  { value: "150", labelKey: "artwork.export.quality.basic" as const, hint: "150" },
  {
    value: "300",
    labelKey: "artwork.export.quality.good" as const,
    hint: "300 · lo habitual"
  },
  { value: "600", labelKey: "artwork.export.quality.fine" as const, hint: "600" }
] as const;

function ImageExportModal({
  inventory,
  artwork,
  onClose
}: {
  inventory: InventoryData;
  artwork: Artwork;
  onClose: () => void;
}) {
  const t = useT();
  const main = mainImageFor(artwork, inventory);
  const all = inventory.images.filter(
    (image) =>
      image.targetType === "artwork" &&
      image.targetId === artwork.id &&
      image.absolutePath &&
      isImageFile(documentDisplayName(image, image.relativePath))
  );
  const ordered = [
    ...(main && all.some((image) => image.id === main.id) ? [main] : []),
    ...all.filter((image) => image.id !== main?.id)
  ];
  const isMainImage = (image: ArtworkImage) =>
    Boolean(main && image.id === main.id);

  const artworkCmW = Number(artwork.width) || 0;
  const artworkCmH = Number(artwork.height) || 0;
  const canUseArtworkSize =
    (artwork.unit === "cm" || !artwork.unit) && artworkCmW > 0 && artworkCmH > 0;

  const [selectedId, setSelectedId] = useState(ordered[0]?.id ?? "");
  const [intent, setIntent] = useState<ExportIntent>("simple");
  const [format, setFormat] = useState<"jpg" | "png" | "pdf">("jpg");
  const [dpiPreset, setDpiPreset] = useState<"150" | "300" | "600" | "custom">(
    "300"
  );
  const [customDpi, setCustomDpi] = useState("");
  const [printW, setPrintW] = useState(
    canUseArtworkSize ? String(artworkCmW) : ""
  );
  const [printH, setPrintH] = useState(
    canUseArtworkSize ? String(artworkCmH) : ""
  );
  const [sizeValue, setSizeValue] = useState("");
  const [sizeUnit, setSizeUnit] = useState<"kb" | "mb">("mb");
  const [wantsLimit, setWantsLimit] = useState(false);
  const [probe, setProbe] = useState<{ width: number; height: number } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selected = ordered.find((image) => image.id === selectedId);
  const dpiNum =
    dpiPreset === "custom"
      ? Number(customDpi.replace(",", ".")) || 0
      : Number(dpiPreset) || 0;

  useEffect(() => {
    let cancelled = false;
    setProbe(null);
    if (!selected?.absolutePath) return;
    const probeFn = window.inventoryApi?.probeImage;
    if (typeof probeFn !== "function") return;
    void probeFn(selected.absolutePath)
      .then((info) => {
        if (!cancelled) setProbe(info);
      })
      .catch(() => {
        if (!cancelled) setProbe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.absolutePath]);

  const sourceW = probe?.width ?? 0;
  const sourceH = probe?.height ?? 0;

  const metadataPrintW =
    sourceW > 0 && dpiNum > 0 ? cmFromPixels(sourceW, dpiNum) : null;
  const metadataPrintH =
    sourceH > 0 && dpiNum > 0 ? cmFromPixels(sourceH, dpiNum) : null;

  const printWNum = parseFloat(printW.replace(",", "."));
  const printHNum = parseFloat(printH.replace(",", "."));
  const needW =
    intent === "print" && printWNum > 0 && dpiNum > 0
      ? pxFromCm(printWNum, dpiNum)
      : 0;
  const needH =
    intent === "print" && printHNum > 0 && dpiNum > 0
      ? pxFromCm(printHNum, dpiNum)
      : 0;
  // Fit inside the paper box without ever upscaling (upscales only add blur).
  const rawFit =
    sourceW > 0 && sourceH > 0 && needW > 0 && needH > 0
      ? Math.min(needW / sourceW, needH / sourceH)
      : 0;
  const printScale = rawFit > 0 ? Math.min(1, rawFit) : 0;
  const outW = printScale > 0 ? Math.round(sourceW * printScale) : 0;
  const outH = printScale > 0 ? Math.round(sourceH * printScale) : 0;
  // DPI this photo actually delivers if printed at the chosen paper size.
  const effectiveDpi =
    sourceW > 0 && sourceH > 0 && printWNum > 0 && printHNum > 0
      ? Math.min(
          sourceW / (printWNum / 2.54),
          sourceH / (printHNum / 2.54)
        )
      : 0;
  const printQuality: "ok" | "soft" | "hard" | null =
    intent === "print" && effectiveDpi > 0 && dpiNum > 0
      ? effectiveDpi >= dpiNum * 0.95
        ? "ok"
        : effectiveDpi >= 150
          ? "soft"
          : "hard"
      : null;

  const sizeNum = parseFloat(sizeValue.replace(",", "."));
  const limitActive = intent === "simple" || wantsLimit;
  // Decimal KB/MB so "500 KB" means ≤ 500,000 bytes (strict, Finder-style).
  const targetKB =
    limitActive && Number.isFinite(sizeNum) && sizeNum > 0
      ? sizeUnit === "mb"
        ? sizeNum * 1000
        : sizeNum
      : undefined;

  function clearFeedback() {
    setError("");
    setDone(null);
  }

  function validate(): string | null {
    if (!selected?.absolutePath) return t("artwork.export.error.pickPhoto");
    if (intent === "metadata" || intent === "print") {
      if (!(dpiNum >= 36 && dpiNum <= 2400)) {
        return t("artwork.export.error.quality");
      }
    }
    if (intent === "print") {
      if (!(printWNum > 0) || !(printHNum > 0)) {
        return t("artwork.export.error.paperCm");
      }
    }
    return null;
  }

  async function run() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    if (!selected?.absolutePath) return;
    setBusy(true);
    setError("");
    setDone(null);
    try {
      const exportFn = window.inventoryApi?.exportImage;
      if (typeof exportFn !== "function") {
        throw new Error(
          t("app.restart.images")
        );
      }
      const dpiMode =
        intent === "metadata" ? "metadata" : intent === "print" ? "print" : "none";
      const res = await exportFn({
        sourcePath: selected.absolutePath,
        format,
        targetKB,
        dpiMode,
        dpi: intent === "simple" ? undefined : dpiNum,
        printWidthCm: intent === "print" ? printWNum : undefined,
        printHeightCm: intent === "print" ? printHNum : undefined,
        suggestedName: artwork.title || artwork.id
      });
      if (res) {
        const parts = [
          formatBytes(res.bytes),
          res.width && res.height ? `${res.width}×${res.height} px` : null,
          res.dpi ? t("artwork.export.doneQuality", { dpi: res.dpi }) : null
        ].filter(Boolean);
        setDone(t("artwork.export.done", { details: parts.join(" · ") }));
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("artwork.export.error.save")
      );
    } finally {
      setBusy(false);
    }
  }

  const canSave = ordered.length > 0 && !busy && validate() === null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal export-image-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>{t("artwork.export.title")}</h3>
            <p className="muted small-note export-modal-lead">
              {t("artwork.export.subLead")}
            </p>
          </div>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body export-modal-body">
          {ordered.length === 0 ? (
            <p className="muted">{t("artwork.export.noPhotos")}</p>
          ) : (
            <>
              <div className="export-step">
                <p className="export-step-title">{t("artwork.export.step1")}</p>
                <p className="muted small-note">{t("artwork.export.step1Hint")}</p>
                <div className="export-thumb-grid">
                  {ordered.map((image) => (
                    <ExportThumb
                      key={image.id}
                      image={image}
                      active={image.id === selectedId}
                      label={
                        isMainImage(image)
                          ? t("artwork.export.thumb.main")
                          : t("artwork.export.thumb.doc")
                      }
                      onClick={() => {
                        setSelectedId(image.id);
                        clearFeedback();
                      }}
                    />
                  ))}
                </div>
                {probe && (
                  <p className="muted small-note">
                    {t("artwork.export.sourcePixels", {
                      width: sourceW,
                      height: sourceH
                    })}
                  </p>
                )}
              </div>

              <div className="export-step">
                <p className="export-step-title">{t("artwork.export.step2")}</p>
                <div className="export-intent-list">
                  <button
                    type="button"
                    className={`export-intent${intent === "simple" ? " active" : ""}`}
                    onClick={() => {
                      setIntent("simple");
                      clearFeedback();
                    }}
                  >
                    <strong>{t("artwork.export.intent.web")}</strong>
                    <span>{t("artwork.export.intent.webHint")}</span>
                  </button>
                  <button
                    type="button"
                    className={`export-intent${intent === "metadata" ? " active" : ""}`}
                    onClick={() => {
                      setIntent("metadata");
                      setWantsLimit(false);
                      clearFeedback();
                    }}
                  >
                    <strong>{t("artwork.export.intent.dpi")}</strong>
                    <span>{t("artwork.export.intent.dpiHint")}</span>
                  </button>
                  <button
                    type="button"
                    className={`export-intent${intent === "print" ? " active" : ""}`}
                    onClick={() => {
                      setIntent("print");
                      setWantsLimit(false);
                      clearFeedback();
                    }}
                  >
                    <strong>{t("artwork.export.intent.print")}</strong>
                    <span>{t("artwork.export.intent.printHint")}</span>
                  </button>
                </div>
              </div>

              {(intent === "print" || intent === "metadata") && (
                <div className="export-step">
                  <p className="export-step-title">{t("artwork.export.stepDpi")}</p>
                  <p className="muted small-note">{t("artwork.export.dpiHint")}</p>
                  <div className="export-quality-row">
                    {EXPORT_QUALITY_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className={`export-quality${
                          dpiPreset === preset.value ? " active" : ""
                        }`}
                        onClick={() => {
                          setDpiPreset(preset.value);
                          clearFeedback();
                        }}
                      >
                        <strong>{preset.value}</strong>
                        <span>{t(preset.labelKey)}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`export-quality${
                        dpiPreset === "custom" ? " active" : ""
                      }`}
                      onClick={() => {
                        setDpiPreset("custom");
                        clearFeedback();
                      }}
                    >
                      <strong>{t("artwork.export.quality.other")}</strong>
                      <span>{t("artwork.export.quality.otherHint")}</span>
                    </button>
                  </div>
                  {dpiPreset === "custom" && (
                    <label className="field export-custom-dpi">
                      {t("artwork.export.customDpiLabel")}
                      <input
                        inputMode="numeric"
                        placeholder={t("artwork.export.customDpiPlaceholder")}
                        value={customDpi}
                        autoFocus
                        onChange={(event) => {
                          setCustomDpi(event.target.value.replace(/[^0-9.,]/g, ""));
                          clearFeedback();
                        }}
                      />
                    </label>
                  )}
                </div>
              )}

              {intent === "print" && (
                <div className="export-step">
                  <p className="export-step-title">{t("artwork.export.stepPaper")}</p>
                  <div className="export-size-row">
                    <label className="field">
                      {t("artwork.field.width")}
                      <input
                        inputMode="decimal"
                        placeholder="21"
                        value={printW}
                        onChange={(event) => {
                          setPrintW(event.target.value.replace(/[^0-9.,]/g, ""));
                          clearFeedback();
                        }}
                      />
                    </label>
                    <span className="export-size-x" aria-hidden>
                      ×
                    </span>
                    <label className="field">
                      {t("artwork.field.height")}
                      <input
                        inputMode="decimal"
                        placeholder="29,7"
                        value={printH}
                        onChange={(event) => {
                          setPrintH(event.target.value.replace(/[^0-9.,]/g, ""));
                          clearFeedback();
                        }}
                      />
                    </label>
                    <span className="export-size-unit">cm</span>
                  </div>
                  <div className="choice-row">
                    {(
                      [
                        ["A4", "21", "29.7"],
                        ["A3", "29.7", "42"],
                        ["30×40", "30", "40"],
                        ["20×20", "20", "20"]
                      ] as const
                    ).map(([label, w, h]) => (
                      <button
                        key={label}
                        type="button"
                        className="choice-chip"
                        onClick={() => {
                          setPrintW(w);
                          setPrintH(h);
                          clearFeedback();
                        }}
                      >
                        {label}
                      </button>
                    ))}
                    {canUseArtworkSize && (
                      <button
                        type="button"
                        className="choice-chip"
                        onClick={() => {
                          setPrintW(String(artworkCmW));
                          setPrintH(String(artworkCmH));
                          clearFeedback();
                        }}
                      >
                        {t("artwork.export.artworkMeasure")}
                      </button>
                    )}
                  </div>
                  {outW > 0 && outH > 0 && printQuality && (
                    <div
                      className={`export-summary${
                        printQuality === "ok" ? "" : " warn"
                      }`}
                    >
                      {printQuality === "hard" ? (
                        <p>
                          {t("artwork.export.warnLowDpi", {
                            size: `${formatCm(printWNum)}×${formatCm(printHNum)}`,
                            asked: dpiNum,
                            effective: Math.round(effectiveDpi),
                            pixels: `${sourceW}×${sourceH}`
                          })}
                        </p>
                      ) : printQuality === "soft" ? (
                        <p>
                          {t("artwork.export.warnSoftDpi", {
                            size: `${formatCm(printWNum)}×${formatCm(printHNum)}`,
                            asked: dpiNum,
                            effective: Math.round(effectiveDpi),
                            pixels: `${sourceW}×${sourceH}`
                          })}
                        </p>
                      ) : (
                        <p>
                          {t("artwork.export.okPrint", {
                            size: `${formatCm(printWNum)}×${formatCm(printHNum)}`,
                            dpi: dpiNum
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {intent === "metadata" &&
                metadataPrintW != null &&
                metadataPrintH != null && (
                  <div className="export-summary">
                    <p>
                      {t("artwork.export.metadataMax", {
                        dpi: dpiNum,
                        size: `${formatCm(metadataPrintW)}×${formatCm(metadataPrintH)}`
                      })}
                    </p>
                    <p className="muted">{t("artwork.export.metadataNote")}</p>
                  </div>
                )}

              <div className="export-step export-file-box">
                <p className="export-step-title">
                  {t("artwork.export.stepFile", {
                    n: intent === "print" ? 5 : intent === "metadata" ? 4 : 3
                  })}
                </p>
                <label className="field">
                  {t("artwork.export.fileType")}
                  <select
                    value={format}
                    onChange={(event) =>
                      setFormat(event.target.value as "jpg" | "png" | "pdf")
                    }
                  >
                    <option value="jpg">{t("artwork.export.format.jpg")}</option>
                    <option value="png">{t("artwork.export.format.png")}</option>
                    <option value="pdf">{t("artwork.export.format.pdf")}</option>
                  </select>
                </label>

                {intent !== "simple" && (
                  <label className="export-limit-toggle">
                    <input
                      type="checkbox"
                      checked={wantsLimit}
                      onChange={(event) => {
                        setWantsLimit(event.target.checked);
                        clearFeedback();
                      }}
                    />
                    {t("artwork.export.limitToggle")}
                  </label>
                )}

                {limitActive && (
                  <>
                    <label className="field">
                      {t("artwork.export.maxSize")}
                      <div className="export-max-size">
                        <input
                          inputMode="decimal"
                          placeholder={t("artwork.export.sizePlaceholder", {
                            n: intent === "simple" ? 5 : 8
                          })}
                          value={sizeValue}
                          onChange={(event) => {
                            setSizeValue(
                              event.target.value.replace(/[^0-9.,]/g, "")
                            );
                            clearFeedback();
                          }}
                        />
                        <select
                          value={sizeUnit}
                          onChange={(event) =>
                            setSizeUnit(event.target.value as "kb" | "mb")
                          }
                        >
                          <option value="mb">MB</option>
                          <option value="kb">KB</option>
                        </select>
                      </div>
                    </label>
                    <p
                      className={
                        targetKB && intent === "print"
                          ? "export-limit-warning"
                          : "muted small-note"
                      }
                    >
                      {targetKB
                        ? t("artwork.export.compressWarning")
                        : t("artwork.export.noSizeLimit")}
                    </p>
                  </>
                )}
              </div>

              <div className="export-summary soft">
                <p>
                  <strong>{t("artwork.export.summary")}</strong>{" "}
                  {intent === "print"
                    ? printWNum > 0 && printHNum > 0 && dpiNum > 0
                      ? `${formatCm(printWNum)}×${formatCm(printHNum)} cm · ${dpiNum} DPI · ${format.toUpperCase()}`
                      : t("artwork.export.missingSizeDpi")
                    : intent === "metadata"
                      ? dpiNum > 0
                        ? `${t("artwork.export.samePhoto")} · ${dpiNum} DPI · ${format.toUpperCase()}`
                        : t("artwork.export.missingDpi")
                      : `${t("artwork.export.samePhoto")} · ${format.toUpperCase()}`}
                  {targetKB
                    ? ` · ${t("artwork.export.maxAbbrev")} ${
                        sizeUnit === "mb" ? `${sizeNum} MB` : `${sizeNum} KB`
                      }`
                    : ""}
                </p>
              </div>
            </>
          )}

          {error && <div className="error-banner">{error}</div>}
          {done && <div className="success-banner">{done}</div>}
        </div>
        <div className="modal-actions">
          <button disabled={!canSave} onClick={() => void run()}>
            {busy ? t("common.saving") : t("artwork.export.saveCopy")}
          </button>
          <button className="ghost" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultBulkFolderName(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `fotos-${y}-${m}-${day}`;
}

function BulkImageExportModal({
  inventory,
  onClose
}: {
  inventory: InventoryData;
  onClose: () => void;
}) {
  const t = useT();
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [intent, setIntent] = useState<"simple" | "metadata">("simple");
  const [format, setFormat] = useState<"jpg" | "png" | "pdf">("jpg");
  const [dpiPreset, setDpiPreset] = useState<"150" | "300" | "600" | "custom">(
    "300"
  );
  const [customDpi, setCustomDpi] = useState("");
  const [sizeValue, setSizeValue] = useState("500");
  const [sizeUnit, setSizeUnit] = useState<"kb" | "mb">("kb");
  const [wantsLimit, setWantsLimit] = useState(false);
  const [destination, setDestination] = useState<"generated" | "chooseFolder">(
    "generated"
  );
  const [newFolderName, setNewFolderName] = useState(defaultBulkFolderName);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const picked = pickedIds
    .map((id) => inventory.artworks.find((artwork) => artwork.id === id))
    .filter((artwork): artwork is Artwork => Boolean(artwork));
  const withMain = picked.filter((a) => mainImageFor(a, inventory)?.absolutePath);
  const withoutMain = picked.length - withMain.length;

  const dpiNum =
    dpiPreset === "custom"
      ? Number(customDpi.replace(",", ".")) || 0
      : Number(dpiPreset) || 0;

  const sizeNum = parseFloat(sizeValue.replace(",", "."));
  const limitActive = intent === "simple" || wantsLimit;
  const targetKB =
    limitActive && Number.isFinite(sizeNum) && sizeNum > 0
      ? sizeUnit === "mb"
        ? sizeNum * 1000
        : sizeNum
      : undefined;

  function clearFeedback() {
    setError("");
    setDone(null);
    setProgress("");
  }

  function validate(): string | null {
    if (pickedIds.length === 0) return t("artwork.exportBulk.error.pickWorks");
    if (withMain.length === 0) return t("artwork.exportBulk.error.noPhotos");
    if (intent === "metadata") {
      if (!(dpiNum >= 36 && dpiNum <= 2400)) {
        return t("artwork.export.error.quality");
      }
    }
    if (destination === "chooseFolder" && !newFolderName.trim()) {
      return t("artwork.exportBulk.error.folderName");
    }
    return null;
  }

  async function run() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    setDone(null);
    setProgress(t("artwork.exportBulk.progress", { n: withMain.length }));
    try {
      const exportFn = window.inventoryApi?.exportImagesBulk;
      if (typeof exportFn !== "function") {
        throw new Error(t("app.restart.images"));
      }
      const items = withMain.map((artwork) => {
        const image = mainImageFor(artwork, inventory)!;
        return {
          sourcePath: image.absolutePath!,
          suggestedName: artwork.title || artwork.id,
          artworkId: artwork.id
        };
      });

      const res = await exportFn({
        items,
        format,
        targetKB,
        dpiMode: intent === "metadata" ? "metadata" : "none",
        dpi: intent === "simple" ? undefined : dpiNum,
        destination,
        newFolderName:
          destination === "chooseFolder" ? newFolderName.trim() : undefined
      });
      if (!res) {
        setProgress("");
        return;
      }
      const parts = [
        t("artwork.exportBulk.doneSaved", { n: res.saved.length }),
        res.skipped.length > 0
          ? t("artwork.exportBulk.doneSkipped", { n: res.skipped.length })
          : null,
        res.failed.length > 0
          ? t("artwork.exportBulk.doneFailed", { n: res.failed.length })
          : null
      ].filter(Boolean);
      if (res.failed.length > 0) {
        setError(
          res.failed
            .slice(0, 3)
            .map((item) => `${item.suggestedName}: ${item.error}`)
            .join(" · ")
        );
      }
      setDone(parts.join(" · "));
      setProgress("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("artwork.export.error.save")
      );
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  const canSave = !busy && validate() === null;

  return (
    <>
      {picking ? (
        <ArtworkPickerModal
          inventory={inventory}
          initialIds={pickedIds}
          title={t("artwork.exportBulk.pickTitle")}
          notice={t("artwork.exportBulk.pickNotice")}
          onConfirm={(ids) => {
            setPickedIds(ids);
            setPicking(false);
            clearFeedback();
          }}
          onClose={() => setPicking(false)}
        />
      ) : (
        <div className="modal-backdrop" onClick={onClose}>
          <div
            className="modal export-image-modal bulk-export-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h3>{t("artwork.exportBulk.title")}</h3>
                <p className="muted small-note export-modal-lead">
                  {t("artwork.exportBulk.lead")}
                </p>
              </div>
              <button
                type="button"
                className="icon-button ghost"
                onClick={onClose}
              >
                ✕
              </button>
            </div>
            <div className="modal-body export-modal-body">
              <div className="export-step">
                <p className="export-step-title">
                  {t("artwork.exportBulk.stepWorks")}
                </p>
                <div className="bulk-export-works">
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => setPicking(true)}
                  >
                    {pickedIds.length === 0
                      ? t("artwork.exportBulk.chooseWorks")
                      : t("artwork.exportBulk.changeWorks", {
                          n: pickedIds.length
                        })}
                  </button>
                  {pickedIds.length > 0 ? (
                    <p className="muted small-note">
                      {t("artwork.exportBulk.worksReady", {
                        ready: withMain.length,
                        total: pickedIds.length
                      })}
                      {withoutMain > 0
                        ? ` · ${t("artwork.exportBulk.worksNoPhoto", {
                            n: withoutMain
                          })}`
                        : ""}
                    </p>
                  ) : (
                    <p className="muted small-note">
                      {t("artwork.exportBulk.worksHint")}
                    </p>
                  )}
                </div>
              </div>

              <div className="export-step">
                <p className="export-step-title">{t("artwork.export.step2")}</p>
                <div className="export-intent-list">
                  <button
                    type="button"
                    className={`export-intent${intent === "simple" ? " active" : ""}`}
                    onClick={() => {
                      setIntent("simple");
                      clearFeedback();
                    }}
                  >
                    <strong>{t("artwork.export.intent.web")}</strong>
                    <span>{t("artwork.export.intent.webHint")}</span>
                  </button>
                  <button
                    type="button"
                    className={`export-intent${
                      intent === "metadata" ? " active" : ""
                    }`}
                    onClick={() => {
                      setIntent("metadata");
                      setWantsLimit(false);
                      clearFeedback();
                    }}
                  >
                    <strong>{t("artwork.export.intent.dpi")}</strong>
                    <span>{t("artwork.export.intent.dpiHint")}</span>
                  </button>
                </div>
                <p className="export-bulk-print-note">
                  {t("artwork.exportBulk.printIndividually")}
                </p>
              </div>

              {intent === "metadata" ? (
                <div className="export-step">
                  <p className="export-step-title">{t("artwork.export.stepDpi")}</p>
                  <div className="export-quality-row">
                    {EXPORT_QUALITY_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className={`export-quality${
                          dpiPreset === preset.value ? " active" : ""
                        }`}
                        onClick={() => {
                          setDpiPreset(preset.value);
                          clearFeedback();
                        }}
                      >
                        <strong>{t(preset.labelKey)}</strong>
                        <span>{preset.hint}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`export-quality${
                        dpiPreset === "custom" ? " active" : ""
                      }`}
                      onClick={() => {
                        setDpiPreset("custom");
                        clearFeedback();
                      }}
                    >
                      <strong>{t("artwork.export.quality.other")}</strong>
                      <span>{t("artwork.export.quality.otherHint")}</span>
                    </button>
                  </div>
                  {dpiPreset === "custom" ? (
                    <label className="field">
                      {t("artwork.export.customDpiLabel")}
                      <input
                        inputMode="numeric"
                        placeholder={t("artwork.export.customDpiPlaceholder")}
                        value={customDpi}
                        onChange={(event) => {
                          setCustomDpi(
                            event.target.value.replace(/[^0-9]/g, "")
                          );
                          clearFeedback();
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              <div className="export-step export-file-box">
                <p className="export-step-title">
                  {t("artwork.export.stepFile", {
                    n: intent === "metadata" ? 3 : 2
                  })}
                </p>
                <label className="field">
                  {t("artwork.export.fileType")}
                  <select
                    value={format}
                    onChange={(event) => {
                      setFormat(event.target.value as "jpg" | "png" | "pdf");
                      clearFeedback();
                    }}
                  >
                    <option value="jpg">{t("artwork.export.format.jpg")}</option>
                    <option value="png">{t("artwork.export.format.png")}</option>
                    <option value="pdf">{t("artwork.export.format.pdf")}</option>
                  </select>
                </label>

                {intent !== "simple" && (
                  <label className="export-limit-toggle">
                    <input
                      type="checkbox"
                      checked={wantsLimit}
                      onChange={(event) => {
                        setWantsLimit(event.target.checked);
                        clearFeedback();
                      }}
                    />
                    {t("artwork.export.limitToggle")}
                  </label>
                )}

                {limitActive && (
                  <>
                    <label className="field">
                      {t("artwork.export.maxSize")}
                      <div className="export-max-size">
                        <input
                          inputMode="decimal"
                          placeholder={t("artwork.export.sizePlaceholder", {
                            n: intent === "simple" ? 500 : 8
                          })}
                          value={sizeValue}
                          onChange={(event) => {
                            setSizeValue(
                              event.target.value.replace(/[^0-9.,]/g, "")
                            );
                            clearFeedback();
                          }}
                        />
                        <select
                          value={sizeUnit}
                          onChange={(event) =>
                            setSizeUnit(event.target.value as "kb" | "mb")
                          }
                        >
                          <option value="mb">MB</option>
                          <option value="kb">KB</option>
                        </select>
                      </div>
                    </label>
                    <p className="muted small-note">
                      {targetKB
                        ? t("artwork.export.compressWarning")
                        : t("artwork.export.noSizeLimit")}
                    </p>
                  </>
                )}
              </div>

              <div className="export-step">
                <p className="export-step-title">
                  {t("artwork.exportBulk.stepDest")}
                </p>
                <div className="bulk-export-dest">
                  <button
                    type="button"
                    className={`bulk-dest-option${
                      destination === "generated" ? " active" : ""
                    }`}
                    onClick={() => {
                      setDestination("generated");
                      clearFeedback();
                    }}
                  >
                    <strong>{t("artwork.exportBulk.dest.generated")}</strong>
                    <span>{t("artwork.exportBulk.dest.generatedHint")}</span>
                  </button>
                  <button
                    type="button"
                    className={`bulk-dest-option${
                      destination === "chooseFolder" ? " active" : ""
                    }`}
                    onClick={() => {
                      setDestination("chooseFolder");
                      clearFeedback();
                    }}
                  >
                    <strong>{t("artwork.exportBulk.dest.choose")}</strong>
                    <span>{t("artwork.exportBulk.dest.chooseHint")}</span>
                  </button>
                </div>
                {destination === "chooseFolder" ? (
                  <label className="field">
                    {t("artwork.exportBulk.folderName")}
                    <input
                      value={newFolderName}
                      placeholder={defaultBulkFolderName()}
                      onChange={(event) => {
                        setNewFolderName(event.target.value);
                        clearFeedback();
                      }}
                    />
                  </label>
                ) : null}
              </div>

              <div className="export-summary soft">
                <p>
                  <strong>{t("artwork.export.summary")}</strong>{" "}
                  {t("artwork.exportBulk.summary", {
                    n: withMain.length,
                    format: format.toUpperCase()
                  })}
                  {targetKB
                    ? ` · ${t("artwork.export.maxAbbrev")} ${
                        sizeUnit === "mb" ? `${sizeNum} MB` : `${sizeNum} KB`
                      }`
                    : ""}
                  {intent !== "simple" && dpiNum > 0 ? ` · ${dpiNum} DPI` : ""}
                </p>
              </div>

              {progress && <p className="muted small-note">{progress}</p>}
              {error && <div className="error-banner">{error}</div>}
              {done && <div className="success-banner">{done}</div>}
            </div>
            <div className="modal-actions">
              <button disabled={!canSave} onClick={() => void run()}>
                {busy
                  ? t("common.saving")
                  : t("artwork.exportBulk.save", { n: withMain.length })}
              </button>
              <button className="ghost" onClick={onClose}>
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ArtworkDetail({
  artwork,
  inventory,
  setInventory,
  onEdit,
  onBack,
  onDeleted,
  onOpenExhibition,
  onToast,
  onError
}: {
  artwork: Artwork;
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onEdit: () => void;
  onBack: () => void;
  onDeleted: (data: InventoryData) => void;
  onOpenExhibition: (exhibitionId: string) => void;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { lang, t } = useLanguage();
  const [tab, setTab] = useState<DetailTab>("info");
  const [openMovement, setOpenMovement] = useState<Movement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [certBusy, setCertBusy] = useState(false);
  const [certLangOpen, setCertLangOpen] = useState(false);
  const [certLang, setCertLang] = useState<"es" | "en" | "de">("es");
  const [certCopyId, setCertCopyId] = useState<string>("");
  const [imageEditorSrc, setImageEditorSrc] = useState<string | null>(null);
  const [imageEditorMode, setImageEditorMode] = useState<"upload" | "retouch">(
    "upload"
  );
  const [imageBusy, setImageBusy] = useState(false);
  const imageDrop = useFileDragOver(!imageBusy);
  const image = mainImageFor(artwork, inventory);
  const imageUrl = useImageDataUrl(image?.absolutePath);
  const editions = inventory.editions.filter((item) => item.artworkId === artwork.id);
  const movements = sortMovementsDesc(
    inventory.movements.filter((item) => item.artworkId === artwork.id)
  );

  async function addImage() {
    try {
      const picked = await window.inventoryApi.pickImagePath();
      if (!picked) return;
      setImageEditorMode("upload");
      setImageEditorSrc(picked.dataUrl);
    } catch {
      /* ignore */
    }
  }

  async function acceptDroppedMainImage(file: File) {
    if (imageBusy || !isDropImageFile(file)) {
      onError(t("artwork.error.dropImageOnly"));
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageEditorMode("upload");
      setImageEditorSrc(dataUrl);
    } catch (error) {
      onError(
        error instanceof Error ? error.message : t("artwork.error.addPhoto")
      );
    }
  }

  async function retouchCurrentImage() {
    if (!image?.absolutePath) return;
    setImageBusy(true);
    try {
      // Retouch from the current primary image; original stays in extras.
      const dataUrl = await window.inventoryApi.imageToDataUrl(image.absolutePath);
      if (dataUrl) {
        setImageEditorMode("retouch");
        setImageEditorSrc(dataUrl);
      }
    } catch (error) {
      onError(
        error instanceof Error ? error.message : t("artwork.error.addPhoto")
      );
    } finally {
      setImageBusy(false);
    }
  }

  async function saveEditedImage(result: ImageEditSaveResult) {
    setImageBusy(true);
    try {
      const imported = await importEditedArtworkImage(
        result.editedDataUrl,
        artwork.id,
        {
          originalDataUrl: result.originalDataUrl,
          keepOriginalAsExtra: result.keepOriginalAsExtra
        }
      );
      if (imported?.inventory) setInventory(imported.inventory);
      setImageEditorSrc(null);
      onToast(t("artwork.photo.retouchSaved"));
    } finally {
      setImageBusy(false);
    }
  }

  async function remove() {
    const data = await window.inventoryApi.deleteArtwork(artwork.id);
    onDeleted(data);
  }

  async function generateCertificate() {
    const isMultiple = artwork.editionMode === "multiple";
    const saleEditions = editions.filter((e) => e.kind !== "personal");
    const personalEditions = editions.filter((e) => e.kind === "personal");
    const saleTotal =
      saleEditions.length > 0
        ? saleEditions.length
        : Math.max(1, Number(artwork.editionSaleCopies || 0));
    if (isMultiple && editions.length > 1 && !certCopyId && editions.length > 0) {
      onError(t("cert.error.needCopy"));
      return;
    }
    setCertBusy(true);
    try {
      let artistName = "";
      try {
        artistName = localStorage.getItem("solicitud-artist-name") || "";
      } catch {
        /* ignore */
      }
      const selectedEdition = editions.find((e) => e.id === certCopyId);
      const isArtistProof = selectedEdition?.kind === "personal";
      // Sale copies: number within the for-sale edition only (ignore P/A).
      // Artist proofs: keep their own P/A label — never "11 of 12".
      let editionCount = saleTotal;
      let copyNumber: number | undefined;
      let copyLabel: string | undefined;
      let editionOverride: string | undefined;
      if (isMultiple) {
        if (isArtistProof && selectedEdition) {
          const paIndex =
            personalEditions.findIndex((e) => e.id === certCopyId) + 1;
          const paTotal = Math.max(1, personalEditions.length);
          editionOverride =
            selectedEdition.label?.trim() ||
            `P/A ${Math.max(1, paIndex)}`;
          // Still pass mode/count for context, but HTML will use editionOverride.
          editionCount = paTotal;
          copyNumber = Math.max(1, paIndex);
          copyLabel = undefined;
        } else {
          const saleIndex = selectedEdition
            ? saleEditions.findIndex((e) => e.id === certCopyId) + 1
            : Number(certCopyId) || 1;
          editionCount = saleTotal;
          copyNumber = Math.max(1, saleIndex || 1);
          // Don't also append "(9/10)" — that duplicates "Number 9 of 10".
          copyLabel = undefined;
        }
      }
      let imageDataUrl: string | undefined;
      if (image?.absolutePath) {
        try {
          const dataUrl = await window.inventoryApi.imageToDataUrl(
            image.absolutePath
          );
          if (dataUrl) imageDataUrl = dataUrl;
        } catch {
          /* certificate still works without the photo */
        }
      }
      const path = await requireApi("generateCertificateOfAuthenticity", t)({
        title: artwork.title,
        year: String(artwork.yearMade ?? "").trim() || undefined,
        medium: artTypeLabel(inventory, artwork.type, certLang) || undefined,
        size:
          artwork.type === "ipad_drawing"
            ? undefined
            : formatSize(artwork) || undefined,
        series: isNoSeries(artwork.series)
          ? undefined
          : artwork.series?.trim() || undefined,
        edition: editionOverride,
        editionMode: isMultiple ? "multiple" : "unique",
        editionCount: isMultiple ? editionCount : undefined,
        copyNumber: isMultiple && !editionOverride ? copyNumber : undefined,
        copyLabel,
        artistName: artistName || undefined,
        language: certLang,
        imageDataUrl
      });
      setCertLangOpen(false);
      if (path) onToast(t("cert.toast.done"));
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : t("cert.error.failed")
      );
    } finally {
      setCertBusy(false);
    }
  }

  function openCertificateModal() {
    setCertLang("es");
    setCertCopyId(editions[0]?.id ?? (editions.length ? "" : "1"));
    setCertLangOpen(true);
  }

  function copiedToast() {
    onToast(t("common.copied"));
  }

  const dimensionsText = (() => {
    const parts = [artwork.height, artwork.width, artwork.depth].filter(Boolean);
    if (parts.length === 0) return "";
    const unit = String(artwork.unit || "").trim();
    return unit ? `${parts.join(" x ")} ${unit}` : parts.join(" x ");
  })();
  const seriesText = seriesLabel(artwork.series, t);
  const typeText = labelFor(inventory, "artworkType", artwork.type, lang);
  const statusText = labelFor(inventory, "status", artwork.status, lang);
  const galleryText =
    artwork.galleryName || contactName(inventory, artwork.galleryContactId);
  const soldText = [
    artwork.soldPrice,
    artwork.soldToName,
    artwork.soldDate
  ]
    .filter(Boolean)
    .join(" · ");
  const editionText =
    artwork.editionMode === "multiple"
      ? t("artwork.detail.edition.multiple", { count: editions.length })
      : t("artwork.detail.edition.unique");

  return (
    <section className="detail-layout">
      <div
        className={`detail-image-panel${imageDrop.over ? " is-file-drag" : ""}`}
        {...imageDrop.handlers}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          imageDrop.reset();
          const file = filesFromDropEvent(event).find(isDropImageFile);
          if (file) void acceptDroppedMainImage(file);
          else if (filesFromDropEvent(event).length > 0) {
            onError(t("artwork.error.dropImageOnly"));
          }
        }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={artwork.title} />
        ) : image?.absolutePath ? (
          <div className="detail-file-fallback">
            <FileKindIcon kind={fileKindFromName(image.absolutePath)} size={48} />
            <span>{documentDisplayName(image, t("common.documentOne"))}</span>
          </div>
        ) : (
          <div>{t("common.noPhoto")}</div>
        )}
        <div className="image-panel-actions image-panel-actions-stack">
          <button
            type="button"
            className="photo-action photo-action-change"
            onClick={() => void addImage()}
            disabled={imageBusy}
          >
            {imageUrl ? t("artwork.photo.change") : t("artwork.photo.add")}
          </button>
          {imageUrl ? (
            <button
              type="button"
              className="photo-action photo-action-retouch"
              onClick={() => void retouchCurrentImage()}
              disabled={imageBusy}
            >
              {t("artwork.photo.retouch")}
            </button>
          ) : null}
          <button
            type="button"
            className="photo-action photo-action-export"
            onClick={() => setExporting(true)}
            disabled={!imageUrl}
          >
            {t("artwork.detail.saveImage")}
          </button>
        </div>
        <p className="muted small-note artwork-photo-hint detail-photo-drop-hint">
          {t("artwork.photo.hint.drop")}
        </p>
      </div>
      {imageEditorSrc ? (
        <Suspense fallback={null}>
          <ImageEditModal
            sourceDataUrl={imageEditorSrc}
            mode={imageEditorMode}
            onCancel={() => setImageEditorSrc(null)}
            onSave={saveEditedImage}
          />
        </Suspense>
      ) : null}
      {certLangOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => !certBusy && setCertLangOpen(false)}
        >
          <div
            className="modal confirm-modal cert-lang-modal"
            role="dialog"
            aria-labelledby="cert-lang-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="cert-lang-title">{t("cert.modal.title")}</h3>
            <p className="muted">{t("cert.modal.langHint")}</p>
            <div
              className="cert-lang-choices"
              role="radiogroup"
              aria-label={t("cert.modal.language")}
            >
              {(
                [
                  ["es", t("cert.modal.spanish")],
                  ["en", t("cert.modal.english")],
                  ["de", t("cert.modal.german")]
                ] as const
              ).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  className={`cert-lang-choice${
                    certLang === code ? " selected" : ""
                  }`}
                  disabled={certBusy}
                  aria-pressed={certLang === code}
                  onClick={() => setCertLang(code)}
                >
                  <strong>{label}</strong>
                  <span className="muted">{code.toUpperCase()}</span>
                </button>
              ))}
            </div>
            {artwork.editionMode === "multiple" &&
            (editions.length > 1 ||
              Number(artwork.editionPersonalCopies || 0) +
                Number(artwork.editionSaleCopies || 0) >
                1) ? (
              <label className="field cert-copy-field">
                {t("cert.modal.whichCopy")}
                {editions.length > 0 ? (
                  <select
                    value={certCopyId}
                    disabled={certBusy}
                    onChange={(event) => setCertCopyId(event.target.value)}
                  >
                    {editions.map((edition, index) => (
                      <option key={edition.id} value={edition.id}>
                        {edition.label || `${index + 1}/${editions.length}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={certCopyId}
                    disabled={certBusy}
                    onChange={(event) => setCertCopyId(event.target.value)}
                  >
                    {Array.from(
                      {
                        length: Math.max(
                          1,
                          Number(artwork.editionPersonalCopies || 0) +
                            Number(artwork.editionSaleCopies || 0)
                        )
                      },
                      (_, index) => (
                        <option key={index + 1} value={String(index + 1)}>
                          {index + 1} /{" "}
                          {Number(artwork.editionPersonalCopies || 0) +
                            Number(artwork.editionSaleCopies || 0)}
                        </option>
                      )
                    )}
                  </select>
                )}
              </label>
            ) : null}
            <div className="cert-lang-actions">
              <button
                type="button"
                className="ghost"
                disabled={certBusy}
                onClick={() => setCertLangOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={certBusy}
                onClick={() => void generateCertificate()}
              >
                {certBusy
                  ? t("cert.modal.generating")
                  : t("cert.modal.generatePdf")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="detail-panel">
        <div className="detail-header">
          <div>
            <p className="eyebrow">
              <CopyableValue
                value={artwork.id}
                className="copyable-inline"
                onCopied={copiedToast}
              />
            </p>
            <h2>
              <CopyableValue
                value={artwork.title}
                className="copyable-title"
                onCopied={copiedToast}
              />
            </h2>
          </div>
          <div className="form-head-actions">
            <button
              type="button"
              className="ghost"
              disabled={certBusy}
              onClick={openCertificateModal}
            >
              {certBusy ? t("artwork.detail.certBusy") : t("artwork.detail.cert")}
            </button>
            <button onClick={onEdit}>{t("common.edit")}</button>
            <button className="ghost" onClick={onBack}>
              {t("common.back")}
            </button>
          </div>
        </div>

        <div className="subtabs">
          <SubTab active={tab === "info"} onClick={() => setTab("info")}>
            {t("artwork.detail.tab.info")}
          </SubTab>
          <SubTab
            active={tab === "movimientos"}
            onClick={() => setTab("movimientos")}
          >
            {t("artwork.detail.tab.movements", { count: movements.length })}
          </SubTab>
          <SubTab active={tab === "precio"} onClick={() => setTab("precio")}>
            {t("artwork.detail.tab.price")}
          </SubTab>
        </div>

        {tab === "precio" && (
          <PriceHistoryTab
            artwork={artwork}
            inventory={inventory}
            onOpenExhibition={onOpenExhibition}
          />
        )}

        {tab === "info" && (
          <>
            <p className="muted small-note detail-copy-hint">
              {t("artwork.detail.copyHint")}
            </p>
            <dl className="metadata">
              <dt>{t("artwork.detail.meta.series")}</dt>
              <dd>
                <CopyableValue value={seriesText} onCopied={copiedToast} />
              </dd>
              <dt>{t("artwork.detail.meta.type")}</dt>
              <dd>
                <CopyableValue value={typeText} onCopied={copiedToast} />
              </dd>
              <dt>{t("artwork.detail.meta.year")}</dt>
              <dd>
                <CopyableValue
                  value={artwork.yearMade || ""}
                  onCopied={copiedToast}
                >
                  {artwork.yearMade || "-"}
                </CopyableValue>
              </dd>
              <dt>{t("artwork.detail.meta.dimensions")}</dt>
              <dd>
                <CopyableValue
                  value={dimensionsText}
                  onCopied={copiedToast}
                >
                  {dimensionsText || "-"}
                </CopyableValue>
              </dd>
              <dt>{t("artwork.detail.meta.status")}</dt>
              <dd className="metadata-status-dd">
                <CopyableValue
                  value={statusText}
                  className={`status-pill st-${slugify(artwork.status)} copyable-pill`}
                  onCopied={copiedToast}
                />{" "}
                {overdueMovement(artwork, inventory) && (
                  <RetrievalMark
                    artwork={artwork}
                    movement={overdueMovement(artwork, inventory)!}
                    inventory={inventory}
                    setInventory={setInventory}
                  />
                )}
              </dd>
              {artwork.status === "consigned" && (
                <>
                  <dt>{t("artwork.detail.meta.gallery")}</dt>
                  <dd>
                    <CopyableValue
                      value={galleryText}
                      onCopied={copiedToast}
                    >
                      {galleryText || "-"}
                    </CopyableValue>
                  </dd>
                </>
              )}
              {artwork.soldPrice && (
                <>
                  <dt>{t("artwork.detail.meta.soldBy")}</dt>
                  <dd>
                    <CopyableValue value={soldText} onCopied={copiedToast} />
                  </dd>
                </>
              )}
              <dt>{t("artwork.detail.meta.edition")}</dt>
              <dd>
                <CopyableValue value={editionText} onCopied={copiedToast} />
              </dd>
              <dt>{t("artwork.detail.meta.notes")}</dt>
              <dd>
                <CopyableValue
                  value={artwork.notes || ""}
                  className="notes-display"
                  onCopied={copiedToast}
                >
                  {artwork.notes || "-"}
                </CopyableValue>
              </dd>
            </dl>
          </>
        )}

        {tab === "info" && artwork.editionMode === "multiple" && editions.length > 0 && (
          <div className="related-block">
            <h3>{t("artwork.detail.copies", { count: editions.length })}</h3>
            <div className="mini-table">
              {editions.map((edition) => {
                const editionStatus = labelFor(
                  inventory,
                  "status",
                  edition.status || "not_made",
                  lang
                );
                return (
                  <div className="mini-row" key={edition.id}>
                    <CopyableValue
                      value={edition.label}
                      className="copyable-strong"
                      onCopied={copiedToast}
                    >
                      <strong>{edition.label}</strong>
                    </CopyableValue>
                    <CopyableValue
                      value={editionStatus}
                      onCopied={copiedToast}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "info" && (
          <ArtworkDocuments
            inventory={inventory}
            setInventory={setInventory}
            artworkId={artwork.id}
          />
        )}

        {tab === "movimientos" && (
          <div className="movements-view">
            {movements.length === 0 ? (
              <div className="movements-empty">
                <strong>{t("artwork.detail.movementsEmpty")}</strong>
                <p className="muted">{t("artwork.detail.movementsEmpty.hint")}</p>
              </div>
            ) : (
              <div className="movements-timeline">
                {movements.map((item) => {
                  const kind = movementKind(item.type);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`mv-card mv-card-${kind} mv-card-button`}
                      onClick={() => setOpenMovement(item)}
                    >
                      <span className={`mv-pill mv-pill-${kind}`}>
                        {labelFor(inventory, "movementType", item.type, lang) || item.type}
                      </span>
                      <span className="mv-card-copy">
                        <strong>
                          {movementSummary(item, inventory, t, lang)}
                          {item.editionLabel ? ` · ${item.editionLabel}` : ""}
                        </strong>
                        <span className="muted">
                          {[
                            item.date || t("common.noDate"),
                            movementSubtitle(item, inventory, t)
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="danger-zone">
          <div>
            <strong>{t("artwork.detail.delete.title")}</strong>
            <p className="muted">
              {t("artwork.detail.delete.body", { title: artwork.title })}
            </p>
          </div>
          <button className="ghost danger" onClick={() => setConfirmDelete(true)}>
            {t("artwork.detail.delete.button")}
          </button>
        </div>
      </div>

      {openMovement && (
        <MovementDetailModal
          movement={openMovement}
          inventory={inventory}
          onClose={() => setOpenMovement(null)}
        />
      )}

      {exporting && (
        <ImageExportModal
          inventory={inventory}
          artwork={artwork}
          onClose={() => setExporting(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t("confirm.artwork.title")}
          message={t("confirm.artwork.message", { title: artwork.title })}
          confirmLabel={t("common.deleteForever")}
          onConfirm={() => {
            setConfirmDelete(false);
            void remove();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * Reusable controls
 * ------------------------------------------------------------------------- */

// Which stored records still reference a given lookup value, so we can force a
// reassignment before the option is deleted.
function lookupUsage(
  inventory: InventoryData,
  category: string,
  value: string
): Array<{ id: string; label: string }> {
  if (category === "artworkType") {
    return inventory.artworks
      .filter((artwork) => artwork.type === value)
      .map((artwork) => ({ id: artwork.id, label: artwork.title || artwork.id }));
  }
  if (category === "exhibitionType") {
    return inventory.exhibitions
      .filter((exhibition) => exhibition.exhibitionType === value)
      .map((exhibition) => ({ id: exhibition.id, label: exhibition.title || exhibition.id }));
  }
  if (category === "movementType") {
    return inventory.movements
      .filter((movement) => movement.type === value)
      .map((movement) => {
        const art = inventory.artworks.find((a) => a.id === movement.artworkId);
        const parts = [art?.title || movement.artworkId, movement.date].filter(Boolean);
        return { id: movement.id, label: parts.join(" · ") };
      });
  }
  return [];
}

function LookupSelect({
  inventory,
  setInventory,
  category,
  label,
  value,
  onChange,
  allowEmpty,
  hideValues
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  category: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  hideValues?: string[];
}) {
  const { lang, t } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const options = translatedLookupOptions(inventory, category, lang).filter(
    (option) => !(hideValues ?? []).includes(option.value)
  );
  const canDelete = Boolean(value) && !isDefaultLookup(category, value);

  async function addOption() {
    const labelText = draft.trim();
    if (!labelText) return;
    const newValue = slugify(labelText) || labelText.toLowerCase();
    const data = await window.inventoryApi.saveLookup({
      category,
      value: newValue,
      label: labelText
    });
    setInventory(data);
    onChange(newValue);
    setDraft("");
    setAdding(false);
  }

  async function removeOption() {
    const selected = options.find((option) => option.value === value);
    if (!selected) return;
    const usage = lookupUsage(inventory, category, selected.value);
    // Nobody uses it: just delete.
    if (usage.length === 0) {
      const data = await window.inventoryApi.deleteLookup(selected);
      setInventory(data);
      onChange("");
      return;
    }
    const targets = lookupOptions(inventory, category).filter(
      (option) => option.value !== selected.value
    );
    // A single record uses it (typically just this one): silently move it to
    // the first other option and delete — one click, the name simply changes.
    if (usage.length === 1 && targets.length > 0) {
      const next = targets[0].value;
      const data = await window.inventoryApi.reassignLookup({
        category,
        fromValue: selected.value,
        assignments: usage.map((item) => ({ id: item.id, value: next }))
      });
      setInventory(data);
      onChange(next);
      return;
    }
    // Several records use it: make the user reassign each one first.
    setReassigning(true);
  }

  return (
    <div className="field lookup-field">
      <span className="field-label">{label}</span>
      <div className="lookup-row">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {allowEmpty && <option value="">{t("common.dash")}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {value && !options.some((option) => option.value === value) && (
            <option value={value}>{labelFor(inventory, category, value)}</option>
          )}
        </select>
        <button
          type="button"
          className="icon-button add"
          title={t("lookup.addOption")}
          onClick={() => setAdding(true)}
        >
          +
        </button>
        <button
          type="button"
          className="icon-button remove"
          title={
            canDelete
              ? t("lookup.removeOption")
              : t("lookup.removeBuiltin")
          }
          disabled={!canDelete}
          onClick={removeOption}
        >
          −
        </button>
      </div>
      {adding && (
        <div className="inline-add">
          <input
            autoFocus
            placeholder={`Nuevo: ${label.toLowerCase()}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addOption();
              }
            }}
          />
          <button type="button" className="small" onClick={addOption}>
            {t("common.add")}
          </button>
          <button
            type="button"
            className="small ghost"
            onClick={() => {
              setAdding(false);
              setDraft("");
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      )}
      {reassigning && (
        <LookupReassignModal
          inventory={inventory}
          setInventory={setInventory}
          category={category}
          label={label}
          fromValue={value}
          onClose={() => setReassigning(false)}
          onDone={() => {
            setReassigning(false);
            onChange("");
          }}
        />
      )}
    </div>
  );
}

function LookupReassignModal({
  inventory,
  setInventory,
  category,
  label,
  fromValue,
  onClose,
  onDone
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  category: string;
  label: string;
  fromValue: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { lang, t } = useLanguage();
  const usage = lookupUsage(inventory, category, fromValue);
  const targets = translatedLookupOptions(inventory, category, lang).filter(
    (option) => option.value !== fromValue
  );
  const fromLabel = labelFor(inventory, category, fromValue, lang);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const allChosen = usage.every((item) => (choices[item.id] ?? "").length > 0);

  async function confirm() {
    if (!allChosen || busy) return;
    setBusy(true);
    try {
      const data = await window.inventoryApi.reassignLookup({
        category,
        fromValue,
        assignments: usage.map((item) => ({ id: item.id, value: choices[item.id] }))
      });
      setInventory(data);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("confirm.lookup.title")}</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted">
          {t(
            usage.length === 1
              ? "confirm.lookup.usageOne"
              : "confirm.lookup.usageMany",
            { count: usage.length, label: label.toLowerCase(), fromLabel }
          )}
        </p>
        <div className="reassign-list">
          {usage.map((item) => (
            <div className="reassign-row" key={item.id}>
              <span className="reassign-name" title={item.label}>
                {item.label}
              </span>
              <select
                value={choices[item.id] ?? ""}
                onChange={(event) =>
                  setChoices((current) => ({
                    ...current,
                    [item.id]: event.target.value
                  }))
                }
              >
                <option value="">{t("confirm.lookup.pick")}</option>
                {targets.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {targets.length === 0 && (
          <p className="danger-text">{t("confirm.lookup.noAlternative")}</p>
        )}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="danger-solid"
            disabled={!allChosen || busy || targets.length === 0}
            onClick={confirm}
          >
            {t("confirm.lookup.updateDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Kind, singular label key, plural label key — translated at the call site. */
const CONTACT_KINDS: Array<[ContactKind, StringKey, StringKey]> = [
  ["person", "contact.kind.person", "contact.kind.persons"],
  ["gallery", "contact.kind.gallery", "contact.kind.galleries"],
  ["museum", "contact.kind.museum", "contact.kind.museums"],
  ["collection", "contact.kind.collection", "contact.kind.collections"]
];

function contactKindLabel(kind: ContactKind, t?: Translate): string {
  const entry = CONTACT_KINDS.find(([value]) => value === kind);
  if (!entry) return kind;
  return t ? t(entry[1]) : translate("es", entry[1]);
}

function isInstitution(kind: ContactKind): boolean {
  return kind !== "person";
}

// Same pattern as Tipo: pick an existing series, or + to type a new name.
// Blank = not chosen yet. «Sin serie» is a real option (NO_SERIES_VALUE).
function SeriesField({
  inventory,
  value,
  onChange
}: {
  inventory: InventoryData;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const options = useMemo(() => {
    const counts = new Map<string, number>();
    for (const art of inventory.artworks) {
      const name = art.series?.trim();
      if (!name || isNoSeries(name)) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    for (const info of inventory.seriesInfo ?? []) {
      const name = info.name?.trim();
      if (!name || isNoSeries(name)) continue;
      if (!counts.has(name)) counts.set(name, 0);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es", { sensitivity: "base" }))
      .map(([name, count]) => ({ name, count }));
  }, [inventory.artworks, inventory.seriesInfo]);

  function commitNew() {
    const next = draft.trim();
    if (!next) return;
    const lowered = next.toLowerCase();
    // Typing the "no series" phrase still maps to the built-in option.
    if (
      lowered === NO_SERIES_VALUE ||
      lowered === "sin serie" ||
      lowered === "no series" ||
      lowered === "keine serie" ||
      lowered === "ohne serie"
    ) {
      onChange(NO_SERIES_VALUE);
    } else {
      onChange(next);
    }
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="field lookup-field">
      <span className="field-label">{t("series.field.label")}</span>
      {adding ? (
        <div className="inline-add">
          <input
            autoFocus
            placeholder={t("series.field.namePlaceholder")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitNew();
              }
              if (event.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
          />
          <button type="button" onClick={commitNew} disabled={!draft.trim()}>
            {t("common.use")}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setAdding(false);
              setDraft("");
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <div className="lookup-row">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">{t("series.field.placeholder")}</option>
            <option value={NO_SERIES_VALUE}>{t("series.field.none")}</option>
            {options.map((option) => (
              <option key={option.name} value={option.name}>
                {option.count > 0
                  ? `${option.name} (${option.count})`
                  : option.name}
              </option>
            ))}
            {value.trim() &&
              !isNoSeries(value) &&
              !options.some((option) => option.name === value.trim()) && (
                <option value={value}>{value}</option>
              )}
          </select>
          <button
            type="button"
            className="icon-button add wide"
            title={t("series.field.createNew")}
            onClick={() => setAdding(true)}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

function ContactSelect({
  inventory,
  setInventory,
  label,
  value,
  onChange,
  kind
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind: ContactKind;
}) {
  const t = useT();
  const [showModal, setShowModal] = useState(false);
  const contacts = inventory.contacts.filter((contact) => contact.kind === kind);

  return (
    <div className="field lookup-field">
      <span className="field-label">{label}</span>
      <div className="lookup-row">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t("common.selectPlaceholder")}</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button add wide"
          title={kind === "gallery" ? t("contact.form.addGallery") : t("contact.form.addPerson")}
          onClick={() => setShowModal(true)}
        >
          +
        </button>
      </div>
      {showModal && (
        <ContactModal
          kind={kind}
          inventory={inventory}
          setInventory={setInventory}
          onClose={() => setShowModal(false)}
          onCreated={(id) => {
            onChange(id);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function ContactModal({
  kind,
  initial,
  inventory,
  setInventory,
  onClose,
  onCreated
}: {
  kind: ContactKind;
  initial?: Contact;
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<ContactInput>({
    id: initial?.id,
    kind,
    name: initial?.name ?? "",
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    birthday: initial?.birthday ?? "",
    job: initial?.job ?? "",
    relationship: initial?.relationship ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    website: initial?.website ?? "",
    location: initial?.location ?? "",
    city: initial?.city ?? "",
    country: initial?.country ?? "",
    firstContactYear: initial?.firstContactYear ?? "",
    comments: initial?.comments ?? "",
    galleristContactId: initial?.galleristContactId ?? "",
    organizationId: initial?.organizationId ?? ""
  });
  const [error, setError] = useState("");

  function set<K extends keyof ContactInput>(key: K, value: ContactInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    try {
      const data = await window.inventoryApi.saveContact(form);
      const name =
        (form.name ?? "").trim() ||
        [form.firstName, form.lastName].filter(Boolean).join(" ").trim();
      const created =
        (form.id && data.contacts.find((contact) => contact.id === form.id)) ||
        [...data.contacts]
          .filter((contact) => contact.kind === kind)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .find((contact) => contact.name.toLowerCase() === name.toLowerCase());
      setInventory(data);
      if (created && onCreated) onCreated(created.id);
      else onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error.save"));
    }
  }

  const heading = t(
    initial ? "contact.form.titleEdit" : "contact.form.titleNew",
    { kind: contactKindLabel(kind, t).toLowerCase() }
  );

  const institutions = inventory.contacts.filter((contact) =>
    isInstitution(contact.kind)
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{heading}</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {isInstitution(kind) ? (
          <div className="modal-body">
            <label className="field">
              {kind === "gallery"
                ? t("contact.form.nameGallery")
                : kind === "museum"
                  ? t("contact.form.nameMuseum")
                  : t("contact.form.nameCollection")}
              <input value={form.name ?? ""} onChange={(event) => set("name", event.target.value)} />
            </label>
            <div className="form-row">
              <label className="field">
                {t("contact.form.city")}
                <input
                  value={form.city ?? ""}
                  onChange={(event) => set("city", event.target.value)}
                />
              </label>
              <label className="field">
                {t("contact.form.country")}
                <input
                  value={form.country ?? ""}
                  onChange={(event) => set("country", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                {t("contact.form.website")}
                <input
                  value={form.website ?? ""}
                  onChange={(event) => set("website", event.target.value)}
                />
              </label>
              <label className="field">
                {t("contact.form.firstContactYear")}
                <input
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={t("artwork.field.yearPlaceholder")}
                  value={form.firstContactYear ?? ""}
                  onChange={(event) =>
                    set(
                      "firstContactYear",
                      event.target.value.replace(/[^0-9]/g, "").slice(0, 4)
                    )
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                {t("contact.form.phone")}
                <input
                  value={form.phone ?? ""}
                  onChange={(event) => set("phone", event.target.value)}
                />
              </label>
              <label className="field">
                {t("contact.form.email")}
                <input
                  value={form.email ?? ""}
                  onChange={(event) => set("email", event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              {t("contact.form.relation")}
              <input
                value={form.relationship ?? ""}
                onChange={(event) => set("relationship", event.target.value)}
              />
            </label>
            <ContactSelect
              inventory={inventory}
              setInventory={setInventory}
              label={t("contact.form.gallerist")}
              kind="person"
              value={form.galleristContactId ?? ""}
              onChange={(value) => set("galleristContactId", value)}
            />
            <label className="field">
              {t("contact.form.comments")}
              <textarea
                value={form.comments ?? ""}
                onChange={(event) => set("comments", event.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="modal-body">
            <div className="form-row">
              <label className="field">
                {t("contact.form.firstName")}
                <input
                  value={form.firstName ?? ""}
                  onChange={(event) => set("firstName", event.target.value)}
                />
              </label>
              <label className="field">
                {t("contact.form.lastName")}
                <input
                  value={form.lastName ?? ""}
                  onChange={(event) => set("lastName", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                {t("contact.form.birthday")}
                <DateField
                  value={form.birthday ?? ""}
                  onChange={(value) => set("birthday", value)}
                />
              </label>
              <label className="field">
                {t("contact.form.profession")}
                <input
                  value={form.job ?? ""}
                  onChange={(event) => set("job", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                {t("contact.form.city")}
                <input
                  value={form.city ?? ""}
                  onChange={(event) => set("city", event.target.value)}
                />
              </label>
              <label className="field">
                {t("contact.form.country")}
                <input
                  value={form.country ?? ""}
                  onChange={(event) => set("country", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                {t("contacts.col.relation")}
                <input
                  value={form.relationship ?? ""}
                  onChange={(event) => set("relationship", event.target.value)}
                />
              </label>
              <label className="field">
                {t("contact.form.phone")}
                <input
                  value={form.phone ?? ""}
                  onChange={(event) => set("phone", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                {t("contact.form.email")}
                <input
                  value={form.email ?? ""}
                  onChange={(event) => set("email", event.target.value)}
                />
              </label>
              <label className="field">
                {t("contact.form.firstContactYear")}
                <input
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={t("artwork.field.yearPlaceholder")}
                  value={form.firstContactYear ?? ""}
                  onChange={(event) =>
                    set(
                      "firstContactYear",
                      event.target.value.replace(/[^0-9]/g, "").slice(0, 4)
                    )
                  }
                />
              </label>
            </div>
            <label className="field">
              {t("contact.form.website")}
              <input
                value={form.website ?? ""}
                onChange={(event) => set("website", event.target.value)}
              />
            </label>
            <label className="field">
              {t("contact.form.linkedToFull")}
              <select
                value={form.organizationId ?? ""}
                onChange={(event) => set("organizationId", event.target.value)}
              >
                <option value="">{t("contact.form.none")}</option>
                {institutions.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} · {contactKindLabel(org.kind, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t("contact.form.comments")}
              <textarea
                value={form.comments ?? ""}
                onChange={(event) => set("comments", event.target.value)}
              />
            </label>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button onClick={save}>{t("common.save")}</button>
          <button className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Contacts page
 * ------------------------------------------------------------------------- */

function ContactsPage({
  inventory,
  setInventory,
  onOpen
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onOpen: (contactId: string) => void;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ContactKind>("all");
  const [countryFilter, setCountryFilter] = useState("");
  const [sort, setSort] = useState<"name" | "recent">("name");
  const [modal, setModal] = useState<{ kind: ContactKind } | null>(null);

  const countries = uniqueValues(
    inventory.contacts.map((contact) => contact.country || contact.location)
  ).sort((a, b) => a.localeCompare(b));

  const contacts = useMemo(() => {
    const filtered = inventory.contacts.filter((contact) => {
      const haystack = [
        contact.name,
        contact.email,
        contact.location,
        contact.city,
        contact.country,
        contact.relationship,
        contact.job
      ]
        .join(" ")
        .toLowerCase();
      const place = `${contact.country ?? ""} ${contact.location ?? ""}`.toLowerCase();
      return (
        haystack.includes(search.toLowerCase()) &&
        (kindFilter === "all" || contact.kind === kindFilter) &&
        (countryFilter === "" || place.includes(countryFilter.toLowerCase()))
      );
    });
    return [...filtered].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [inventory.contacts, countryFilter, kindFilter, search, sort]);

  return (
    <section className="list-page">
      <div className="list-toolbar">
        <div className="segmented">
          <button
            className={kindFilter === "all" ? "seg active" : "seg"}
            onClick={() => setKindFilter("all")}
          >
            {t("common.all")}
          </button>
          {CONTACT_KINDS.map(([value, , pluralKey]) => (
            <button
              key={value}
              className={kindFilter === value ? "seg active" : "seg"}
              onClick={() => setKindFilter(value)}
            >
              {t(pluralKey)}
            </button>
          ))}
        </div>
        <input
          className="search-input grow"
          placeholder={t("contacts.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {countries.length > 0 && (
          <label className="sort-control">
            {t("contacts.filter.place")}
            <select
              value={countryFilter}
              onChange={(event) => setCountryFilter(event.target.value)}
            >
              <option value="">{t("common.all")}</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="sort-control">
          {t("common.sort")}
          <select value={sort} onChange={(event) => setSort(event.target.value as "name" | "recent")}>
            <option value="name">{t("contacts.sort.name")}</option>
            <option value="recent">{t("contacts.sort.recent")}</option>
          </select>
        </label>
        {(search || countryFilter || kindFilter !== "all") && (
          <button
            className="ghost"
            onClick={() => {
              setSearch("");
              setCountryFilter("");
              setKindFilter("all");
            }}
          >
            {t("common.clear")}
          </button>
        )}
        <span className="count-pill">{contacts.length}</span>
        <label className="sort-control">
          {t("common.add")}
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) setModal({ kind: event.target.value as ContactKind });
            }}
          >
            <option value="">{t("contacts.add")}</option>
            {CONTACT_KINDS.map(([value, singularKey]) => (
              <option key={value} value={value}>
                {t(singularKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="list-table-wrap">
        <div className="list-table">
          <div className="list-row list-row-header">
            <span>{t("contacts.col.type")}</span>
            <span>{t("contacts.col.name")}</span>
            <span>{t("contacts.col.place")}</span>
            <span>{t("contacts.col.relation")}</span>
            <span>{t("contacts.col.contact")}</span>
            <span>{t("contacts.col.since")}</span>
          </div>
          {contacts.length === 0 ? (
            <div className="table-empty">{t("contacts.empty")}</div>
          ) : (
            contacts.map((contact) => (
              <button
                key={contact.id}
                className="list-row clickable"
                onClick={() => onOpen(contact.id)}
              >
                <span>
                  <span className={`tag tag-${contact.kind}`}>
                    {contactKindLabel(contact.kind, t)}
                  </span>
                </span>
                <span className="cell-strong">{contact.name}</span>
                <span>
                  {[contact.city, contact.country || contact.location]
                    .filter(Boolean)
                    .join(", ") || "-"}
                </span>
                <span>{contact.relationship || contact.job || "-"}</span>
                <span>{contact.phone || contact.email || "-"}</span>
                <span>{contact.firstContactYear || "-"}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {modal && (
        <ContactModal
          kind={modal.kind}
          inventory={inventory}
          setInventory={setInventory}
          onClose={() => setModal(null)}
          onCreated={(id) => {
            setModal(null);
            onOpen(id);
          }}
        />
      )}
    </section>
  );
}

function PickThumb({
  artwork,
  inventory
}: {
  artwork: Artwork;
  inventory: InventoryData;
}) {
  const image = mainImageFor(artwork, inventory);
  const imageUrl = useImageDataUrl(image?.absolutePath);
  return (
    <span className="pick-thumb">
      {imageUrl ? (
        <img src={imageUrl} alt={artwork.title} />
      ) : image?.absolutePath ? (
        <span className="thumb-file-icon">
          <FileKindIcon kind={fileKindFromName(image.absolutePath)} />
        </span>
      ) : (
        <span>—</span>
      )}
    </span>
  );
}

type ArtworkSort = "title" | "year" | "size" | "series";

function orderArtworks(list: Artwork[], sort: ArtworkSort): Artwork[] {
  const copy = [...list];
  if (sort === "year") {
    copy.sort((a, b) => (b.yearMade ?? "").localeCompare(a.yearMade ?? ""));
  } else if (sort === "size") {
    const area = (artwork: Artwork) =>
      (toCm(artwork.height, artwork.unit) ?? 0) *
      (toCm(artwork.width, artwork.unit) ?? 0);
    copy.sort((a, b) => area(b) - area(a));
  } else if (sort === "series") {
    copy.sort((a, b) => {
      const aSeries = a.series?.trim() || "";
      const bSeries = b.series?.trim() || "";
      if (!aSeries && bSeries) return 1;
      if (aSeries && !bSeries) return -1;
      const bySeries = aSeries.localeCompare(bSeries, "es", { sensitivity: "base" });
      if (bySeries !== 0) return bySeries;
      return a.title.localeCompare(b.title, "es", { sensitivity: "base" });
    });
  } else {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  }
  return copy;
}

/** Group selected works in current list order: first time a series appears = its place. */
function groupArtworksBySeriesOrder(
  ids: string[],
  inventory: InventoryData,
  noSeriesLabel: string
): Array<{ key: string; label: string; arts: Artwork[] }> {
  const groups: Array<{ key: string; label: string; arts: Artwork[] }> = [];
  const indexByKey = new Map<string, number>();
  for (const id of ids) {
    const art = inventory.artworks.find((item) => item.id === id);
    if (!art) continue;
    const raw = art.series?.trim() || "";
    const key = raw ? raw.toLocaleLowerCase("es") : "__none__";
    const label = raw || noSeriesLabel;
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ key, label, arts: [art] });
    } else {
      groups[existing].arts.push(art);
    }
  }
  return groups;
}

function flattenSeriesArtGroups(
  groups: Array<{ arts: Artwork[] }>
): string[] {
  return groups.flatMap((group) => group.arts.map((art) => art.id));
}

/** Series A→Z (sin serie last). Keeps each painting's order inside its series. */
function sortArtworkIdsBySeries(
  ids: string[],
  inventory: InventoryData,
  noSeriesLabel: string
): string[] {
  const groups = groupArtworksBySeriesOrder(ids, inventory, noSeriesLabel);
  groups.sort((a, b) => {
    if (a.key === "__none__" && b.key !== "__none__") return 1;
    if (b.key === "__none__" && a.key !== "__none__") return -1;
    return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
  });
  return flattenSeriesArtGroups(groups);
}

function moveSeriesGroup(
  groups: Array<{ key: string; label: string; arts: Artwork[] }>,
  index: number,
  dir: -1 | 1
): Array<{ key: string; label: string; arts: Artwork[] }> {
  const next = index + dir;
  if (next < 0 || next >= groups.length) return groups;
  const copy = groups.map((group) => ({
    ...group,
    arts: [...group.arts]
  }));
  const tmp = copy[index];
  copy[index] = copy[next];
  copy[next] = tmp;
  return copy;
}

function moveArtInSeriesGroup(
  groups: Array<{ key: string; label: string; arts: Artwork[] }>,
  groupIndex: number,
  artIndex: number,
  dir: -1 | 1
): Array<{ key: string; label: string; arts: Artwork[] }> {
  const group = groups[groupIndex];
  if (!group) return groups;
  const next = artIndex + dir;
  if (next < 0 || next >= group.arts.length) return groups;
  const copy = groups.map((item, i) =>
    i === groupIndex ? { ...item, arts: [...item.arts] } : item
  );
  const arts = copy[groupIndex].arts;
  const tmp = arts[artIndex];
  arts[artIndex] = arts[next];
  arts[next] = tmp;
  return copy;
}

function ApplicationSeriesOrder({
  artworkIds,
  inventory,
  noSeriesLabel,
  onChange,
  onRemove
}: {
  artworkIds: string[];
  inventory: InventoryData;
  noSeriesLabel: string;
  onChange: (ids: string[], options?: { quiet?: boolean }) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  const groups = groupArtworksBySeriesOrder(
    artworkIds,
    inventory,
    noSeriesLabel
  );

  // Keep PDF order = UI order: each series is one contiguous block.
  useEffect(() => {
    const flat = flattenSeriesArtGroups(groups);
    const known = artworkIds.filter((id) =>
      inventory.artworks.some((art) => art.id === id)
    );
    if (
      flat.length !== known.length ||
      flat.some((id, index) => id !== known[index])
    ) {
      onChange(flat, { quiet: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworkIds.join("|")]);

  if (groups.length === 0) {
    return (
      <p className="muted small-note">{t("application.works.noneChosen")}</p>
    );
  }

  return (
    <div className="app-series-order">
      <p className="muted small-note">{t("application.series.orderHint")}</p>
      {groups.map((group, groupIndex) => (
        <div className="app-series-block" key={group.key}>
          <div className="app-series-block-head">
            <OrderButtons
              index={groupIndex}
              total={groups.length}
              onMove={(dir) =>
                onChange(
                  flattenSeriesArtGroups(
                    moveSeriesGroup(groups, groupIndex, dir)
                  )
                )
              }
            />
            <div className="app-series-block-title">
              <strong>{group.label}</strong>
              <span className="muted">
                {group.arts.length}{" "}
                {group.arts.length === 1
                  ? t("common.workOne")
                  : t("common.workMany")}
              </span>
            </div>
          </div>
          <div className="app-series-works">
            {group.arts.map((art, artIndex) => (
              <div className="app-series-work" key={art.id}>
                <OrderButtons
                  index={artIndex}
                  total={group.arts.length}
                  onMove={(dir) =>
                    onChange(
                      flattenSeriesArtGroups(
                        moveArtInSeriesGroup(groups, groupIndex, artIndex, dir)
                      )
                    )
                  }
                />
                <div className="app-series-work-main">
                  <strong>{art.title}</strong>
                  {art.yearMade ? (
                    <span className="muted">{art.yearMade}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="ghost danger small"
                  onClick={() => onRemove(art.id)}
                >
                  {t("common.remove")}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ArtworkPickerModal({
  inventory,
  excludeIds = [],
  initialIds = [],
  title,
  notice,
  onConfirm,
  onClose
}: {
  inventory: InventoryData;
  excludeIds?: string[];
  initialIds?: string[];
  title?: string;
  notice?: string;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const pickerTitle = title ?? t("picker.addWorks");
  const [picked, setPicked] = useState<string[]>(initialIds);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ArtworkSort>("title");

  const exclude = new Set(excludeIds);
  const list = orderArtworks(
    inventory.artworks.filter((artwork) => {
      if (exclude.has(artwork.id)) return false;
      const haystack = [artwork.title, artwork.series, artwork.id]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search.toLowerCase());
    }),
    sort
  );

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{pickerTitle}</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-toolbar">
          <input
            className="search-input grow"
            placeholder={t("picker.searchWork")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="sort-control">
            {t("common.sort")}
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ArtworkSort)}
            >
              <option value="title">{t("library.sort.title")}</option>
              <option value="series">{t("library.sort.series")}</option>
              <option value="year">{t("artwork.field.year")}</option>
              <option value="size">{t("picker.sort.size")}</option>
            </select>
          </label>
        </div>
        {notice && <p className="muted small-note picker-notice">{notice}</p>}
        <div className="modal-toolbar picker-select-bar">
          <button
            type="button"
            className="ghost small"
            onClick={() =>
              setPicked((current) => {
                const next = new Set(current);
                for (const artwork of list) next.add(artwork.id);
                return Array.from(next);
              })
            }
          >
            {t("picker.selectVisible", { n: list.length })}
          </button>
          <button
            type="button"
            className="ghost small"
            disabled={picked.length === 0}
            onClick={() => setPicked([])}
          >
            {t("picker.clearSelection")}
          </button>
          <span className="muted small-note">
            {t("picker.selectedCount", { n: picked.length })}
          </span>
        </div>
        <div className="modal-body modal-pick-list">
          {list.length === 0 ? (
            <p className="muted">{t("library.empty")}</p>
          ) : (
            list.map((artwork) => (
              <label
                className={`picker-option${
                  picked.includes(artwork.id) ? " is-picked" : ""
                }`}
                key={artwork.id}
              >
                <input
                  type="checkbox"
                  className="picker-check"
                  checked={picked.includes(artwork.id)}
                  onChange={() => toggle(artwork.id)}
                />
                <PickThumb artwork={artwork} inventory={inventory} />
                <span className="pick-title">{artwork.title}</span>
                <span className="muted picker-meta">
                  {artwork.series?.trim()
                    ? `${seriesLabel(artwork.series, t)} · `
                    : ""}
                  {artwork.yearMade || artwork.id}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            disabled={picked.length === 0}
            onClick={() => onConfirm(picked)}
          >
            {t("picker.addSelected", { n: picked.length })}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "tiff",
  "bmp",
  "heic",
  "heif"
];

/** Formats Chromium/Electron usually cannot paint as <img>. */
const NO_INLINE_IMAGE_PREVIEW = new Set(["heic", "heif", "tif", "tiff"]);

function fileExt(name?: string): string {
  if (!name) return "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isImageFile(name?: string): boolean {
  if (!name) return false;
  return IMAGE_EXTENSIONS.includes(fileExt(name));
}

function canInlineImagePreview(name?: string): boolean {
  if (!isImageFile(name)) return false;
  return !NO_INLINE_IMAGE_PREVIEW.has(fileExt(name));
}

type FileKind = "image" | "pdf" | "video" | "word" | "sheet" | "file";

function fileKindFromName(name?: string): FileKind {
  const ext = fileExt(name);
  if (IMAGE_EXTENSIONS.includes(ext) || NO_INLINE_IMAGE_PREVIEW.has(ext)) {
    return "image";
  }
  if (ext === "pdf") return "pdf";
  if (["mov", "qt", "mp4", "m4v", "avi", "mkv", "webm", "mpg", "mpeg", "3gp"].includes(ext)) return "video";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "word";
  if (["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  return "file";
}

function FileKindIcon({
  kind,
  size = 16
}: {
  kind: FileKind;
  size?: number;
}) {
  const common = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };
  if (kind === "image") {
    return (
      <svg {...common} className="file-kind-icon">
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
        <path d="M4.5 16.5 9 12l3 3 3.5-4.5 4 5.5" />
      </svg>
    );
  }
  if (kind === "pdf") {
    return (
      <svg {...common} className="file-kind-icon">
        <path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" />
        <path d="M14 3.5V9h5.5" />
        <path d="M8.5 14.5h7M8.5 17.5h5" />
      </svg>
    );
  }
  if (kind === "video") {
    return (
      <svg {...common} className="file-kind-icon">
        <rect x="3.5" y="6" width="13" height="12" rx="2" />
        <path d="M16.5 10.5 20.5 8v8l-4-2.5z" />
      </svg>
    );
  }
  if (kind === "word" || kind === "sheet") {
    return (
      <svg {...common} className="file-kind-icon">
        <path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" />
        <path d="M14 3.5V9h5.5" />
        <path d="M8.5 13h7M8.5 16h7M8.5 19h4" />
      </svg>
    );
  }
  return (
    <svg {...common} className="file-kind-icon">
      <path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M14 3.5V9h5.5" />
    </svg>
  );
}

function documentDisplayName(image: ArtworkImage, fallback: string): string {
  return (
    image.originalName ||
    image.relativePath.split("/").pop() ||
    fallback
  );
}

function DocumentDescriptionModal({
  image,
  mode,
  setInventory,
  onClose,
  onEdit
}: {
  image: ArtworkImage;
  mode: "edit" | "view";
  setInventory: (data: InventoryData) => void;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const t = useT();
  const name = documentDisplayName(image, t("common.documentOne"));
  const [caption, setCaption] = useState(image.caption ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCaption(image.caption ?? "");
  }, [image.id, image.caption]);

  async function save() {
    setSaving(true);
    try {
      if ((image.caption ?? "") !== caption) {
        const data = await window.inventoryApi.setDocumentCaption(
          image.id,
          caption
        );
        setInventory(data);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const body = String(image.caption ?? "").trim();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal doc-desc-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h3>
              {mode === "edit"
                ? t("media.desc.editTitle")
                : t("media.desc.viewTitle")}
            </h3>
            <p className="muted small-note export-modal-lead">{name}</p>
          </div>
          <button type="button" className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {mode === "edit" ? (
            <label className="field">
              {t("media.desc.label")}
              <textarea
                className="doc-desc-textarea"
                rows={8}
                autoFocus
                placeholder={t("media.descPlaceholder")}
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
            </label>
          ) : body ? (
            <p className="doc-desc-full">{body}</p>
          ) : (
            <p className="muted small-note">{t("media.desc.empty")}</p>
          )}
        </div>
        <div className="modal-actions">
          {mode === "edit" ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? t("common.saving") : t("common.save")}
              </button>
              <button type="button" className="ghost" onClick={onClose}>
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => (onEdit ? onEdit() : undefined)}
              >
                {t("common.edit")}
              </button>
              <button type="button" className="ghost" onClick={onClose}>
                {t("common.close")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentRow({
  image,
  setInventory,
  autoEdit = false,
  onAutoEditHandled
}: {
  image: ArtworkImage;
  setInventory: (data: InventoryData) => void;
  autoEdit?: boolean;
  onAutoEditHandled?: () => void;
}) {
  const t = useT();
  const name = documentDisplayName(image, t("common.documentOne"));
  const kind = fileKindFromName(name);
  const showInline = canInlineImagePreview(name);
  const url = useImageDataUrl(showInline ? image.absolutePath : undefined);
  const [previewBroken, setPreviewBroken] = useState(false);
  const caption = String(image.caption ?? "").trim();
  const [modal, setModal] = useState<null | "edit" | "view">(null);

  useEffect(() => {
    setPreviewBroken(false);
  }, [image.id, url]);

  useEffect(() => {
    if (!autoEdit) return;
    setModal("edit");
    onAutoEditHandled?.();
    // Only react when autoEdit flips on for this row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit, image.id]);

  async function open() {
    if (image.absolutePath) await window.inventoryApi.openDocument(image.absolutePath);
  }

  const preview =
    caption.length > 72 ? `${caption.slice(0, 72).trimEnd()}…` : caption;
  const showImage = showInline && Boolean(url) && !previewBroken;

  return (
    <>
      <div className="doc-row">
        <button
          type="button"
          className={`doc-preview kind-${kind}${showImage ? "" : " is-icon"}`}
          onClick={open}
          title={t("common.open")}
        >
          {showImage ? (
            <img
              src={url}
              alt={name}
              onError={() => setPreviewBroken(true)}
            />
          ) : (
            <FileKindIcon kind={kind} />
          )}
        </button>
        <button
          type="button"
          className="doc-name"
          onClick={open}
          title={t("media.openDocument")}
        >
          {name}
        </button>
        <button
          type="button"
          className={`doc-desc-preview${caption ? "" : " is-empty"}`}
          onClick={() => setModal(caption ? "view" : "edit")}
          title={caption || t("media.descPlaceholder")}
        >
          {preview || t("media.descPlaceholder")}
        </button>
        <button
          type="button"
          className="ghost small doc-desc-edit"
          onClick={() => setModal("edit")}
        >
          {t("common.edit")}
        </button>
      </div>
      {modal ? (
        <DocumentDescriptionModal
          image={image}
          mode={modal}
          setInventory={setInventory}
          onClose={() => setModal(null)}
          onEdit={() => setModal("edit")}
        />
      ) : null}
    </>
  );
}

function DocumentPickModal({
  documents,
  title,
  emptyLabel,
  onPick,
  onClose
}: {
  documents: ArtworkImage[];
  title: string;
  emptyLabel: string;
  onPick: (image: ArtworkImage) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal confirm-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {documents.length === 0 ? (
            <p className="muted small-note">{emptyLabel}</p>
          ) : (
            <div className="doc-pick-list">
              {documents.map((image) => {
                const name = documentDisplayName(image, t("common.documentOne"));
                const caption = String(image.caption ?? "").trim();
                return (
                  <button
                    key={image.id}
                    type="button"
                    className="doc-pick-row"
                    onClick={() => onPick(image)}
                  >
                    <strong>{name}</strong>
                    {caption ? (
                      <span className="muted small-note">{caption}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ArtworkDocuments({
  inventory,
  setInventory,
  artworkId
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  artworkId: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickMode, setPickMode] = useState<null | "save" | "remove">(null);
  const [describeId, setDescribeId] = useState<string | null>(null);
  const docsDrop = useFileDragOver(!busy);
  const documents = inventory.images.filter(
    (image) =>
      image.targetType === "artwork" &&
      image.targetId === artworkId &&
      (image.category === "document" || image.category === "extra")
  );
  const imageDocs = documents.filter((image) =>
    isImageFile(documentDisplayName(image, ""))
  );

  async function add() {
    setBusy(true);
    try {
      const result = await window.inventoryApi.importDocument("artwork", artworkId);
      if (result) {
        setInventory(result.inventory);
        setOpen(true);
        const imported = result.image as ArtworkImage | undefined;
        if (imported?.id) setDescribeId(imported.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function importDroppedFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      let lastImported: ArtworkImage | undefined;
      let nextInventory: InventoryData | null = null;
      let failed = 0;
      for (const file of files) {
        const sourcePath = pathForDroppedFile(file);
        if (!sourcePath) {
          failed += 1;
          continue;
        }
        try {
          const result = await window.inventoryApi.importImageFromPath(
            sourcePath,
            "artwork",
            artworkId,
            "document"
          );
          if (!result) {
            failed += 1;
            continue;
          }
          nextInventory = result.inventory;
          lastImported = result.image as ArtworkImage | undefined;
        } catch {
          failed += 1;
        }
      }
      if (nextInventory) {
        setInventory(nextInventory);
        setOpen(true);
        if (lastImported?.id) setDescribeId(lastImported.id);
      } else if (failed > 0) {
        /* keep quiet if nothing imported — path API may need restart */
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveCopyOf(image: ArtworkImage) {
    setPickMode(null);
    if (!image.absolutePath) return;
    await window.inventoryApi.saveImageCopy(
      image.absolutePath,
      image.caption || documentDisplayName(image, t("common.documentOne"))
    );
  }

  async function removeOf(image: ArtworkImage) {
    setPickMode(null);
    const data = await window.inventoryApi.deleteImage(image.id);
    setInventory(data);
  }

  return (
    <div
      className={`artwork-docs${open ? " open" : ""}${docsDrop.over ? " is-file-drag" : ""}`}
      {...docsDrop.handlers}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        docsDrop.reset();
        void importDroppedFiles(filesFromDropEvent(event));
      }}
    >
      <button
        type="button"
        className="series-works-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{t("artwork.docs", { count: documents.length })}</span>
        <span className="series-works-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="artwork-docs-body">
          <div className="artwork-docs-toolbar">
            <p className="muted small-note">{t("artwork.docs.hint")}</p>
            <div className="artwork-docs-actions">
              <button
                type="button"
                className="ghost small doc-action-add"
                disabled={busy}
                onClick={() => void add()}
              >
                {busy ? "…" : t("artwork.docs.add")}
              </button>
              <button
                type="button"
                className="ghost small doc-action-save"
                disabled={imageDocs.length === 0}
                title={t("media.saveCopyElsewhere")}
                onClick={() => setPickMode("save")}
              >
                {t("media.saveCopy")}
              </button>
              <button
                type="button"
                className="ghost small doc-action-remove"
                disabled={documents.length === 0}
                onClick={() => setPickMode("remove")}
              >
                {t("common.remove")}
              </button>
            </div>
          </div>
          {documents.length === 0 ? (
            <p className="muted small-note">{t("artwork.docs.empty")}</p>
          ) : (
            <div className="doc-list">
              {documents.map((image) => (
                <DocumentRow
                  key={image.id}
                  image={image}
                  setInventory={setInventory}
                  autoEdit={describeId === image.id}
                  onAutoEditHandled={() => setDescribeId(null)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {pickMode === "save" ? (
        <DocumentPickModal
          documents={imageDocs}
          title={t("artwork.docs.pickSave")}
          emptyLabel={t("artwork.docs.noImages")}
          onPick={(image) => void saveCopyOf(image)}
          onClose={() => setPickMode(null)}
        />
      ) : null}
      {pickMode === "remove" ? (
        <DocumentPickModal
          documents={documents}
          title={t("artwork.docs.pickRemove")}
          emptyLabel={t("artwork.docs.empty")}
          onPick={(image) => void removeOf(image)}
          onClose={() => setPickMode(null)}
        />
      ) : null}
    </div>
  );
}

function ExhibitionDocuments({
  inventory,
  setInventory,
  exhibitionId
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  exhibitionId: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [pickMode, setPickMode] = useState<null | "save" | "remove">(null);
  const [describeId, setDescribeId] = useState<string | null>(null);
  const documents = inventory.images.filter(
    (image) =>
      image.targetType === "exhibition" &&
      image.targetId === exhibitionId &&
      (image.category === "document" || image.category === "extra")
  );
  const imageDocs = documents.filter((image) =>
    isImageFile(documentDisplayName(image, ""))
  );

  async function add() {
    setBusy(true);
    try {
      const result = await window.inventoryApi.importDocument("exhibition", exhibitionId);
      if (result) {
        setInventory(result.inventory);
        const imported = result.image as ArtworkImage | undefined;
        if (imported?.id) setDescribeId(imported.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveCopyOf(image: ArtworkImage) {
    setPickMode(null);
    if (!image.absolutePath) return;
    await window.inventoryApi.saveImageCopy(
      image.absolutePath,
      image.caption || documentDisplayName(image, t("common.documentOne"))
    );
  }

  async function removeOf(image: ArtworkImage) {
    setPickMode(null);
    const data = await window.inventoryApi.deleteImage(image.id);
    setInventory(data);
  }

  return (
    <div className="form-section extra-images-section">
      <div className="related-head">
        <h3>{t("exhibition.docs.title")}</h3>
      </div>
      <p className="muted small-note">{t("exhibition.docs.hint")}</p>
      <div className="artwork-docs-actions">
        <button
          type="button"
          className="ghost small doc-action-add"
          disabled={busy}
          onClick={add}
        >
          {t("exhibition.docs.add")}
        </button>
        <button
          type="button"
          className="ghost small doc-action-save"
          disabled={imageDocs.length === 0}
          onClick={() => setPickMode("save")}
        >
          {t("media.saveCopy")}
        </button>
        <button
          type="button"
          className="ghost small doc-action-remove"
          disabled={documents.length === 0}
          onClick={() => setPickMode("remove")}
        >
          {t("common.remove")}
        </button>
      </div>
      {documents.length === 0 ? (
        <p className="muted small-note">{t("media.docsEmpty")}</p>
      ) : (
        <div className="doc-list">
          {documents.map((image) => (
            <DocumentRow
              key={image.id}
              image={image}
              setInventory={setInventory}
              autoEdit={describeId === image.id}
              onAutoEditHandled={() => setDescribeId(null)}
            />
          ))}
        </div>
      )}
      {pickMode === "save" ? (
        <DocumentPickModal
          documents={imageDocs}
          title={t("artwork.docs.pickSave")}
          emptyLabel={t("artwork.docs.noImages")}
          onPick={(image) => void saveCopyOf(image)}
          onClose={() => setPickMode(null)}
        />
      ) : null}
      {pickMode === "remove" ? (
        <DocumentPickModal
          documents={documents}
          title={t("artwork.docs.pickRemove")}
          emptyLabel={t("media.docsEmpty")}
          onPick={(image) => void removeOf(image)}
          onClose={() => setPickMode(null)}
        />
      ) : null}
    </div>
  );
}

function ExhibitionSalesSection({
  inventory,
  setInventory,
  exhibition
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  exhibition: Exhibition;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [artworkId, setArtworkId] = useState("");
  const [price, setPrice] = useState("");
  const [contactId, setContactId] = useState("");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");

  const sales = inventory.movements
    .filter(
      (movement) =>
        movement.exhibitionId === exhibition.id &&
        movementKind(movement.type) === "sale"
    )
    .sort((a, b) => movementDateValue(b) - movementDateValue(a));

  const candidates = orderArtworks(
    inventory.artworks.filter((artwork) => {
      const matches = [artwork.title, artwork.series, artwork.id]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase());
      if (!matches) return false;
      if (artwork.editionMode !== "unique") return true;
      const alreadySold = inventory.movements.some(
        (movement) =>
          movement.artworkId === artwork.id &&
          movementKind(movement.type) === "sale"
      );
      return !alreadySold;
    }),
    "title"
  );

  function reset() {
    setArtworkId("");
    setPrice("");
    setContactId("");
    setDate("");
    setSearch("");
    setAdding(false);
  }

  async function save() {
    if (!artworkId) return;
    try {
      const data = await window.inventoryApi.addExhibitionSale(
        exhibition.id,
        artworkId,
        price,
        contactId,
        date
      );
      setInventory(data);
      reset();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : t("exhibition.sales.error")
      );
    }
  }

  return (
    <div className="form-section">
      <div className="related-head">
        <h3>
          {t("exhibition.sales.title")} ({sales.length})
        </h3>
        <button type="button" className="ghost" onClick={() => setAdding(true)}>
          {t("exhibition.sales.add")}
        </button>
      </div>
      {sales.length === 0 ? (
        <p className="muted small-note">{t("exhibition.sales.empty")}</p>
      ) : (
        <div className="record-list">
          {sales.map((movement) => {
            const artwork = inventory.artworks.find(
              (item) => item.id === movement.artworkId
            );
            return (
              <div className="mini-row" key={movement.id}>
                <span className="cell-strong">{artwork?.title ?? movement.artworkId}</span>
                <span className="muted">
                  {movement.contactName || t("contact.detail.buyerUnknown")}
                </span>
                <span className="muted">{movement.date || t("common.noDate")}</span>
                <span className="cell-strong">
                  {movement.price ? `${movement.price} ${movement.currency ?? ""}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="modal-backdrop" onClick={reset}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>
                {t("exhibition.sales.addTitle", { title: exhibition.title })}
              </h3>
              <button className="icon-button ghost" onClick={reset}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <label className="field">
                {t("library.col.artwork")}
                <input
                  className="search-input"
                  placeholder={t("picker.searchWork")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <select value={artworkId} onChange={(event) => setArtworkId(event.target.value)}>
                  <option value="">{t("exhibition.sales.pickWork")}</option>
                  {candidates.map((artwork) => (
                    <option key={artwork.id} value={artwork.id}>
                      {artwork.title}
                      {artwork.series?.trim()
                        ? ` · ${seriesLabel(artwork.series, t)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label className="field">
                  {t("movement.field.price")}
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </label>
                <label className="field">
                  {t("movement.field.date")}
                  <DateField value={date} onChange={setDate} />
                </label>
              </div>
              <ContactSelect
                inventory={inventory}
                setInventory={setInventory}
                label={t("movement.sale.buyer")}
                kind="person"
                value={contactId}
                onChange={setContactId}
              />
            </div>
            <div className="modal-actions">
              <button type="button" disabled={!artworkId} onClick={save}>
                {t("exhibition.sales.save")}
              </button>
              <button type="button" className="ghost" onClick={reset}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type GroupBy = "none" | "exhibition" | "year";

function yearOf(date?: string): string {
  const match = /^\d{2}-\d{2}-(\d{4})$/.exec(date ?? "");
  return match ? match[1] : "";
}

function GroupControl({
  value,
  onChange
}: {
  value: GroupBy;
  onChange: (value: GroupBy) => void;
}) {
  const t = useT();
  return (
    <div className="segmented small">
      {(
        [
          ["none", t("contact.detail.group.none")],
          ["exhibition", t("contact.detail.group.exhibition")],
          ["year", t("contact.detail.group.year")]
        ] as Array<[GroupBy, string]>
      ).map(([key, label]) => (
        <button
          key={key}
          className={`seg ${value === key ? "active" : ""}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function groupMovements(
  inventory: InventoryData,
  records: Movement[],
  groupBy: GroupBy,
  labels: { noExhibition: string; noDate: string; exhibition: string }
): Array<{ key: string; label: string; items: Movement[] }> {
  if (groupBy === "none") {
    return [{ key: "all", label: "", items: records }];
  }
  const { noExhibition, noDate, exhibition: exhibitionFallback } = labels;

  const groups = new Map<
    string,
    { label: string; sortVal: string; items: Movement[] }
  >();
  for (const movement of records) {
    let key: string;
    let label: string;
    let sortVal: string;
    if (groupBy === "exhibition") {
      if (movement.exhibitionId) {
        key = movement.exhibitionId;
        const title =
          movement.exhibitionTitle ||
          exhibitionTitle(inventory, movement.exhibitionId) ||
          exhibitionFallback;
        const exh = inventory.exhibitions.find((e) => e.id === movement.exhibitionId);
        const yr = yearOf(exh?.startDate) || yearOf(movement.date);
        label = yr ? `${title} · ${yr}` : title;
        sortVal = exh?.startDate ? yearOf(exh.startDate) : yearOf(movement.date);
      } else {
        key = "__none";
        label = noExhibition;
        sortVal = "0000";
      }
    } else {
      const yr = yearOf(movement.date);
      key = yr || "__noyear";
      label = yr || noDate;
      sortVal = yr || "0000";
    }
    if (!groups.has(key)) groups.set(key, { label, sortVal, items: [] });
    groups.get(key)!.items.push(movement);
  }

  return [...groups.entries()]
    .sort((a, b) => b[1].sortVal.localeCompare(a[1].sortVal))
    .map(([key, group]) => ({ key, label: group.label, items: group.items }));
}

function GallerySalesList({
  inventory,
  sales,
  groupBy,
  artworkById,
  onOpenArtwork
}: {
  inventory: InventoryData;
  sales: Movement[];
  groupBy: GroupBy;
  artworkById: Map<string, Artwork>;
  onOpenArtwork: (artworkId: string) => void;
}) {
  const t = useT();
  function saleRow(movement: Movement) {
    const artwork = artworkById.get(movement.artworkId);
    const billed = parseMoney(movement.price);
    const received = parseMoney(movement.received);
    const showContext =
      movement.context === "exhibition" || Boolean(movement.exhibitionId);
    const contextLabel = showContext
      ? movement.exhibitionTitle ||
        exhibitionTitle(inventory, movement.exhibitionId) ||
        t("exhibitions.col.exhibition")
      : movement.context === "gallery"
        ? t("contact.detail.saleViaGallery")
        : "";

    return (
      <button
        key={movement.id}
        type="button"
        className="gallery-sale-row"
        onClick={() => onOpenArtwork(movement.artworkId)}
      >
        <div className="gallery-sale-main">
          <strong>{artwork?.title || t("library.col.artwork")}</strong>
          <span className="gallery-sale-meta">
            {[movement.date, contextLabel].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div className="gallery-sale-money">
          <span>
            <em>{t("contact.detail.billed")}</em>
            {billed != null ? formatMoney(billed) : "—"}
          </span>
          <span>
            <em>{t("contact.detail.received")}</em>
            {received != null ? formatMoney(received) : "—"}
          </span>
        </div>
      </button>
    );
  }

  const ordered = groupMovements(inventory, sales, groupBy, {
    noExhibition: t("contact.detail.noExhibition"),
    noDate: t("common.noDate"),
    exhibition: t("nav.exhibitions")
  });
  if (groupBy === "none") {
    return <div className="gallery-sales-list">{sales.map(saleRow)}</div>;
  }

  return (
    <div className="record-groups">
      {ordered.map((group) => {
        const billed = group.items.reduce(
          (sum, m) => sum + (parseMoney(m.price) ?? 0),
          0
        );
        const received = group.items.reduce(
          (sum, m) => sum + (parseMoney(m.received) ?? 0),
          0
        );
        return (
          <div className="record-group" key={group.key}>
            <div className="record-group-head gallery-sale-group-head">
              <span>
                {group.label}
                <span className="count-pill subtle">{group.items.length}</span>
              </span>
              <span className="gallery-sale-group-totals">
                {formatMoney(billed)}
                <span className="muted"> / </span>
                {formatMoney(received)}
              </span>
            </div>
            <div className="gallery-sales-list">{group.items.map(saleRow)}</div>
          </div>
        );
      })}
    </div>
  );
}

function parseExhibitionArtworkIds(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function ContactDetail({
  contact,
  inventory,
  setInventory,
  onBack,
  onOpenArtwork,
  onOpenExhibition,
  onOpenContact,
  onDeleted
}: {
  contact: Contact;
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onBack: () => void;
  onOpenArtwork: (artworkId: string) => void;
  onOpenExhibition: (exhibitionId: string) => void;
  onOpenContact?: (contactId: string) => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const institution = isInstitution(contact.kind);
  const isGallery = contact.kind === "gallery";

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [salesGroup, setSalesGroup] = useState<GroupBy>("exhibition");
  const [exhibitionFilter, setExhibitionFilter] = useState("");
  const [showPeople, setShowPeople] = useState(false);
  const [showExhibitions, setShowExhibitions] = useState(false);
  const [showExhibited, setShowExhibited] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [linkingPerson, setLinkingPerson] = useState(false);

  const galerista = contact.galleristContactId
    ? inventory.contacts.find((item) => item.id === contact.galleristContactId)
    : undefined;
  const linkedPeople = inventory.contacts.filter(
    (item) => item.kind === "person" && item.organizationId === contact.id
  );

  const exhibitions = [...inventory.exhibitions]
    .filter((item) => item.galleryContactId === contact.id)
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  const exhibitionIds = new Set(exhibitions.map((item) => item.id));
  const filteredExhibitions = exhibitionFilter
    ? exhibitions.filter((item) => item.id === exhibitionFilter)
    : exhibitions;
  const filteredExhibitionIds = new Set(filteredExhibitions.map((item) => item.id));

  const allGalleryMovements = inventory.movements.filter(
    (movement) =>
      movement.contactId === contact.id ||
      (movement.exhibitionId && exhibitionIds.has(movement.exhibitionId))
  );

  const sales = sortMovementsDesc(
    allGalleryMovements.filter((movement) => {
      if (movementKind(movement.type) !== "sale") return false;
      if (!exhibitionFilter) return true;
      return movement.exhibitionId === exhibitionFilter;
    })
  );

  const galleryPayments = sortMovementsDesc(
    inventory.movements.filter(
      (movement) =>
        movementKind(movement.type) === "payment" &&
        movement.contactId === contact.id
    )
  );

  const artworkById = new Map(inventory.artworks.map((art) => [art.id, art]));
  const settings: AppSettings = {
    sizeTypes: inventory.settings?.sizeTypes ?? [],
    taxRates: inventory.settings?.taxRates ?? []
  };

  // One entry per exhibition appearance — same painting can appear multiple times.
  const exhibitedAppearances = sortMovementsDesc(
    allGalleryMovements.filter(
      (movement) =>
        movementKind(movement.type) === "exhibition" &&
        movement.exhibitionId &&
        filteredExhibitionIds.has(movement.exhibitionId)
    )
  );

  const soldArtworkIds = new Set(sales.map((movement) => movement.artworkId));
  const billedTotal = sales.reduce(
    (sum, movement) => sum + (parseMoney(movement.price) ?? 0),
    0
  );
  const receivedTotal = sales.reduce(
    (sum, movement) => sum + saleIncomeAmount(movement),
    0
  );

  const placeLabel = [contact.city, contact.country || contact.location]
    .filter(Boolean)
    .join(", ");
  const contactLine = [contact.phone, contact.email].filter(Boolean).join(" · ");

  async function remove() {
    const data = await window.inventoryApi.deleteContact(contact.id);
    setInventory(data);
    onDeleted();
  }

  return (
    <section className="detail-layout single contact-detail-page">
      <div className="detail-panel">
        <div className="detail-header">
          <div>
            <p className="eyebrow">{contactKindLabel(contact.kind, t)}</p>
            <h2>{contact.name}</h2>
          </div>
          <div className="form-head-actions">
            <button onClick={() => setEditing(true)}>{t("common.edit")}</button>
            <button className="ghost" onClick={onBack}>
              {t("common.back")}
            </button>
          </div>
        </div>

        <div className="related-block contact-details-block">
          <h3>{t("contact.detail.data")}</h3>
          <dl className="metadata compact-metadata">
            <dt>{t("contacts.col.place")}</dt>
            <dd>{placeLabel || "—"}</dd>
            {contact.relationship && (
              <>
                <dt>{t("contacts.col.relation")}</dt>
                <dd>{contact.relationship}</dd>
              </>
            )}
            {contact.job && (
              <>
                <dt>{t("contact.form.profession")}</dt>
                <dd>{contact.job}</dd>
              </>
            )}
            <dt>{t("contacts.col.contact")}</dt>
            <dd>{contactLine || "—"}</dd>
            {contact.website && (
              <>
                <dt>{t("contact.detail.web")}</dt>
                <dd>{contact.website}</dd>
              </>
            )}
            {contact.firstContactYear && (
              <>
                <dt>{t("contact.detail.firstContact")}</dt>
                <dd>{contact.firstContactYear}</dd>
              </>
            )}
            {institution && galerista && (
              <>
                <dt>{t("contact.detail.gallerist")}</dt>
                <dd>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onOpenContact?.(galerista.id)}
                  >
                    {galerista.name}
                  </button>
                </dd>
              </>
            )}
            {!institution && contact.organizationId && (
              <>
                <dt>{t("contact.detail.linkedTo")}</dt>
                <dd>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onOpenContact?.(contact.organizationId!)}
                  >
                    {contactName(inventory, contact.organizationId)}
                  </button>
                </dd>
              </>
            )}
            {contact.comments && (
              <>
                <dt>{t("contact.form.comments")}</dt>
                <dd className="notes-display">{contact.comments}</dd>
              </>
            )}
          </dl>
        </div>

        {institution && (
          <>
            <div className={`contact-stats${isGallery ? " contact-stats-gallery" : ""}`}>
              <div className="contact-stat">
                <span>{t("contact.detail.stat.exhibitions")}</span>
                <strong>{filteredExhibitions.length}</strong>
              </div>
              <div className="contact-stat">
                <span>{t("contact.detail.stat.shown")}</span>
                <strong>{exhibitedAppearances.length}</strong>
              </div>
              {isGallery && (
                <>
                  <div className="contact-stat">
                    <span>{t("contact.detail.stat.soldVia")}</span>
                    <strong>{soldArtworkIds.size}</strong>
                  </div>
                  <div className="contact-stat money">
                    <span>{t("contact.detail.stat.billed")}</span>
                    <strong>{formatMoney(billedTotal)}</strong>
                    <small>{t("contact.detail.totalSales")}</small>
                  </div>
                  <div className="contact-stat money received">
                    <span>{t("contact.detail.stat.received")}</span>
                    <strong>{formatMoney(receivedTotal)}</strong>
                    <small>{t("contact.detail.afterCommission")}</small>
                  </div>
                </>
              )}
            </div>

            {exhibitions.length > 0 && (
              <label className="contact-exh-filter">
                {t("contact.detail.viewByExhibition")}
                <select
                  value={exhibitionFilter}
                  onChange={(event) => setExhibitionFilter(event.target.value)}
                >
                  <option value="">{t("contact.detail.allExhibitions")}</option>
                  {exhibitions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                      {item.startDate ? ` · ${yearOf(item.startDate) || item.startDate}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {institution && (
          <div className="related-block">
            <div className="related-head">
              <button
                type="button"
                className="collapse-head"
                onClick={() => setShowPeople((value) => !value)}
              >
                <span className="collapse-caret">{showPeople ? "▾" : "▸"}</span>
                <h3>{t("contact.detail.people", { count: linkedPeople.length })}</h3>
              </button>
              <button
                type="button"
                className="ghost small"
                onClick={() => setLinkingPerson(true)}
              >
                {t("contact.detail.addPerson")}
              </button>
            </div>
            {showPeople &&
              (linkedPeople.length === 0 ? (
                <p className="muted small-note">
                  {t("contact.detail.noLinkedPeople", { name: contact.name })}
                </p>
              ) : (
                <div className="mini-table">
                  {linkedPeople.map((person) => (
                    <button
                      className="mini-row clickable"
                      key={person.id}
                      onClick={() => onOpenContact?.(person.id)}
                    >
                      <strong>{person.name}</strong>
                      <span>
                        {[person.job, person.relationship].filter(Boolean).join(" · ") ||
                          t("contact.kind.person")}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
          </div>
        )}

        {institution && (
          <div className="related-block">
            <button
              type="button"
              className="collapse-head"
              onClick={() => setShowExhibitions((value) => !value)}
            >
              <span className="collapse-caret">{showExhibitions ? "▾" : "▸"}</span>
              <h3>
                {t("contact.detail.exhibitionsCount", {
                  count: filteredExhibitions.length
                })}
              </h3>
            </button>
            {showExhibitions &&
              (filteredExhibitions.length === 0 ? (
                <p className="muted">{t("contact.detail.emptyExhibitions")}</p>
              ) : (
                <div className="mini-table exhibition-cards">
                  {filteredExhibitions.map((item) => {
                    const artCount =
                      parseExhibitionArtworkIds(item.artworkIds).length ||
                      allGalleryMovements.filter(
                        (m) =>
                          m.exhibitionId === item.id &&
                          movementKind(m.type) === "exhibition"
                      ).length;
                    const saleCount = allGalleryMovements.filter(
                      (m) =>
                        m.exhibitionId === item.id &&
                        movementKind(m.type) === "sale"
                    ).length;
                    return (
                      <button
                        className="mini-row clickable exhibition-card-row"
                        key={item.id}
                        onClick={() => onOpenExhibition(item.id)}
                      >
                        <strong>{item.title}</strong>
                        <span>
                          {[
                            [item.city, item.country].filter(Boolean).join(", "),
                            item.startDate,
                            artCount
                              ? t("contact.detail.worksCount", { count: artCount })
                              : "",
                            saleCount
                              ? t("contact.detail.salesCount", { count: saleCount })
                              : ""
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        )}

        {institution && (
          <div className="related-block">
            <button
              type="button"
              className="collapse-head"
              onClick={() => setShowExhibited((value) => !value)}
            >
              <span className="collapse-caret">{showExhibited ? "▾" : "▸"}</span>
              <h3>
                {t("contact.detail.shownWorksCount", {
                  count: exhibitedAppearances.length
                })}
              </h3>
            </button>
            {showExhibited &&
              (exhibitedAppearances.length === 0 ? (
                <p className="muted">
                  {exhibitionFilter
                    ? t("contact.detail.emptyShownInExhibition")
                    : t("contact.detail.emptyShown")}
                </p>
              ) : (
                <div className="mini-table">
                  {exhibitedAppearances.map((movement) => {
                    const artwork = artworkById.get(movement.artworkId);
                    const exhTitle =
                      movement.exhibitionTitle ||
                      exhibitionTitle(inventory, movement.exhibitionId) ||
                      t("exhibitions.col.exhibition");
                    const status = movement.returned
                      ? t("contact.detail.status.returned")
                      : movement.keptAtGallery
                        ? t("contact.detail.status.stayed")
                        : t("contact.detail.status.inShow");
                    return (
                      <button
                        className="mini-row clickable"
                        key={movement.id}
                        onClick={() => onOpenArtwork(movement.artworkId)}
                      >
                        <strong>{artwork?.title || t("library.col.artwork")}</strong>
                        <span>
                          {[
                            exhTitle,
                            movement.date,
                            movement.listedPrice ? movement.listedPrice : "",
                            status
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        )}

        {isGallery && (
          <div className="related-block gallery-sales-block">
            <div className="related-head">
              <button
                type="button"
                className="collapse-head"
                onClick={() => setShowSales((value) => !value)}
              >
                <span className="collapse-caret">{showSales ? "▾" : "▸"}</span>
                <h3>
                  {t("contact.detail.salesViaGalleryCount", {
                    count: sales.length
                  })}
                </h3>
              </button>
              {showSales && sales.length > 0 && !exhibitionFilter && (
                <GroupControl value={salesGroup} onChange={setSalesGroup} />
              )}
            </div>
            {showSales &&
              (sales.length === 0 ? (
                <p className="muted">
                  {exhibitionFilter
                    ? t("contact.detail.emptySalesInExhibition")
                    : t("contact.detail.emptySales")}
                </p>
              ) : (
                <GallerySalesList
                  inventory={inventory}
                  sales={sales}
                  groupBy={exhibitionFilter ? "none" : salesGroup}
                  artworkById={artworkById}
                  onOpenArtwork={onOpenArtwork}
                />
              ))}
          </div>
        )}

        {isGallery && (
          <div className="related-block">
            <button
              type="button"
              className="collapse-head"
              onClick={() => setShowPayments((value) => !value)}
            >
              <span className="collapse-caret">{showPayments ? "▾" : "▸"}</span>
              <h3>
                {t("contact.detail.galleryPaymentCount", {
                  count: galleryPayments.length
                })}
              </h3>
            </button>
            {showPayments &&
              (galleryPayments.length === 0 ? (
                <p className="muted small-note">
                  {t("contact.detail.emptyPayments")}
                </p>
              ) : (
                <div className="mini-table">
                  {galleryPayments.map((payment) => {
                    const artwork = artworkById.get(payment.artworkId);
                    const cost = galleryPaymentCost(payment, artwork, settings);
                    return (
                      <button
                        className="mini-row clickable"
                        key={payment.id}
                        onClick={() => onOpenArtwork(payment.artworkId)}
                      >
                        <strong>{artwork?.title || t("library.col.artwork")}</strong>
                        <span>
                          {[
                            payment.date,
                            cost > 0 ? formatMoney(cost) : "",
                            t("contact.detail.givenAsPayment")
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        )}

        <div className="danger-zone">
          <div>
            <strong>
              {t("confirm.contact.title", {
                kind: contactKindLabel(contact.kind, t).toLowerCase()
              })}
            </strong>
            <p className="muted">
              {t("contact.detail.delete.body", { name: contact.name })}
            </p>
          </div>
          <button className="ghost danger" onClick={() => setConfirmDelete(true)}>
            {t("common.deleteEllipsis")}
          </button>
        </div>
      </div>

      {editing && (
        <ContactModal
          kind={contact.kind}
          initial={contact}
          inventory={inventory}
          setInventory={setInventory}
          onClose={() => setEditing(false)}
          onCreated={() => setEditing(false)}
        />
      )}

      {linkingPerson && (
        <ContactModal
          kind="person"
          inventory={inventory}
          initial={{ organizationId: contact.id } as Contact}
          setInventory={setInventory}
          onClose={() => setLinkingPerson(false)}
          onCreated={() => setLinkingPerson(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t("confirm.contact.title", {
            kind: contactKindLabel(contact.kind, t).toLowerCase()
          })}
          message={t("confirm.contact.message", { name: contact.name })}
          confirmLabel={t("common.deleteForever")}
          onConfirm={() => {
            setConfirmDelete(false);
            void remove();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * Exhibitions page
 * ------------------------------------------------------------------------- */

const emptyExhibition: ExhibitionInput = {
  title: "",
  city: "",
  country: "",
  venue: "",
  galleryContactId: "",
  curatorContactId: "",
  startDate: "",
  endDate: "",
  curator: "",
  exhibitionType: "group",
  comments: ""
};

function ExhibitionsPage({
  inventory,
  setInventory,
  onError,
  openId,
  onOpened,
  resetToken,
  guard,
  onGeneratePriceList,
  onDirtyChange,
  onOpenArtwork,
  saveRef
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onError: (message: string) => void;
  openId?: string | null;
  onOpened?: () => void;
  resetToken?: number;
  guard?: (action: () => void) => void;
  onGeneratePriceList: (exhibitionId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onOpenArtwork?: (artworkId: string) => void;
  saveRef?: MutableRefObject<null | (() => Promise<boolean>)>;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [sort, setSort] = useState<"recent" | "title" | "year">("recent");
  const [editing, setEditing] = useState<Exhibition | "new" | null>(null);

  useEffect(() => {
    if (!openId) return;
    const target = inventory.exhibitions.find((item) => item.id === openId);
    if (target) setEditing(target);
    onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  // Close any open exhibition form when the user clicks the tab again (e.g.
  // after choosing "salir sin guardar"). Only react to real changes — running
  // this on mount would clobber an exhibition opened via `openId`.
  const lastResetToken = useRef(resetToken);
  useEffect(() => {
    if (resetToken === lastResetToken.current) return;
    lastResetToken.current = resetToken;
    setEditing(null);
  }, [resetToken]);

  const countries = uniqueValues(inventory.exhibitions.map((item) => item.country)).sort(
    (a, b) => a.localeCompare(b)
  );
  const years = uniqueValues(
    inventory.exhibitions.map((item) => yearOf(item.startDate))
  ).sort((a, b) => b.localeCompare(a));

  const exhibitions = useMemo(() => {
    const filtered = inventory.exhibitions.filter(
      (item) =>
        [item.title, item.city, item.country, item.venue, item.curator, item.galleryName]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (countryFilter === "" || (item.country ?? "") === countryFilter) &&
        (yearFilter === "" || yearOf(item.startDate) === yearFilter)
    );
    return [...filtered].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "year") return year(b.startDate) - year(a.startDate);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [countryFilter, yearFilter, inventory.exhibitions, search, sort]);

  if (editing) {
    return (
      <ExhibitionForm
        inventory={inventory}
        setInventory={setInventory}
        exhibition={editing === "new" ? null : editing}
        onError={onError}
        onDone={() => setEditing(null)}
        onCancel={() => (guard ?? ((action: () => void) => action()))(() => setEditing(null))}
        onGeneratePriceList={onGeneratePriceList}
        onDirtyChange={onDirtyChange}
        onOpenArtwork={onOpenArtwork}
        saveRef={saveRef}
      />
    );
  }

  return (
    <section className="list-page">
      <div className="list-toolbar">
        <input
          className="search-input grow"
          placeholder={t("exhibitions.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {countries.length > 0 && (
          <label className="sort-control">
            {t("exhibitions.filter.country")}
            <select
              value={countryFilter}
              onChange={(event) => setCountryFilter(event.target.value)}
            >
              <option value="">{t("common.all")}</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>
        )}
        {years.length > 0 && (
          <label className="sort-control">
            {t("exhibitions.filter.year")}
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              <option value="">{t("common.all")}</option>
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="sort-control">
          {t("common.sort")}
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as "recent" | "title" | "year")}
          >
            <option value="recent">{t("exhibitions.sort.recent")}</option>
            <option value="title">{t("exhibitions.sort.title")}</option>
            <option value="year">{t("exhibitions.sort.year")}</option>
          </select>
        </label>
        {(search || countryFilter || yearFilter) && (
          <button
            className="ghost"
            onClick={() => {
              setSearch("");
              setCountryFilter("");
              setYearFilter("");
            }}
          >
            {t("common.clear")}
          </button>
        )}
        <span className="count-pill">{exhibitions.length}</span>
        <button onClick={() => setEditing("new")}>{t("exhibitions.add")}</button>
      </div>

      <div className="list-table-wrap">
        <div className="list-table exhibitions">
          <div className="list-row list-row-header">
            <span>{t("exhibitions.col.exhibition")}</span>
            <span>{t("exhibitions.col.place")}</span>
            <span>{t("exhibitions.col.gallery")}</span>
            <span>{t("exhibitions.col.dates")}</span>
            <span>{t("exhibitions.col.works")}</span>
          </div>
          {exhibitions.length === 0 ? (
            <div className="table-empty">{t("exhibitions.empty")}</div>
          ) : (
            exhibitions.map((exhibition) => {
              const linked = inventory.movements.filter(
                (movement) =>
                  movement.exhibitionId === exhibition.id &&
                  movementKind(movement.type) === "exhibition"
              ).length;
              return (
                <button
                  key={exhibition.id}
                  className="list-row clickable"
                  onClick={() => setEditing(exhibition)}
                >
                  <span className="cell-strong">{exhibition.title}</span>
                  <span>
                    {[exhibition.venue, exhibition.city, exhibition.country]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </span>
                  <span>{exhibition.galleryName || "-"}</span>
                  <span>
                    {[exhibition.startDate, exhibition.endDate]
                      .filter(Boolean)
                      .join(" → ") || "-"}
                  </span>
                  <span>{linked || "-"}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function ExhibitionPriceCell({
  value,
  onCommit
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    onCommit(draft.trim());
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    const shown = formatEuro(value);
    return (
      <div className="pick-price-cell">
        <span className={shown ? "pick-price-value" : "pick-price-empty"}>
          {shown || t("common.noPrice")}
        </span>
        <button
          type="button"
          className="pick-price-edit"
          onClick={() => setEditing(true)}
        >
          {shown ? t("common.edit") : t("exhibition.works.setPrice")}
        </button>
      </div>
    );
  }

  return (
    <div className="pick-price-cell editing">
      <div className="pick-price-input">
        <input
          autoFocus
          inputMode="decimal"
          placeholder="0"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") cancel();
          }}
        />
        <span className="pick-price-eur">€</span>
      </div>
      <button type="button" className="pick-price-ok" onClick={commit}>
        {t("common.save")}
      </button>
      <button type="button" className="pick-price-cancel" onClick={cancel}>
        {t("common.cancel")}
      </button>
    </div>
  );
}

function ExhibitionForm({
  inventory,
  setInventory,
  exhibition,
  onError,
  onDone,
  onCancel,
  onGeneratePriceList,
  onDirtyChange,
  onOpenArtwork,
  saveRef
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  exhibition: Exhibition | null;
  onError: (message: string) => void;
  onDone: () => void;
  onCancel?: () => void;
  onGeneratePriceList: (exhibitionId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onOpenArtwork?: (artworkId: string) => void;
  saveRef?: MutableRefObject<null | (() => Promise<boolean>)>;
}) {
  const t = useT();
  const exhibitionMovements = exhibition
    ? inventory.movements.filter(
        (movement) =>
          movement.exhibitionId === exhibition.id &&
          movementKind(movement.type) === "exhibition"
      )
    : [];
  const [form, setForm] = useState<ExhibitionInput>(() => {
    if (!exhibition) return { ...emptyExhibition };
    const { artworkIds: _ids, imagePaths: _paths, ...rest } = exhibition;
    return { ...emptyExhibition, ...rest, artworkIds: [] };
  });
  const [selected, setSelected] = useState<string[]>(
    exhibitionMovements.map((movement) => movement.artworkId)
  );
  const [listed, setListed] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    exhibitionMovements.forEach((movement) => {
      map[movement.artworkId] = movement.listedPrice ?? "";
    });
    return map;
  });
  const [artworkSort, setArtworkSort] = useState<ArtworkSort>("title");
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exhibitionId = form.id || exhibition?.id || "";

  // Keep local price map aligned with painting movements (source of truth).
  useEffect(() => {
    if (!exhibitionId) return;
    const map: Record<string, string> = {};
    inventory.movements.forEach((movement) => {
      if (
        movement.exhibitionId === exhibitionId &&
        movementKind(movement.type) === "exhibition"
      ) {
        map[movement.artworkId] = movement.listedPrice ?? "";
      }
    });
    setListed(map);
  }, [exhibitionId, inventory.movements]);

  useEffect(() => {
    onDirtyChange?.(false);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markDirty() {
    onDirtyChange?.(true);
  }

  function set<K extends keyof ExhibitionInput>(key: K, value: ExhibitionInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    markDirty();
  }

  async function persist(
    listedOverride?: Record<string, string>
  ): Promise<boolean> {
    try {
      const payload = {
        ...form,
        id: form.id || exhibition?.id
      };
      const data = await window.inventoryApi.saveExhibition(
        payload,
        selected,
        listedOverride ?? listed
      );
      setInventory(data);
      const saved =
        data.exhibitions.find((item) => item.id === payload.id) ||
        data.exhibitions.find(
          (item) =>
            item.title.trim().toLowerCase() ===
            (payload.title ?? "").trim().toLowerCase()
        );
      if (saved && !form.id) {
        setForm((current) => ({ ...current, id: saved.id }));
      }
      onError("");
      onDirtyChange?.(false);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error.save"));
      return false;
    }
  }

  async function save() {
    if (await persist()) onDone();
  }

  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => persist();
    return () => {
      if (saveRef) saveRef.current = null;
    };
  });

  async function syncListedPrice(artworkId: string, next: string) {
    const nextListed = { ...listed, [artworkId]: next };
    setListed(nextListed);
    if (!exhibitionId && !(form.title ?? "").trim()) {
      markDirty();
      return;
    }
    const ok = await persist(nextListed);
    if (!ok) markDirty();
  }

  async function remove() {
    if (!exhibition) return;
    const data = await window.inventoryApi.deleteExhibition(exhibition.id);
    setInventory(data);
    onDirtyChange?.(false);
    onDone();
  }

  const selectedArtworks = orderArtworks(
    inventory.artworks.filter((artwork) => selected.includes(artwork.id)),
    artworkSort
  );

  // A piece can only be blocked from an exhibition that happened *after* it was
  // sold. We only block when we actually know both dates and the sale is on or
  // before the exhibition start — otherwise we allow it (a piece sold in 2026
  // can still be added to a 2024 show).
  const exhStartMs = dateToMs(form.startDate);
  const soldBlockedIds = Number.isFinite(exhStartMs)
    ? inventory.artworks
        .filter((artwork) =>
          inventory.movements.some((movement) => {
            if (
              movement.artworkId !== artwork.id ||
              movementKind(movement.type) !== "sale"
            )
              return false;
            const saleMs = dateToMs(movement.date);
            return Number.isFinite(saleMs) && (saleMs as number) <= exhStartMs;
          })
        )
        .map((artwork) => artwork.id)
    : [];

  return (
    <div className="form-card exhibition-form">
      <div className="form-head exhibition-form-head">
        <div>
          <p className="eyebrow">
            {exhibition
              ? t("exhibition.form.titleEdit")
              : t("exhibition.form.titleNew")}
          </p>
          <h2>{form.title.trim() || t("exhibition.form.fallbackTitle")}</h2>
        </div>
        <div className="form-head-actions">
          <button type="button" onClick={save}>
            {t("common.save")}
          </button>
          {exhibition && (
            <button
              type="button"
              className="ghost"
              onClick={() => onGeneratePriceList(exhibition.id)}
            >
              {t("exhibition.form.generateBooklet")}
            </button>
          )}
          <button type="button" className="ghost" onClick={onCancel ?? onDone}>
            {t("common.cancel")}
          </button>
        </div>
      </div>

      {confirmDelete && exhibition && (
        <ConfirmDialog
          title={t("confirm.exhibition.title")}
          message={t("confirm.exhibition.message", { title: exhibition.title })}
          confirmLabel={t("common.deleteForever")}
          onConfirm={() => {
            setConfirmDelete(false);
            void remove();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <div className="form-section exhibition-form-section">
        <div className="form-group">
          <p className="form-group-label">{t("exhibition.section.identity")}</p>
          <label className="field">
            {t("exhibition.field.titleFull")}
            <input
              value={form.title}
              placeholder={t("exhibition.field.titlePlaceholder")}
              onChange={(event) => set("title", event.target.value)}
            />
          </label>
          <div className="form-row">
            <label className="field">
              {t("exhibition.field.venue")}
              <input
                value={form.venue ?? ""}
                placeholder={t("exhibition.field.venuePlaceholder")}
                onChange={(event) => set("venue", event.target.value)}
              />
            </label>
            <LookupSelect
              inventory={inventory}
              setInventory={setInventory}
              category="exhibitionType"
              label={t("exhibition.field.type")}
              value={form.exhibitionType ?? "group"}
              onChange={(value) => set("exhibitionType", value)}
            />
          </div>
        </div>

        <div className="form-group">
          <p className="form-group-label">{t("exhibition.section.location")}</p>
          <div className="form-row">
            <label className="field">
              {t("exhibition.field.city")}
              <input
                value={form.city ?? ""}
                onChange={(event) => set("city", event.target.value)}
              />
            </label>
            <label className="field">
              {t("exhibition.field.country")}
              <input
                value={form.country ?? ""}
                onChange={(event) => set("country", event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="form-group">
          <p className="form-group-label">{t("exhibition.section.dates")}</p>
          <div className="form-row">
            <label className="field">
              {t("exhibition.field.from")}
              <DateField
                value={form.startDate ?? ""}
                onChange={(value) => set("startDate", value)}
              />
            </label>
            <label className="field">
              {t("exhibition.field.until")}
              <DateField
                value={form.endDate ?? ""}
                onChange={(value) => set("endDate", value)}
              />
            </label>
          </div>
        </div>

        <div className="form-group">
          <p className="form-group-label">{t("exhibition.section.contacts")}</p>
          <div className="form-row">
            <ContactSelect
              inventory={inventory}
              setInventory={setInventory}
              label={t("exhibition.field.curator")}
              kind="person"
              value={form.curatorContactId ?? ""}
              onChange={(value) => set("curatorContactId", value)}
            />
            <ContactSelect
              inventory={inventory}
              setInventory={setInventory}
              label={t("exhibition.field.organizingGallery")}
              kind="gallery"
              value={form.galleryContactId ?? ""}
              onChange={(value) => set("galleryContactId", value)}
            />
          </div>
        </div>

        <div className="form-group">
          <p className="form-group-label">{t("exhibition.section.comments")}</p>
          <label className="field">
            <span className="sr-only">{t("exhibition.section.comments")}</span>
            <textarea
              className="notes-area"
              placeholder={t("exhibition.field.notesPlaceholder")}
              value={form.comments ?? ""}
              onChange={(event) => set("comments", event.target.value)}
            />
          </label>
        </div>

        <div className="form-group exhibition-artworks-group">
          <p className="form-group-label">{t("exhibition.section.works")}</p>
          <div className="artwork-picker">
            <div className="artwork-picker-head">
              <h3>{t("exhibition.works.inShow", { count: selected.length })}</h3>
              <label className="sort-control">
                {t("common.sort")}
                <select
                  value={artworkSort}
                  onChange={(event) =>
                    setArtworkSort(event.target.value as ArtworkSort)
                  }
                >
                  <option value="title">{t("exhibitions.sort.title")}</option>
                  <option value="year">{t("exhibitions.sort.year")}</option>
                  <option value="size">{t("pricing.size.modalEdit")}</option>
                </select>
              </label>
              <button type="button" onClick={() => setShowPicker(true)}>
                {t("library.add")}
              </button>
            </div>
            <p className="muted small-note">{t("exhibition.works.hint")}</p>
            <div className="artwork-pick-list">
              {selectedArtworks.length === 0 ? (
                <p className="muted small-note exhibition-empty-artworks">
                  {t("exhibition.works.empty")}
                </p>
              ) : (
                selectedArtworks.map((artwork) => (
                  <div className="pick-row" key={artwork.id}>
                    <button
                      type="button"
                      className="pick-row-main pick-row-open"
                      title={t("exhibition.works.viewArtwork")}
                      onClick={() => onOpenArtwork?.(artwork.id)}
                    >
                      <PickThumb artwork={artwork} inventory={inventory} />
                      <span className="pick-title">{artwork.title}</span>
                      <span className="muted">
                        {artwork.series?.trim()
                          ? `${seriesLabel(artwork.series, t)} · `
                          : ""}
                        {formatSize(artwork) || artwork.id}
                      </span>
                    </button>
                    <ExhibitionPriceCell
                      value={listed[artwork.id] ?? ""}
                      onCommit={(next) => {
                        void syncListedPrice(artwork.id, next);
                      }}
                    />
                    <button
                      type="button"
                      className="link-button remove-link"
                      onClick={() => {
                        markDirty();
                        setSelected((current) =>
                          current.filter((item) => item !== artwork.id)
                        );
                      }}
                    >
                      {t("common.remove")}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {exhibition && (
          <div className="form-group">
            <p className="form-group-label">{t("exhibition.section.sales")}</p>
            <ExhibitionSalesSection
              inventory={inventory}
              setInventory={setInventory}
              exhibition={exhibition}
            />
          </div>
        )}

        <div className="form-group">
          <p className="form-group-label">{t("exhibition.section.documents")}</p>
          {exhibition ? (
            <ExhibitionDocuments
              inventory={inventory}
              setInventory={setInventory}
              exhibitionId={exhibition.id}
            />
          ) : (
            <p className="muted small-note">{t("exhibition.docs.saveFirst")}</p>
          )}
        </div>

        {showPicker && (
          <ArtworkPickerModal
            inventory={inventory}
            excludeIds={[...selected, ...soldBlockedIds]}
            notice={t("exhibition.works.soldNotice")}
            title={t("exhibition.works.add")}
            onConfirm={(ids) => {
              markDirty();
              setSelected((current) => [...current, ...ids]);
              setListed((current) => {
                const next = { ...current };
                const settings: AppSettings = {
                  sizeTypes: inventory.settings.sizeTypes ?? [],
                  taxRates: inventory.settings.taxRates ?? [],
                  fixedTypePrices: inventory.settings.fixedTypePrices ?? []
                };
                for (const id of ids) {
                  if (next[id]) continue;
                  const art = inventory.artworks.find((a) => a.id === id);
                  if (!art) continue;
                  const price = basePriceAt(art, settings, Date.now());
                  if (price != null) next[id] = String(Math.round(price));
                }
                return next;
              });
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}

        {error && <div className="error-banner">{error}</div>}

        <div className="form-actions exhibition-form-actions">
          <button type="button" onClick={save}>
            {t("common.save")}
          </button>
          <button type="button" className="ghost" onClick={onDone}>
            {t("common.cancel")}
          </button>
        </div>

        {exhibition && (
          <div className="danger-zone">
            <div>
              <strong>{t("exhibition.delete.title")}</strong>
              <p className="muted">
                {t("exhibition.delete.body", { title: exhibition.title })}
              </p>
            </div>
            <button
              type="button"
              className="ghost danger"
              onClick={() => setConfirmDelete(true)}
            >
              {t("exhibition.delete.button")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExhibitionModal({
  setInventory,
  onClose,
  onCreated
}: {
  setInventory: (data: InventoryData) => void;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<ExhibitionInput>({ ...emptyExhibition });
  const [error, setError] = useState("");

  function set<K extends keyof ExhibitionInput>(key: K, value: ExhibitionInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    try {
      const data = await window.inventoryApi.saveExhibition(form, []);
      const created = [...data.exhibitions]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .find((item) => item.title.toLowerCase() === (form.title ?? "").trim().toLowerCase());
      setInventory(data);
      if (created) onCreated(created.id);
      else onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("common.error.save"));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("exhibition.modal.title")}</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <label className="field">
            {t("exhibition.field.title")}
            <input value={form.title} onChange={(event) => set("title", event.target.value)} />
          </label>
          <div className="form-row">
            <label className="field">
              {t("exhibition.field.venue")}
              <input
                value={form.venue ?? ""}
                onChange={(event) => set("venue", event.target.value)}
              />
            </label>
            <label className="field">
              {t("exhibition.field.city")}
              <input value={form.city ?? ""} onChange={(event) => set("city", event.target.value)} />
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              {t("exhibition.field.from")}
              <DateField value={form.startDate ?? ""} onChange={(value) => set("startDate", value)} />
            </label>
            <label className="field">
              {t("exhibition.field.until")}
              <DateField value={form.endDate ?? ""} onChange={(value) => set("endDate", value)} />
            </label>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button onClick={save}>{t("common.save")}</button>
          <button className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const phrase = t("confirm.phrase");
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState("");
  const ready = checked && typed.trim() === phrase;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal confirm-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
        </div>
        <p className="confirm-message">{message}</p>
        <label className="checkline strong">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          {t("confirm.checkbox")}
        </label>
        <label className="field">
          {t("confirm.typePrompt")} <strong>{phrase}</strong>
          <input
            value={typed}
            placeholder={phrase}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="danger-solid" disabled={!ready} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function MovementDetailModal({
  movement,
  inventory,
  onClose
}: {
  movement: Movement;
  inventory: InventoryData;
  onClose: () => void;
}) {
  const { lang, t } = useLanguage();
  const kind = movementKind(movement.type);
  const rows: Array<[string, string]> = [
    [
      t("movement.detail.type"),
      labelFor(inventory, "movementType", movement.type, lang)
    ],
    [t("movement.detail.date"), movement.date || t("common.noDate")]
  ];
  if (movement.editionLabel)
    rows.push([t("movement.detail.copy"), movement.editionLabel]);
  if (kind === "exhibition") {
    rows.push([
      t("movement.detail.exhibition"),
      movement.exhibitionTitle || exhibitionTitle(inventory, movement.exhibitionId) || "-"
    ]);
    rows.push([
      t("movement.detail.result"),
      movement.returned
        ? t("movement.detail.returned")
        : movement.keptAtGallery
          ? t("movement.detail.withGalleryAfter")
          : t("movement.detail.inExhibition")
    ]);
  } else {
    if (movement.price)
      rows.push([t("movement.detail.price"), formatEuro(movement.price)]);
    if (movement.received)
      rows.push([t("movement.detail.receivedNet"), formatEuro(movement.received)]);
    if (movement.context === "gallery")
      rows.push([t("movement.detail.context"), t("movement.detail.viaGallery")]);
    if (movement.context === "exhibition")
      rows.push([
        t("movement.detail.context"),
        t("movement.detail.atExhibition", {
          title:
            movement.exhibitionTitle ||
            exhibitionTitle(inventory, movement.exhibitionId) ||
            "-"
        })
      ]);
    const who = movement.contactName || contactName(inventory, movement.contactId);
    if (who)
      rows.push([
        kind === "sale" ? t("movement.detail.buyer") : t("movement.detail.contact"),
        who
      ]);
  }
  if (movement.notes) rows.push([t("movement.detail.notes"), movement.notes]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{movementSummary(movement, inventory, t, lang)}</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <dl className="metadata">
          {rows.map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DateField({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={toIsoDate(value)}
      onChange={(event) => onChange(fromIsoDate(event.target.value))}
    />
  );
}

function CheckboxFilter({
  title,
  options,
  selected,
  onChange
}: {
  title: string;
  options: LookupOption[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  if (options.length === 0) return null;
  return (
    <details className="filter-group" open>
      <summary>
        {title}
        {selected.length > 0 ? ` (${selected.length})` : ""}
      </summary>
      <div className="filter-options">
        {options.map((option) => (
          <label className="checkline" key={option.value}>
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value)
                )
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    </details>
  );
}

type Range = [number, number] | null;

function RangeFilter({
  title,
  bounds,
  value,
  onChange,
  format
}: {
  title: string;
  bounds: [number, number] | null;
  value: Range;
  onChange: (value: Range) => void;
  format: (value: number) => string;
}) {
  const t = useT();
  if (!bounds || bounds[0] >= bounds[1]) return null;
  const [min, max] = bounds;
  const lo = value ? value[0] : min;
  const hi = value ? value[1] : max;
  const step = max - min > 50 ? 1 : 0.5;
  const span = max - min || 1;
  const leftPct = ((lo - min) / span) * 100;
  const rightPct = ((hi - min) / span) * 100;

  return (
    <details className="filter-group" open={Boolean(value)}>
      <summary>{title}</summary>
      <div className="range">
        <div className="dual-range">
          <div className="dual-track" />
          <div
            className="dual-fill"
            style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={lo}
            onChange={(event) =>
              onChange([Math.min(Number(event.target.value), hi), hi])
            }
          />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={hi}
            onChange={(event) =>
              onChange([lo, Math.max(Number(event.target.value), lo)])
            }
          />
        </div>
        <div className="range-values">
          <span>{format(lo)}</span>
          <span>{format(hi)}</span>
        </div>
        {value && (
          <button type="button" className="link-button" onClick={() => onChange(null)}>
            {t("common.reset")}
          </button>
        )}
      </div>
    </details>
  );
}

/* ----------------------------------------------------------------------------
 * Price list generator
 * ------------------------------------------------------------------------- */

function toCm(value?: string, unit?: string): number | undefined {
  const num = parseFloat((value ?? "").replace(",", "."));
  if (!Number.isFinite(num)) return undefined;
  return unit === "in" ? num * 2.54 : num;
}

function formatSize(artwork: Artwork): string {
  const dims = [artwork.height, artwork.width, artwork.depth].filter(
    (value) => value && value.trim()
  );
  if (dims.length === 0) return "";
  return `${dims.join(" × ")} ${artwork.unit}`;
}

function toSlashDate(value?: string): string {
  if (!value) return "";
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value;
}

/* ----------------------------------------------------------------------------
 * Pricing: factors, tax and price history
 * ------------------------------------------------------------------------- */

function sizeSumCm(artwork: Artwork): number {
  const h = toCm(artwork.height, artwork.unit) ?? 0;
  const w = toCm(artwork.width, artwork.unit) ?? 0;
  return h + w;
}

// Effective date of a factor/tax period as a timestamp. An empty date means
// "from the beginning of time".
function periodMs(from?: string): number {
  if (!from || !from.trim()) return -Infinity;
  const ms = dateToMs(from);
  return Number.isFinite(ms) ? (ms as number) : -Infinity;
}

// Fractional year (year + month share) so mid-year changes plot at the right
// spot on the time axis.
function fractionalYear(from?: string): number | null {
  if (!from) return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(from.trim());
  if (match) return Number(match[3]) + (Number(match[2]) - 1) / 12;
  const y = Number(String(from).replace(/[^0-9]/g, "").slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

// The size band whose [fromSum, toSum] range covers the size (toSum 0 = no cap).
function sizeTypeForSum(types: SizeType[], sizeSum: number): SizeType | null {
  const covering = types.filter(
    (t) =>
      sizeSum >= (Number(t.fromSum) || 0) &&
      (!t.toSum || sizeSum <= Number(t.toSum))
  );
  if (covering.length === 0) return null;
  covering.sort((a, b) => (a.toSum || Infinity) - (b.toSum || Infinity));
  return covering[0];
}

// The factor that applies to a size type at a given moment (latest period whose
// effective date is on or before that moment; falls back to the earliest one).
function factorAt(type: SizeType, dateMs: number): number | null {
  const periods = type.factors.filter((p) => p.factor > 0);
  if (periods.length === 0) return null;
  const sorted = [...periods].sort((a, b) => periodMs(a.from) - periodMs(b.from));
  let chosen = sorted[0];
  for (const p of sorted) {
    if (periodMs(p.from) <= dateMs) chosen = p;
  }
  return chosen.factor;
}

function factorForDate(
  settings: AppSettings,
  sizeSum: number,
  dateMs: number
): number | null {
  const type = sizeTypeForSum(settings.sizeTypes, sizeSum);
  if (!type) return null;
  return factorAt(type, dateMs);
}

function fixedPriceEntry(
  settings: AppSettings,
  typeValue?: string
): FixedTypePrice | null {
  const key = (typeValue ?? "").trim();
  if (!key) return null;
  const fromSettings = (settings.fixedTypePrices ?? []).find(
    (item) => item.typeValue === key
  );
  if (fromSettings && fromSettings.prices.some((p) => p.price > 0)) {
    return fromSettings;
  }
  const builtin = DEFAULT_FIXED_TYPE_PRICES.find((item) => item.typeValue === key);
  return builtin ?? null;
}

/** Flat technique price effective on a given date (latest period on or before). */
function fixedPriceAt(entry: FixedTypePrice, dateMs: number): number | null {
  const periods = entry.prices.filter((p) => p.price > 0);
  if (periods.length === 0) return null;
  const sorted = [...periods].sort((a, b) => periodMs(a.from) - periodMs(b.from));
  let chosen = sorted[0];
  for (const p of sorted) {
    if (periodMs(p.from) <= dateMs) chosen = p;
  }
  return chosen.price;
}

function fixedPriceForType(
  settings: AppSettings,
  typeValue?: string,
  dateMs: number = Date.now()
): number | null {
  const entry = fixedPriceEntry(settings, typeValue);
  if (!entry) return null;
  return fixedPriceAt(entry, dateMs);
}

function fixedPriceChangeYears(entry: FixedTypePrice | null): number[] {
  if (!entry) return [];
  const ys = entry.prices
    .map((p) => fractionalYear(p.from))
    .filter((y): y is number => y != null)
    .map((y) => Math.floor(y));
  return [...new Set(ys)].sort((a, b) => a - b);
}

function currentFixedPrice(entry: FixedTypePrice): number | null {
  return fixedPriceAt(entry, Date.now());
}

function basePriceAt(
  artwork: Artwork,
  settings: AppSettings,
  dateMs: number
): number | null {
  const fixed = fixedPriceForType(settings, artwork.type, dateMs);
  if (fixed != null) return fixed;
  const factor = factorForDate(settings, sizeSumCm(artwork), dateMs);
  if (factor == null) return null;
  return sizeSumCm(artwork) * factor;
}

/** Compact formula shown next to brochure price drafts (e.g. 20×20 cm → (20+20)×23 = 920). */
function priceCalcHint(
  artwork: Artwork,
  settings: AppSettings,
  dateMs: number
): string | null {
  const fixed = fixedPriceForType(settings, artwork.type, dateMs);
  if (fixed != null) {
    return `fijo → ${Math.round(fixed)}`;
  }
  const h = toCm(artwork.height, artwork.unit);
  const w = toCm(artwork.width, artwork.unit);
  if (h == null || h <= 0 || w == null || w <= 0) return null;
  const sum = h + w;
  const factor = factorForDate(settings, sum, dateMs);
  if (factor == null) return null;
  const hStr = formatCm(h);
  const wStr = formatCm(w);
  const factorStr =
    Number.isInteger(factor) || Math.abs(factor - Math.round(factor)) < 1e-9
      ? String(Math.round(factor))
      : String(Math.round(factor * 100) / 100);
  const total = Math.round(sum * factor);
  return `${wStr}×${hStr} cm → (${wStr}+${hStr})×${factorStr} = ${total}`;
}

/** Why the «pago a galerista» value could not be calculated. */
type GalleryPaymentGap =
  | { reason: "missingSize" }
  | { reason: "noFactors" }
  | { reason: "noBand"; sizeSum: number }
  | { reason: "noFactor"; label: string };

/** Half of factor × (alto+ancho) for «pago a galerista», with a gap reason. */
function galleryPaymentHalf(
  artwork: Artwork | ArtworkInput,
  settings: AppSettings,
  dateMs: number
): { half: number | null; gap: GalleryPaymentGap | null } {
  const fixed = fixedPriceForType(settings, artwork.type, dateMs);
  if (fixed != null) {
    return { half: Math.round(fixed * 0.5), gap: null };
  }
  const h = toCm(artwork.height, artwork.unit ?? "cm");
  const w = toCm(artwork.width, artwork.unit ?? "cm");
  if (h == null || h <= 0 || w == null || w <= 0) {
    return { half: null, gap: { reason: "missingSize" } };
  }
  const sizeSum = h + w;
  const types = settings.sizeTypes ?? [];
  if (types.length === 0) {
    return { half: null, gap: { reason: "noFactors" } };
  }
  const type = sizeTypeForSum(types, sizeSum);
  if (!type) {
    return { half: null, gap: { reason: "noBand", sizeSum } };
  }
  const factor = factorAt(type, dateMs);
  if (factor == null || factor <= 0) {
    return { half: null, gap: { reason: "noFactor", label: type.label ?? "" } };
  }
  return { half: Math.round(sizeSum * factor * 0.5), gap: null };
}

function galleryPaymentGapMessage(gap: GalleryPaymentGap, t: Translate): string {
  switch (gap.reason) {
    case "missingSize":
      return t("pricing.payment.missingSize");
    case "noFactors":
      return t("pricing.payment.noFactors");
    case "noBand":
      return t("pricing.payment.noBand", { size: Math.round(gap.sizeSum) });
    default:
      return t("pricing.payment.noFactor", {
        name: gap.label || t("pricing.payment.thatSize")
      });
  }
}

function galleryPaymentHalfInfo(
  artwork: Artwork | ArtworkInput,
  settings: AppSettings,
  dateMs: number,
  t: Translate
): { half: number | null; problem: string | null } {
  const { half, gap } = galleryPaymentHalf(artwork, settings, dateMs);
  return { half, problem: gap ? galleryPaymentGapMessage(gap, t) : null };
}

function galleryPaymentHalfValue(
  artwork: Artwork | ArtworkInput,
  settings: AppSettings,
  dateMs: number
): number | null {
  return galleryPaymentHalf(artwork, settings, dateMs).half;
}

/** Cost used in Cuentas: stored price, or half of calculated value if missing. */
function galleryPaymentCost(
  payment: Movement,
  artwork: Artwork | undefined,
  settings: AppSettings
): number {
  const stored = parseMoney(payment.price);
  if (stored != null && stored > 0) return stored;
  if (!artwork) return 0;
  const ms = dateToMs(payment.date);
  const at = Number.isFinite(ms) ? (ms as number) : Date.now();
  return galleryPaymentHalfValue(artwork, settings, at) ?? 0;
}

// Tax rate for a country effective at a given moment (latest period on or before
// that moment; falls back to the earliest one).
function taxRateAt(settings: AppSettings, country: string, dateMs: number): number {
  const forCountry = settings.taxRates.filter((t) => t.country === country);
  if (forCountry.length === 0) return 0;
  const sorted = [...forCountry].sort((a, b) => periodMs(a.from) - periodMs(b.from));
  let chosen = sorted[0];
  for (const t of sorted) {
    if (periodMs(t.from) <= dateMs) chosen = t;
  }
  return chosen.rate;
}

function taxCountries(settings: AppSettings): string[] {
  return uniqueValues(settings.taxRates.map((t) => t.country)).filter((c) => c.trim());
}

// Years at which the size-band factor changes, so the history line steps at the
// right places.
function factorChangeYears(type: SizeType | null): number[] {
  if (!type) return [];
  const ys = type.factors
    .map((p) => fractionalYear(p.from))
    .filter((y): y is number => y != null);
  return uniqueNumbers(ys).sort((a, b) => a - b);
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values));
}

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("es-ES")} €`;
}

function parseMoney(value?: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** What actually lands in the artist's pocket for a sale. */
function saleIncomeAmount(sale: Pick<Movement, "price" | "received">): number {
  return parseMoney(sale.received) ?? parseMoney(sale.price) ?? 0;
}

interface ChartSeries {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
}
interface ChartDot {
  x: number;
  y: number;
  label: string;
  exhibitionId?: string;
  kind?: "exhibition" | "sale";
}

interface ChartMarker {
  x: number;
  label: string;
  exhibitionId?: string;
}

// Pick a readable year step: 1, 2, 5 or 10 depending on how wide the range is.
function yearTickStep(span: number): number {
  if (span <= 8) return 1;
  if (span <= 16) return 2;
  if (span <= 40) return 5;
  return 10;
}

function yearTicks(minX: number, maxX: number): number[] {
  const span = Math.max(1, maxX - minX);
  const step = yearTickStep(span);
  const start = Math.ceil(minX / step) * step;
  const end = Math.floor(maxX / step) * step;
  const ticks: number[] = [];
  for (let y = start; y <= end + 0.001; y += step) ticks.push(Math.round(y));
  // Always try to keep the first/last data years visible if they fell between steps.
  if (ticks.length === 0) {
    ticks.push(Math.round((minX + maxX) / 2));
  }
  return ticks;
}

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const norm = value / base;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * base;
}

function PriceLineChart({
  series,
  dots,
  markers = [],
  xMin,
  xMax,
  onDotClick
}: {
  series: ChartSeries[];
  dots: ChartDot[];
  /** Vertical markers (e.g. exhibition without listed price). */
  markers?: ChartMarker[];
  /** Fixed X-axis start (year). */
  xMin?: number;
  /** Fixed X-axis end (year). */
  xMax?: number;
  onDotClick?: (exhibitionId: string) => void;
}) {
  const t = useT();
  const chartRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    left: number;
    top: number;
    text: string;
  } | null>(null);
  const width = 640;
  const height = 340;
  const pad = { top: 20, right: 20, bottom: 40, left: 64 };

  const allX = [
    ...series.flatMap((s) => s.points.map((p) => p.x)),
    ...dots.map((d) => d.x),
    ...markers.map((m) => m.x)
  ];
  const allY = [
    ...series.flatMap((s) => s.points.map((p) => p.y)),
    ...dots.map((d) => d.y)
  ];
  if (allX.length === 0) {
    return <p className="muted">{t("chart.noData")}</p>;
  }
  let minX = xMin ?? Math.min(...allX);
  let maxX = xMax ?? Math.max(...allX);
  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (xMin == null || xMax == null) {
    const xPad = Math.max(0.4, (maxX - minX) * 0.04);
    minX -= xPad;
    maxX += xPad;
  }

  const rawMaxY = allY.length > 0 ? Math.max(...allY, 0) || 1 : 1;
  const maxY = niceCeil(rawMaxY * 1.12);

  const sx = (x: number) =>
    pad.left + ((x - minX) / (maxX - minX)) * (width - pad.left - pad.right);
  const sy = (y: number) =>
    height - pad.bottom - (y / maxY) * (height - pad.top - pad.bottom);

  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => (maxY / yTickCount) * i);
  const xYears = yearTicks(minX, maxX);

  const exhibitionDots = dots.filter((d) => d.kind !== "sale");
  const saleDots = dots.filter((d) => d.kind === "sale");

  function showTip(event: MouseEvent<Element>, text: string) {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({
      left: event.clientX - rect.left,
      top: event.clientY - rect.top,
      text
    });
  }

  const tipStyle = (): CSSProperties | undefined => {
    if (!hover || !chartRef.current) return undefined;
    const w = chartRef.current.clientWidth;
    const tipW = Math.min(280, w - 16);
    const left = Math.min(Math.max(tipW / 2 + 8, hover.left), w - tipW / 2 - 8);
    const preferAbove = hover.top >= 52;
    return {
      left,
      top: preferAbove ? Math.max(8, hover.top - 12) : hover.top + 28,
      maxWidth: tipW,
      transform: preferAbove ? "translate(-50%, -100%)" : "translate(-50%, 0)"
    };
  };

  return (
    <div className="price-chart" ref={chartRef}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img">
        {yTicks.map((value, i) => {
          const y = sy(value);
          return (
            <g key={i}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="#e7e0d3"
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" className="chart-axis">
                {formatMoney(value)}
              </text>
            </g>
          );
        })}
        {xYears.map((yr) => (
          <text
            key={yr}
            x={sx(yr)}
            y={height - pad.bottom + 20}
            textAnchor="middle"
            className="chart-axis"
          >
            {yr}
          </text>
        ))}
        {markers.map((marker, i) => {
          const x = sx(marker.x);
          return (
            <g key={`mark-${i}`}>
              <line
                x1={x}
                x2={x}
                y1={pad.top}
                y2={height - pad.bottom}
                stroke="#3a7a57"
                strokeWidth={2}
                strokeDasharray="5 4"
                opacity={0.85}
                style={{ cursor: marker.exhibitionId ? "pointer" : "default" }}
                onMouseEnter={(event) =>
                  showTip(
                    event,
                    t("chart.tip.noListedPrice", {
                      label: marker.label,
                      year: marker.x
                    })
                  )
                }
                onMouseLeave={() => setHover(null)}
                onClick={() =>
                  marker.exhibitionId && onDotClick?.(marker.exhibitionId)
                }
              />
            </g>
          );
        })}
        {series.map((s) => (
          <g key={s.label}>
            {s.points.length > 1 && (
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
              />
            )}
            {s.points.map((p, i) => (
              <circle
                key={i}
                cx={sx(p.x)}
                cy={sy(p.y)}
                r={4}
                fill={s.color}
                onMouseEnter={(event) =>
                  showTip(event, `${s.label}: ${formatMoney(p.y)} (${p.x})`)
                }
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </g>
        ))}
        {exhibitionDots.map((d, i) => (
          <circle
            key={`ex-${i}`}
            cx={sx(d.x)}
            cy={sy(d.y)}
            r={6}
            fill="#c0392b"
            stroke="#fff"
            strokeWidth={1.5}
            style={{ cursor: d.exhibitionId ? "pointer" : "default" }}
            onMouseEnter={(event) =>
              showTip(event, `${d.label}: ${formatMoney(d.y)} (${d.x})`)
            }
            onMouseLeave={() => setHover(null)}
            onClick={() => d.exhibitionId && onDotClick?.(d.exhibitionId)}
          />
        ))}
        {saleDots.map((d, i) => {
          const cx = sx(d.x);
          const cy = sy(d.y);
          const r = 9;
          const points = starPoints(cx, cy, r, r * 0.45);
          return (
            <polygon
              key={`sale-${i}`}
              points={points}
              fill="#f4c430"
              stroke="#c9a227"
              strokeWidth={1.2}
              style={{ cursor: "default" }}
              onMouseEnter={(event) =>
                showTip(
                  event,
                  `${t("chart.tip.sale", {
                    amount: formatMoney(d.y),
                    year: d.x
                  })}${d.label ? ` · ${d.label}` : ""}`
                )
              }
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      {hover && (
        <div className="chart-tooltip" style={tipStyle()}>
          {hover.text}
        </div>
      )}
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label} className="legend-item">
            <span className="legend-swatch" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        {exhibitionDots.length > 0 && (
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: "#c0392b" }} />{" "}
            {t("chart.legend.exhibitionPrice")}
          </span>
        )}
        {markers.length > 0 && (
          <span className="legend-item">
            <span className="legend-dash" aria-hidden />{" "}
            {t("chart.legend.exhibitionNoPrice")}
          </span>
        )}
        {saleDots.length > 0 && (
          <span className="legend-item">
            <span className="legend-star" aria-hidden>
              ★
            </span>{" "}
            {t("chart.legend.salePrice")}
          </span>
        )}
      </div>
    </div>
  );
}

function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(" ");
}

function PriceHistoryTab({
  artwork,
  inventory,
  onOpenExhibition
}: {
  artwork: Artwork;
  inventory: InventoryData;
  onOpenExhibition: (exhibitionId: string) => void;
}) {
  const t = useT();
  const settings: AppSettings = {
    sizeTypes: inventory.settings.sizeTypes ?? [],
    taxRates: inventory.settings.taxRates ?? [],
    fixedTypePrices: inventory.settings.fixedTypePrices ?? []
  };
  const taxRates = settings.taxRates;
  const [country, setCountry] = useState(taxCountries(settings)[0] ?? "");
  const [showTax, setShowTax] = useState(false);
  const nowYear = new Date().getFullYear();
  const [yearFrom, setYearFrom] = useState(2010);
  const [yearTo, setYearTo] = useState(nowYear);

  const sizeSum = sizeSumCm(artwork);
  const sizeType = sizeTypeForSum(settings.sizeTypes, sizeSum);
  const fixedEntry = fixedPriceEntry(settings, artwork.type);
  const fixedPrice = fixedEntry ? fixedPriceAt(fixedEntry, Date.now()) : null;
  const nowMs = Date.now();

  const axisFrom = Math.max(1970, Math.min(yearFrom, yearTo));
  const axisTo = Math.min(nowYear, Math.max(yearFrom, yearTo, axisFrom));

  const changeYears =
    fixedEntry != null
      ? fixedPriceChangeYears(fixedEntry)
      : factorChangeYears(sizeType);
  const pointYears = uniqueNumbers([
    axisFrom,
    ...changeYears.filter((y) => y >= axisFrom && y <= axisTo),
    axisTo
  ]).sort((a, b) => a - b);

  const yearToMs = (y: number) => new Date(Math.floor(y), 0, 1).getTime();

  const baseSeries: ChartSeries = {
    label: t("pricing.history.seriesBase"),
    color: "#2f6fed",
    points: pointYears
      .map((y) => {
        const base = basePriceAt(artwork, settings, yearToMs(y));
        return base == null ? null : { x: y, y: base };
      })
      .filter((p): p is { x: number; y: number } => p !== null)
  };
  const taxSeries: ChartSeries = {
    label: t("pricing.history.seriesTax", { country: country || "—" }),
    color: "#b06a14",
    points: baseSeries.points.map((p) => ({
      x: p.x,
      y: p.y * (1 + taxRateAt(settings, country, yearToMs(p.x)) / 100)
    }))
  };

  const exhibitionDots: ChartDot[] = inventory.movements
    .filter((m) => m.artworkId === artwork.id && m.exhibitionId && m.listedPrice)
    .map((m): ChartDot | null => {
      const exhibition = inventory.exhibitions.find((e) => e.id === m.exhibitionId);
      const yr = year(exhibition?.startDate || m.date);
      const value = parseMoney(m.listedPrice);
      if (!yr || value == null) return null;
      if (yr < axisFrom || yr > axisTo) return null;
      return {
        x: yr,
        y: value,
        label: exhibition?.title || t("movement.detail.exhibition"),
        exhibitionId: m.exhibitionId,
        kind: "exhibition"
      };
    })
    .filter((d): d is ChartDot => d !== null);

  const exhibitionMarkers: ChartMarker[] = inventory.movements
    .filter(
      (m) =>
        m.artworkId === artwork.id &&
        m.exhibitionId &&
        movementKind(m.type) === "exhibition" &&
        parseMoney(m.listedPrice) == null
    )
    .map((m): ChartMarker | null => {
      const exhibition = inventory.exhibitions.find((e) => e.id === m.exhibitionId);
      const yr = year(exhibition?.startDate || m.date);
      if (!yr || yr < axisFrom || yr > axisTo) return null;
      return {
        x: yr,
        label: exhibition?.title || t("movement.detail.exhibition"),
        exhibitionId: m.exhibitionId
      };
    })
    .filter((d): d is ChartMarker => d !== null);

  const saleDots: ChartDot[] = inventory.movements
    .filter(
      (m) =>
        m.artworkId === artwork.id && movementKind(m.type) === "sale" && m.price
    )
    .map((m): ChartDot | null => {
      const yr = year(m.date);
      const value = parseMoney(m.price);
      if (!yr || value == null) return null;
      if (yr < axisFrom || yr > axisTo) return null;
      return {
        x: yr,
        y: value,
        label: m.contactName || contactName(inventory, m.contactId) || t("common.sale"),
        kind: "sale"
      };
    })
    .filter((d): d is ChartDot => d !== null);

  const chartDots = [...exhibitionDots, ...saleDots];
  const series = showTax ? [baseSeries, taxSeries] : [baseSeries];
  const hasData =
    baseSeries.points.length > 0 ||
    chartDots.length > 0 ||
    exhibitionMarkers.length > 0;
  const currentYear = String(nowYear);
  const currentBase = basePriceAt(artwork, settings, nowMs);
  const currentTax = taxRateAt(settings, country, nowMs);

  const yearOptions = Array.from(
    { length: nowYear - 1970 + 1 },
    (_, index) => 1970 + index
  );

  return (
    <div className="price-history">
      <div className="ph-summary">
        <div>
          <span className="eyebrow">
            {fixedPrice != null
              ? t("pricing.history.fixedPrice")
              : t("pricing.history.size")}
          </span>
          <strong>
            {fixedPrice != null
              ? formatMoney(fixedPrice)
              : sizeSum > 0
                ? `${Math.round(sizeSum)} cm`
                : t("pricing.history.noSize")}
          </strong>
        </div>
        <div>
          <span className="eyebrow">
            {fixedPrice != null
              ? t("pricing.history.fixedTechnique")
              : t("pricing.history.basePrice", { year: currentYear })}
          </span>
          <strong>{currentBase != null ? formatMoney(currentBase) : "—"}</strong>
        </div>
        <div>
          <span className="eyebrow">
            {t("pricing.history.withTax", {
              country: country || "—",
              rate: currentTax
            })}
          </span>
          <strong>
            {currentBase != null
              ? formatMoney(currentBase * (1 + currentTax / 100))
              : "—"}
          </strong>
        </div>
      </div>

      <div className="ph-controls">
        <label className="sort-control">
          {t("exhibition.field.from")}
          <select
            value={axisFrom}
            onChange={(event) => setYearFrom(Number(event.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={`from-${y}`} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="sort-control">
          {t("exhibition.field.until")}
          <select
            value={axisTo}
            onChange={(event) => setYearTo(Number(event.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={`to-${y}`} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="checkline">
          <input
            type="checkbox"
            checked={showTax}
            onChange={(event) => setShowTax(event.target.checked)}
          />
          {t("pricing.history.showTax")}
        </label>
        <label className="sort-control">
          {t("pricing.history.taxCountry")}
          <select value={country} onChange={(event) => setCountry(event.target.value)}>
            {taxCountries(settings).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {fixedEntry == null && settings.sizeTypes.length === 0 && (
        <p className="muted small-note">{t("pricing.history.noFactors")}</p>
      )}
      {fixedEntry == null &&
        sizeSum > 0 &&
        !sizeType &&
        settings.sizeTypes.length > 0 && (
        <p className="muted small-note">
          {t("pricing.history.noBand", { size: Math.round(sizeSum) })}
        </p>
      )}
      {fixedEntry == null && sizeSum === 0 && (
        <p className="muted small-note">{t("pricing.history.needSize")}</p>
      )}

      {hasData ? (
        <PriceLineChart
          series={series}
          dots={chartDots}
          markers={exhibitionMarkers}
          xMin={axisFrom}
          xMax={axisTo}
          onDotClick={onOpenExhibition}
        />
      ) : (
        <p className="muted">{t("pricing.history.noChartData")}</p>
      )}
    </div>
  );
}

function sizeTypeTitle(type: SizeType, t: Translate): string {
  const from = type.fromSum || 0;
  const range = type.toSum
    ? t("pricing.size.range", { from, to: `${type.toSum} cm` })
    : t("pricing.size.rangeOpen", { from });
  return type.label?.trim() ? `${type.label.trim()} (${range})` : range;
}

function sizeRangeEnd(type: Pick<SizeType, "toSum">): number {
  const to = Number(type.toSum) || 0;
  return to > 0 ? to : Infinity;
}

function sizeRangesOverlap(
  a: Pick<SizeType, "fromSum" | "toSum">,
  b: Pick<SizeType, "fromSum" | "toSum">
): boolean {
  const a0 = Number(a.fromSum) || 0;
  const a1 = sizeRangeEnd(a);
  const b0 = Number(b.fromSum) || 0;
  const b1 = sizeRangeEnd(b);
  return a0 <= b1 && b0 <= a1;
}

function findOverlappingSize(
  candidate: Pick<SizeType, "id" | "fromSum" | "toSum">,
  others: SizeType[]
): SizeType | undefined {
  return others.find(
    (other) => other.id !== candidate.id && sizeRangesOverlap(candidate, other)
  );
}

function sortSizeTypes(types: SizeType[]): SizeType[] {
  return [...types].sort((a, b) => {
    const fromDiff = (a.fromSum || 0) - (b.fromSum || 0);
    if (fromDiff !== 0) return fromDiff;
    return sizeRangeEnd(a) - sizeRangeEnd(b);
  });
}

function currentFactorForType(type: SizeType): number | null {
  return factorAt(type, Date.now());
}

function SizeTypeEditModal({
  type,
  existingTypes,
  onSave,
  onDelete,
  onClose
}: {
  type: SizeType;
  existingTypes: SizeType[];
  onSave: (next: SizeType) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<SizeType>(() => ({
    ...type,
    factors:
      type.factors.length > 0
        ? type.factors
        : [{ id: `f-${Date.now()}`, from: "", factor: 0 }]
  }));
  const [adding, setAdding] = useState(false);
  const [newFactor, setNewFactor] = useState("");
  const [newFrom, setNewFrom] = useState("");
  const [error, setError] = useState("");

  const sorted = [...draft.factors].sort(
    (a, b) => periodMs(a.from) - periodMs(b.from)
  );
  const latestId = sorted.length > 0 ? sorted[sorted.length - 1].id : null;

  function updateFactor(id: string, patch: Partial<FactorPeriod>) {
    setDraft((current) => ({
      ...current,
      factors: current.factors.map((p) => (p.id === id ? { ...p, ...patch } : p))
    }));
  }

  function removeFactor(id: string) {
    setDraft((current) => ({
      ...current,
      factors: current.factors.filter((p) => p.id !== id)
    }));
  }

  function addChange() {
    const factor =
      Number(newFactor.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
    if (!newFrom.trim()) {
      setError(t("pricing.size.error.needDate"));
      return;
    }
    if (factor <= 0) {
      setError(t("pricing.size.error.needFactor"));
      return;
    }
    setDraft((current) => ({
      ...current,
      factors: [
        ...current.factors,
        { id: `f-${Date.now()}-${current.factors.length}`, from: newFrom, factor }
      ]
    }));
    setNewFactor("");
    setNewFrom("");
    setAdding(false);
    setError("");
  }

  function save() {
    if (!draft.label?.trim()) {
      setError(t("pricing.size.error.needName"));
      return;
    }
    const fromSum = Number(draft.fromSum) || 0;
    const toSum = Number(draft.toSum) || 0;
    if (toSum > 0 && toSum < fromSum) {
      setError(t("pricing.size.error.badRange"));
      return;
    }
    const overlap = findOverlappingSize(
      { ...draft, fromSum, toSum },
      existingTypes
    );
    if (overlap) {
      const name = overlap.label?.trim() || t("common.noName");
      const range = `${overlap.fromSum || 0} → ${
        overlap.toSum ? `${overlap.toSum} cm` : "∞"
      }`;
      setError(t("pricing.size.error.overlap", { name, range }));
      return;
    }
    if (draft.factors.length === 0) {
      setError(t("pricing.size.error.needFactorRow"));
      return;
    }
    for (const period of draft.factors) {
      if (!period.from?.trim()) {
        setError(t("pricing.size.error.factorDates"));
        return;
      }
      if (!(period.factor > 0)) {
        setError(t("pricing.size.error.factorPositive"));
        return;
      }
    }
    onSave({ ...draft, fromSum, toSum });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide cuentas-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            {type.id.startsWith("st-new")
              ? t("pricing.size.modalNew")
              : t("pricing.size.modalEdit")}
          </h3>
          <button className="icon-button ghost" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="cuentas-step">
            <p className="cuentas-q">{t("pricing.size.col.name")}</p>
            <div className="choice-row">
              {(
                [
                  "pricing.size.chip.small",
                  "pricing.size.chip.medium",
                  "pricing.size.chip.large"
                ] as const
              ).map((key) => {
                const name = t(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`choice-chip${draft.label === name ? " active" : ""}`}
                    onClick={() => setDraft((c) => ({ ...c, label: name }))}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <label className="mt-soft">
              {t("pricing.size.otherName")}
              <input
                value={draft.label ?? ""}
                placeholder={t("pricing.size.namePlaceholder")}
                onChange={(event) =>
                  setDraft((c) => ({ ...c, label: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="cuentas-step">
            <p className="cuentas-q">{t("pricing.size.rangeTitle")}</p>
            <div className="size-range-big">
              <label>
                {t("exhibition.field.from")}
                <input
                  inputMode="numeric"
                  value={draft.fromSum || ""}
                  placeholder="0"
                  onChange={(event) =>
                    setDraft((c) => ({
                      ...c,
                      fromSum: Number(event.target.value.replace(/[^0-9]/g, "")) || 0
                    }))
                  }
                />
              </label>
              <span className="size-range-sep">→</span>
              <label>
                {t("exhibition.field.until")}
                <input
                  inputMode="numeric"
                  value={draft.toSum || ""}
                  placeholder="100"
                  onChange={(event) =>
                    setDraft((c) => ({
                      ...c,
                      toSum: Number(event.target.value.replace(/[^0-9]/g, "")) || 0
                    }))
                  }
                />
              </label>
            </div>
          </div>

          <div className="cuentas-step">
            <p className="cuentas-q">{t("pricing.size.factorsTitle")}</p>
            <p className="muted small-note">{t("pricing.size.factorsHint")}</p>
            <div className="factor-card-list">
              {sorted.map((period) => {
                const isLatest = period.id === latestId;
                return (
                  <div
                    className={`factor-card${isLatest ? " is-latest" : ""}`}
                    key={period.id}
                  >
                    <div className="factor-card-main">
                      {isLatest && <span className="factor-card-badge">{t("pricing.tax.usedNow")}</span>}
                      <label>
                        {t("pricing.period.fromDate")}
                        <DateField
                          value={period.from ?? ""}
                          onChange={(value) => updateFactor(period.id, { from: value })}
                        />
                      </label>
                      <label>
                        {t("pricing.size.col.factor")}
                        <input
                          inputMode="decimal"
                          value={period.factor || ""}
                          onChange={(event) =>
                            updateFactor(period.id, {
                              factor:
                                Number(
                                  event.target.value
                                    .replace(/[^0-9.,]/g, "")
                                    .replace(",", ".")
                                ) || 0
                            })
                          }
                        />
                      </label>
                    </div>
                    {sorted.length > 1 && (
                      <button
                        type="button"
                        className="factor-card-remove"
                        onClick={() => removeFactor(period.id)}
                        title={t("common.remove")}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {!adding ? (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setAdding(true);
                  setError("");
                }}
              >
                {t("pricing.size.addChange")}
              </button>
            ) : (
              <div className="factor-add-box">
                <p className="cuentas-q">{t("pricing.size.newFactor")}</p>
                <div className="form-grid two">
                  <label>
                    {t("pricing.period.fromWhen")}
                    <DateField value={newFrom} onChange={setNewFrom} />
                  </label>
                  <label>
                    {t("pricing.size.whichFactor")}
                    <input
                      inputMode="decimal"
                      value={newFactor}
                      placeholder={t("pricing.size.factorPlaceholder")}
                      onChange={(event) => setNewFactor(event.target.value)}
                    />
                  </label>
                </div>
                <div className="choice-row">
                  <button type="button" onClick={addChange}>
                    {t("common.add")}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setAdding(false);
                      setError("");
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && <div className="error-banner">{error}</div>}
        </div>
        <div className="modal-actions">
          {onDelete && (
            <button type="button" className="ghost danger" onClick={onDelete}>
              {t("pricing.size.delete")}
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" onClick={save}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

type TaxCountryDraft = {
  /** Country name when the editor was opened ("" for a new country). */
  originalCountry: string;
  country: string;
  rates: TaxRate[];
};

function dayBeforeLabel(date?: string): string {
  if (!date?.trim()) return "";
  const ms = dateToMs(date);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms as number);
  d.setDate(d.getDate() - 1);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function currentTaxRateForCountry(rates: TaxRate[]): number | null {
  if (rates.length === 0) return null;
  const sorted = [...rates].sort((a, b) => periodMs(a.from) - periodMs(b.from));
  let chosen = sorted[0];
  const now = Date.now();
  for (const tax of sorted) {
    if (periodMs(tax.from) <= now) chosen = tax;
  }
  return chosen.rate;
}

function TaxCountryEditModal({
  draft,
  existingCountries,
  onSave,
  onDelete,
  onClose
}: {
  draft: TaxCountryDraft;
  existingCountries: string[];
  onSave: (next: TaxCountryDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [country, setCountry] = useState(draft.country);
  const [rates, setRates] = useState<TaxRate[]>(() =>
    draft.rates.length > 0
      ? draft.rates
      : [{ id: `tax-${Date.now()}`, country: draft.country, rate: 0, from: "" }]
  );
  const [adding, setAdding] = useState(false);
  const [newRate, setNewRate] = useState("");
  const [newFrom, setNewFrom] = useState("");
  const [error, setError] = useState("");

  const sorted = [...rates].sort((a, b) => periodMs(a.from) - periodMs(b.from));
  const latestId = sorted.length > 0 ? sorted[sorted.length - 1].id : null;

  function updateRate(id: string, patch: Partial<TaxRate>) {
    setRates((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeRate(id: string) {
    setRates((list) => list.filter((t) => t.id !== id));
  }

  function addChange() {
    const rate =
      Number(newRate.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
    if (!newFrom.trim()) {
      setError(t("pricing.tax.error.needDate"));
      return;
    }
    if (rate < 0) {
      setError(t("pricing.tax.error.negative"));
      return;
    }
    setRates((list) => [
      ...list,
      {
        id: `tax-${Date.now()}-${list.length}`,
        country: country.trim(),
        rate,
        from: newFrom
      }
    ]);
    setNewRate("");
    setNewFrom("");
    setAdding(false);
    setError("");
  }

  function save() {
    const name = country.trim();
    if (!name) {
      setError(t("pricing.tax.error.needCountry"));
      return;
    }
    const clash = existingCountries.some(
      (c) =>
        c.trim().toLowerCase() === name.toLowerCase() &&
        c.trim().toLowerCase() !== draft.originalCountry.trim().toLowerCase()
    );
    if (clash) {
      setError(t("pricing.tax.error.duplicate"));
      return;
    }
    if (rates.length === 0) {
      setError(t("pricing.tax.error.needRate"));
      return;
    }
    for (const period of rates) {
      if (period.rate < 0 || !Number.isFinite(period.rate)) {
        setError(t("pricing.tax.error.rateNumber"));
        return;
      }
    }
    const withDates = rates.filter((p) => p.from?.trim());
    const withoutDates = rates.filter((p) => !p.from?.trim());
    if (withoutDates.length > 1) {
      setError(t("pricing.tax.error.oneWithoutDate"));
      return;
    }
    const fromKeys = new Set(withDates.map((p) => p.from!.trim()));
    if (fromKeys.size !== withDates.length) {
      setError(t("pricing.tax.error.duplicateDate"));
      return;
    }
    onSave({
      originalCountry: draft.originalCountry,
      country: name,
      rates: rates.map((r) => ({ ...r, country: name }))
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide cuentas-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            {draft.originalCountry
              ? t("pricing.tax.modalEdit")
              : t("pricing.tax.modalNew")}
          </h3>
          <button className="icon-button ghost" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="cuentas-step">
            <p className="cuentas-q">{t("exhibition.field.country")}</p>
            <input
              autoFocus={!draft.originalCountry}
              value={country}
              placeholder={t("pricing.tax.countryPlaceholder")}
              onChange={(event) => setCountry(event.target.value)}
            />
          </div>

          <div className="cuentas-step">
            <p className="cuentas-q">{t("pricing.tax.periodsTitle")}</p>
            <p className="muted small-note">{t("pricing.tax.periodsHint")}</p>
            <div className="factor-card-list">
              {sorted.map((period, index) => {
                const isLatest = period.id === latestId;
                const until = !isLatest
                  ? dayBeforeLabel(sorted[index + 1]?.from)
                  : "";
                return (
                  <div
                    className={`factor-card${isLatest ? " is-latest" : ""}`}
                    key={period.id}
                  >
                    <div className="factor-card-main">
                      {isLatest && (
                        <span className="factor-card-badge">{t("pricing.tax.usedNow")}</span>
                      )}
                      <label>
                        {t("pricing.period.fromDate")}
                        <DateField
                          value={period.from ?? ""}
                          onChange={(value) => updateRate(period.id, { from: value })}
                        />
                        <span className="muted small-note">
                          {period.from?.trim()
                            ? until
                              ? t("pricing.tax.until", { date: until })
                              : t("pricing.tax.stillValid")
                            : t("pricing.tax.emptyFromStart")}
                        </span>
                      </label>
                      <label>
                        {t("pricing.tax.percent")}
                        <input
                          inputMode="decimal"
                          value={
                            period.rate || period.rate === 0
                              ? String(period.rate)
                              : ""
                          }
                          onChange={(event) =>
                            updateRate(period.id, {
                              rate:
                                Number(
                                  event.target.value
                                    .replace(/[^0-9.,]/g, "")
                                    .replace(",", ".")
                                ) || 0
                            })
                          }
                        />
                      </label>
                    </div>
                    {sorted.length > 1 && (
                      <button
                        type="button"
                        className="factor-card-remove"
                        onClick={() => removeRate(period.id)}
                        title={t("common.remove")}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {!adding ? (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setAdding(true);
                  setError("");
                }}
              >
                {t("pricing.tax.addPeriodDate")}
              </button>
            ) : (
              <div className="factor-add-box">
                <p className="cuentas-q">{t("pricing.tax.newPercent")}</p>
                <div className="form-grid two">
                  <label>
                    {t("pricing.period.fromWhen")}
                    <DateField value={newFrom} onChange={setNewFrom} />
                  </label>
                  <label>
                    {t("pricing.tax.whichPercent")}
                    <input
                      inputMode="decimal"
                      value={newRate}
                      placeholder={t("pricing.tax.percentPlaceholder")}
                      onChange={(event) => setNewRate(event.target.value)}
                    />
                  </label>
                </div>
                <div className="choice-row">
                  <button type="button" onClick={addChange}>
                    {t("common.add")}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setAdding(false);
                      setError("");
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && <div className="error-banner">{error}</div>}
        </div>
        <div className="modal-actions">
          {onDelete && (
            <button type="button" className="ghost danger" onClick={onDelete}>
              {t("pricing.tax.delete")}
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" onClick={save}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PricingExportModal({
  inventory,
  sizeTypes,
  taxRates,
  onClose,
  onError,
  onToast
}: {
  inventory: InventoryData;
  sizeTypes: SizeType[];
  taxRates: TaxRate[];
  onClose: () => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const t = useT();
  const settingsNow: AppSettings = { sizeTypes, taxRates };
  const countries = taxCountries(settingsNow);
  const [includeTax, setIncludeTax] = useState(true);
  const [country, setCountry] = useState(countries[0] ?? "");
  const [selected, setSelected] = useState<string[]>(
    inventory.artworks.map((a) => a.id)
  );
  const [showPicker, setShowPicker] = useState(false);
  const [asOfDate, setAsOfDate] = useState(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, "0");
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${d}-${m}-${now.getFullYear()}`;
  });
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (selected.length === 0) {
      onError(t("pricing.export.needWorks"));
      return;
    }
    setBusy(true);
    try {
      const atMs = dateToMs(asOfDate);
      const dateMs = Number.isFinite(atMs) ? (atMs as number) : Date.now();
      const headers = [
        t("pricing.size.col.name"),
        t("library.col.series"),
        t("library.col.year"),
        t("library.filter.width"),
        t("library.filter.height"),
        t("pricing.export.col.sum"),
        t("pricing.size.col.factor"),
        t("pricing.export.col.base")
      ];
      if (includeTax && country) {
        headers.push(t("pricing.export.col.withTax", { country }));
      }

      const arts = orderArtworks(
        inventory.artworks.filter((a) => selected.includes(a.id)),
        "title"
      );
      const rows = arts.map((art) => {
        const wCm = toCm(art.width, art.unit);
        const hCm = toCm(art.height, art.unit);
        const sum = sizeSumCm(art);
        const factor = factorForDate(settingsNow, sum, dateMs);
        const base = factor == null ? null : sum * factor;
        const row: Array<string | number> = [
          art.title,
          art.series || "",
          art.yearMade || "",
          wCm != null ? Math.round(wCm) : "",
          hCm != null ? Math.round(hCm) : "",
          sum > 0 ? Math.round(sum) : "",
          factor ?? "",
          base != null ? Math.round(base) : ""
        ];
        if (includeTax && country) {
          row.push(
            base != null
              ? Math.round(base * (1 + taxRateAt(settingsNow, country, dateMs) / 100))
              : ""
          );
        }
        return row;
      });

      const path = await window.inventoryApi.exportPricingSheet({
        filename: "precios.xlsx",
        sheetName: t("pricing.eyebrow"),
        headers,
        rows
      });
      if (path) {
        onToast(t("pricing.toast.sheetSaved"));
        onClose();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : t("common.error.export"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("pricing.export.title")}</h3>
          <button className="icon-button ghost" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body export-wizard">
          <div className="export-step">
            <h4>{t("pricing.export.step1")}</h4>
            <div className="choice-row">
              <button
                type="button"
                className={`choice-chip${includeTax ? " active" : ""}`}
                onClick={() => setIncludeTax(true)}
              >
                {t("pricing.export.withTax")}
              </button>
              <button
                type="button"
                className={`choice-chip${!includeTax ? " active" : ""}`}
                onClick={() => setIncludeTax(false)}
              >
                {t("pricing.export.baseOnly")}
              </button>
            </div>
          </div>

          {includeTax && (
            <div className="export-step">
              <h4>{t("pricing.export.step2")}</h4>
              {countries.length === 0 ? (
                <p className="muted small-note">{t("pricing.export.noCountries")}</p>
              ) : (
                <select
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                >
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="export-step">
            <h4>{t("pricing.export.stepWorks", { n: includeTax ? 3 : 2 })}</h4>
            <div className="choice-row">
              <button
                type="button"
                className="choice-chip"
                onClick={() => setSelected(inventory.artworks.map((a) => a.id))}
              >
                {t("pricing.export.allWorks", { count: inventory.artworks.length })}
              </button>
              <button type="button" className="ghost" onClick={() => setShowPicker(true)}>
                {t("pricing.export.chooseWorks", { count: selected.length })}
              </button>
            </div>
          </div>

          <div className="export-step">
            <h4>{t("pricing.export.stepDate", { n: includeTax ? 4 : 3 })}</h4>
            <DateField value={asOfDate} onChange={setAsOfDate} />
            <p className="muted small-note">{t("pricing.export.dateHint")}</p>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" disabled={busy} onClick={generate}>
            {busy ? t("cert.modal.generating") : t("pricing.export.generateExcel")}
          </button>
        </div>
        {showPicker && (
          <ArtworkPickerModal
            inventory={inventory}
            excludeIds={[]}
            initialIds={selected}
            title={t("pricing.export.pickWorks")}
            onConfirm={(ids) => {
              setSelected(ids);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </div>
  );
}

function PricingSettingsPage({
  inventory,
  setInventory,
  onError,
  onToast
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const { lang, t } = useLanguage();
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>(
    inventory.settings.sizeTypes ?? []
  );
  const [taxRates, setTaxRates] = useState<TaxRate[]>(
    inventory.settings.taxRates ?? []
  );
  const [fixedTypePrices, setFixedTypePrices] = useState<FixedTypePrice[]>(
    () => {
      const stored = inventory.settings.fixedTypePrices ?? [];
      const byType = new Map(stored.map((p) => [p.typeValue, p]));
      for (const def of DEFAULT_FIXED_TYPE_PRICES) {
        if (!byType.has(def.typeValue)) {
          byType.set(def.typeValue, {
            typeValue: def.typeValue,
            prices: def.prices.map((period) => ({ ...period }))
          });
        }
      }
      return [...byType.values()];
    }
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<SizeType | null>(null);
  const [editingTax, setEditingTax] = useState<TaxCountryDraft | null>(null);
  const [editingFixed, setEditingFixed] = useState<FixedTypePrice | null>(null);
  const [addingFixed, setAddingFixed] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const dirty =
    JSON.stringify(sizeTypes) !==
      JSON.stringify(inventory.settings.sizeTypes ?? []) ||
    JSON.stringify(taxRates) !== JSON.stringify(inventory.settings.taxRates ?? []) ||
    JSON.stringify(fixedTypePrices) !==
      JSON.stringify(inventory.settings.fixedTypePrices ?? []);

  function addType() {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, "0");
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const today = `${d}-${m}-${now.getFullYear()}`;
    const finiteEnds = sizeTypes
      .map((t) => Number(t.toSum) || 0)
      .filter((n) => n > 0);
    const nextFrom = finiteEnds.length > 0 ? Math.max(...finiteEnds) + 1 : 0;
                    setEditing({
      id: `st-new-${Date.now()}`,
      label: "",
      fromSum: nextFrom,
      toSum: nextFrom + 100,
      factors: [{ id: `f-${Date.now()}`, from: today, factor: 0 }]
    });
  }

  const taxCountriesList = useMemo(() => {
    const map = new Map<string, TaxRate[]>();
    for (const tax of taxRates) {
      const key = tax.country.trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tax);
    }
    return [...map.entries()]
      .map(([country, rates]) => ({ country, rates }))
      .sort((a, b) => a.country.localeCompare(b.country, "es"));
  }, [taxRates]);

  function addTaxCountry() {
    setEditingTax({
      originalCountry: "",
      country: "",
      rates: [{ id: `tax-${Date.now()}`, country: "", rate: 0, from: "" }]
    });
  }

  function openTaxCountry(country: string, rates: TaxRate[]) {
    setEditingTax({
      originalCountry: country,
      country,
      rates: rates.map((r) => ({ ...r }))
    });
  }

  function saveTaxCountry(next: TaxCountryDraft) {
    setTaxRates((list) => {
      const kept = list.filter((t) => {
        if (next.originalCountry) {
          return t.country.trim() !== next.originalCountry.trim();
        }
        return true;
      });
      return [...kept, ...next.rates.map((r) => ({ ...r, country: next.country }))];
    });
    setSaved(false);
    setEditingTax(null);
  }

  function deleteTaxCountry(country: string) {
    setTaxRates((list) => list.filter((t) => t.country.trim() !== country.trim()));
    setSaved(false);
    setEditingTax(null);
  }

  async function save() {
    for (const type of sizeTypes) {
      const overlap = findOverlappingSize(type, sizeTypes);
      if (overlap) {
        const a = type.label?.trim() || t("common.noName");
        const b = overlap.label?.trim() || t("common.noName");
        onError(t("pricing.error.overlapSave", { a, b }));
        return;
      }
    }
    setSaving(true);
    try {
      const data = await window.inventoryApi.saveSettings({
        sizeTypes: sizeTypes.map((t) => ({
          ...t,
          fromSum: Number(t.fromSum) || 0,
          toSum: Number(t.toSum) || 0,
          factors: t.factors.map((p) => ({ ...p, factor: Number(p.factor) || 0 }))
        })),
        taxRates: taxRates.filter((t) => t.country.trim()),
        fixedTypePrices: fixedTypePrices
          .map((p) => ({
            typeValue: p.typeValue.trim(),
            prices: (p.prices ?? [])
              .map((period) => ({
                id: period.id || `fp-${Date.now()}`,
                from: String(period.from ?? "").trim(),
                price: Number(period.price) || 0
              }))
              .filter((period) => period.price > 0)
          }))
          .filter((p) => p.typeValue && p.prices.length > 0)
      });
      setInventory(data);
      setSizeTypes(data.settings.sizeTypes);
      setTaxRates(data.settings.taxRates);
      setFixedTypePrices(data.settings.fixedTypePrices ?? []);
      setSaved(true);
      onToast(t("pricing.toast.saved"));
    } catch (error) {
      onError(error instanceof Error ? error.message : t("common.error.save"));
    } finally {
      setSaving(false);
    }
  }

  const orderedTypes = sortSizeTypes(sizeTypes);

  return (
    <section className="list-page pricing-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{t("pricing.eyebrow")}</p>
          <h2>{t("pricing.title")}</h2>
          <p className="page-lead">{t("pricing.leadFactors")}</p>
        </div>
        <div className="form-head-actions">
          <button type="button" className="ghost" onClick={() => setShowExport(true)}>
            {t("pricing.generateSheet")}
          </button>
          <button disabled={saving || !dirty} onClick={save}>
            {saved && !dirty ? t("common.saved") : t("common.save")}
          </button>
        </div>
      </div>

      <div className="pricing-block">
        <div className="related-head">
          <h3>{t("pricing.size.title")}</h3>
          <button type="button" onClick={addType}>
            {t("pricing.size.add")}
          </button>
        </div>
        {orderedTypes.length === 0 ? (
          <div className="empty-friendly">
            <p>{t("pricing.size.emptyFriendly")}</p>
            <button type="button" onClick={addType}>
              {t("common.createFirst")}
            </button>
          </div>
        ) : (
          <div className="pricing-line-list">
            <div className="pricing-line-head">
              <span>{t("pricing.size.col.name")}</span>
              <span>{t("pricing.size.col.rangeSum")}</span>
              <span>{t("pricing.size.col.factor")}</span>
              <span />
            </div>
            {orderedTypes.map((type) => {
              const factor = currentFactorForType(type);
              const name = type.label?.trim() || t("common.noName");
              const range = `${type.fromSum || 0} → ${
                type.toSum ? `${type.toSum} cm` : "∞"
              }`;
              return (
                <button
                  type="button"
                  className="pricing-line-row"
                  key={type.id}
                  onClick={() => setEditing(type)}
                >
                  <strong>{name}</strong>
                  <span>{range}</span>
                  <span className="pricing-line-value">
                    {factor != null ? factor : "—"}
                  </span>
                  <span className="pricing-line-chevron" aria-hidden>
                    ›
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="pricing-block">
        <div className="related-head">
          <h3>{t("pricing.fixed.title")}</h3>
          <button type="button" className="ghost" onClick={() => setAddingFixed(true)}>
            {t("pricing.fixed.add")}
          </button>
        </div>
        <p className="muted small-note">{t("pricing.fixed.lead")}</p>
        {fixedTypePrices.length === 0 ? (
          <div className="empty-friendly">
            <p>{t("pricing.fixed.empty")}</p>
            <button type="button" onClick={() => setAddingFixed(true)}>
              {t("common.addFirst")}
            </button>
          </div>
        ) : (
          <div className="pricing-line-list">
            <div className="pricing-line-head">
              <span>{t("artwork.field.type")}</span>
              <span>{t("pricing.fixed.col.periods")}</span>
              <span>{t("pricing.fixed.col.now")}</span>
              <span />
            </div>
            {fixedTypePrices.map((row) => {
              const now = currentFixedPrice(row);
              const periods = row.prices.filter((p) => p.price > 0).length;
              return (
                <button
                  type="button"
                  className="pricing-line-row"
                  key={row.typeValue}
                  onClick={() => setEditingFixed(row)}
                >
                  <strong>
                    {lookupLabel(lang, "artworkType", row.typeValue, row.typeValue)}
                  </strong>
                  <span>
                    {t("pricing.fixed.periodsCount", { count: periods })}
                  </span>
                  <span className="pricing-line-value">
                    {now != null ? formatMoney(now) : "—"}
                  </span>
                  <span className="pricing-line-chevron" aria-hidden>
                    ›
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="pricing-block">
        <div className="related-head">
          <h3>{t("pricing.tax.title")}</h3>
          <button type="button" className="ghost" onClick={addTaxCountry}>
            {t("pricing.tax.addCountry")}
          </button>
        </div>
        {taxCountriesList.length === 0 ? (
          <div className="empty-friendly">
            <p>{t("pricing.tax.emptyFriendly")}</p>
            <button type="button" onClick={addTaxCountry}>
              {t("common.addFirst")}
            </button>
          </div>
        ) : (
          <div className="pricing-line-list">
            <div className="pricing-line-head">
              <span>{t("exhibition.field.country")}</span>
              <span>{t("pricing.tax.col.periods")}</span>
              <span>{t("pricing.tax.col.now")}</span>
              <span />
            </div>
            {taxCountriesList.map(({ country, rates }) => {
              const current = currentTaxRateForCountry(rates);
              const changes = rates.length;
              return (
                <button
                  type="button"
                  className="pricing-line-row"
                  key={country}
                  onClick={() => openTaxCountry(country, rates)}
                >
                  <strong>{country}</strong>
                  <span>
                    {changes === 1
                      ? t("pricing.tax.onePercent")
                      : t("pricing.tax.periodCount", { count: changes })}
                  </span>
                  <span className="pricing-line-value">
                    {current != null ? `${current} %` : "—"}
                  </span>
                  <span className="pricing-line-chevron" aria-hidden>
                    ›
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <p className="muted small-note">{t("pricing.tax.note")}</p>
      </div>

      {editing && (
        <SizeTypeEditModal
          type={editing}
          existingTypes={sizeTypes}
          onClose={() => setEditing(null)}
          onDelete={
            sizeTypes.some((t) => t.id === editing.id)
              ? () => {
                  setSizeTypes((list) => list.filter((t) => t.id !== editing.id));
                  setSaved(false);
                  setEditing(null);
                }
              : undefined
          }
          onSave={(next) => {
            const cleanId = next.id.startsWith("st-new")
              ? `st-${Date.now()}`
              : next.id;
            const savedType = { ...next, id: cleanId };
            setSizeTypes((list) => {
              const exists = list.some((t) => t.id === savedType.id);
              return sortSizeTypes(
                exists
                  ? list.map((t) => (t.id === savedType.id ? savedType : t))
                  : [...list, savedType]
              );
            });
            setSaved(false);
            setEditing(null);
          }}
        />
      )}

      {editingTax && (
        <TaxCountryEditModal
          draft={editingTax}
          existingCountries={taxCountriesList.map((c) => c.country)}
          onClose={() => setEditingTax(null)}
          onDelete={
            editingTax.originalCountry
              ? () => deleteTaxCountry(editingTax.originalCountry)
              : undefined
          }
          onSave={saveTaxCountry}
        />
      )}

      {editingFixed && (
        <FixedTypePriceEditModal
          entry={editingFixed}
          onClose={() => setEditingFixed(null)}
          onDelete={() => {
            setFixedTypePrices((list) =>
              list.filter((item) => item.typeValue !== editingFixed.typeValue)
            );
            setSaved(false);
            setEditingFixed(null);
          }}
          onSave={(next) => {
            setFixedTypePrices((list) => {
              const exists = list.some((item) => item.typeValue === next.typeValue);
              return exists
                ? list.map((item) =>
                    item.typeValue === next.typeValue ? next : item
                  )
                : [...list, next];
            });
            setSaved(false);
            setEditingFixed(null);
          }}
        />
      )}

      {addingFixed && (
        <FixedTypePriceAddModal
          inventory={inventory}
          existing={fixedTypePrices.map((p) => p.typeValue)}
          onClose={() => setAddingFixed(false)}
          onPick={(typeValue) => {
            const today = (() => {
              const now = new Date();
              const d = String(now.getDate()).padStart(2, "0");
              const m = String(now.getMonth() + 1).padStart(2, "0");
              return `${d}-${m}-${now.getFullYear()}`;
            })();
            const starter: FixedTypePrice = {
              typeValue,
              prices: [
                {
                  id: `fp-${Date.now()}`,
                  from: today,
                  price:
                    typeValue === "ipad_drawing"
                      ? 250
                      : typeValue === "plexiglass"
                        ? 400
                        : 0
                }
              ]
            };
            setAddingFixed(false);
            setEditingFixed(starter);
          }}
        />
      )}

      {showExport && (
        <PricingExportModal
          inventory={inventory}
          sizeTypes={sizeTypes}
          taxRates={taxRates}
          onClose={() => setShowExport(false)}
          onError={onError}
          onToast={onToast}
        />
      )}
    </section>
  );
}

function FixedTypePriceAddModal({
  inventory,
  existing,
  onClose,
  onPick
}: {
  inventory: InventoryData;
  existing: string[];
  onClose: () => void;
  onPick: (typeValue: string) => void;
}) {
  const { lang, t } = useLanguage();
  const taken = new Set(existing);
  const options = translatedLookupOptions(inventory, "artworkType", lang).filter(
    (option) => !taken.has(option.value)
  );
  const [picked, setPicked] = useState(options[0]?.value ?? "");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("pricing.fixed.addTitle")}</h3>
          <button type="button" className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="muted small-note">{t("pricing.fixed.addHint")}</p>
          {options.length === 0 ? (
            <p className="muted">{t("pricing.fixed.noneLeft")}</p>
          ) : (
            <label className="field">
              {t("artwork.field.type")}
              <select
                value={picked}
                onChange={(event) => setPicked(event.target.value)}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!picked || options.length === 0}
            onClick={() => onPick(picked)}
          >
            {t("common.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FixedTypePriceEditModal({
  entry,
  onSave,
  onDelete,
  onClose
}: {
  entry: FixedTypePrice;
  onSave: (next: FixedTypePrice) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { lang, t } = useLanguage();
  const [draft, setDraft] = useState<FixedTypePrice>(() => ({
    typeValue: entry.typeValue,
    prices:
      entry.prices.length > 0
        ? entry.prices.map((p) => ({ ...p }))
        : [{ id: `fp-${Date.now()}`, from: "", price: 0 }]
  }));
  const [adding, setAdding] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [newFrom, setNewFrom] = useState("");
  const [error, setError] = useState("");

  const label = lookupLabel(lang, "artworkType", draft.typeValue, draft.typeValue);
  const sorted = [...draft.prices].sort(
    (a, b) => periodMs(a.from) - periodMs(b.from)
  );
  const latestId = sorted.length > 0 ? sorted[sorted.length - 1].id : null;

  function updatePeriod(id: string, patch: Partial<FixedPricePeriod>) {
    setDraft((current) => ({
      ...current,
      prices: current.prices.map((p) => (p.id === id ? { ...p, ...patch } : p))
    }));
  }

  function removePeriod(id: string) {
    setDraft((current) => ({
      ...current,
      prices: current.prices.filter((p) => p.id !== id)
    }));
  }

  function addChange() {
    const price =
      Number(newPrice.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
    if (!newFrom.trim()) {
      setError(t("pricing.fixed.error.needDate"));
      return;
    }
    if (price <= 0) {
      setError(t("pricing.fixed.error.needPrice"));
      return;
    }
    setDraft((current) => ({
      ...current,
      prices: [
        ...current.prices,
        {
          id: `fp-${Date.now()}-${current.prices.length}`,
          from: newFrom,
          price
        }
      ]
    }));
    setNewPrice("");
    setNewFrom("");
    setAdding(false);
    setError("");
  }

  function save() {
    if (draft.prices.length === 0) {
      setError(t("pricing.fixed.error.needRow"));
      return;
    }
    for (const period of draft.prices) {
      if (!(period.price > 0)) {
        setError(t("pricing.fixed.error.pricePositive"));
        return;
      }
    }
    onSave({
      typeValue: draft.typeValue,
      prices: draft.prices.map((p) => ({
        ...p,
        price: Number(p.price) || 0,
        from: String(p.from ?? "").trim()
      }))
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide cuentas-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{t("pricing.fixed.editTitle", { name: label })}</h3>
          <button type="button" className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="muted small-note">{t("pricing.fixed.editHint")}</p>
          <div className="factor-card-list">
            {sorted.map((period) => {
              const isLatest = period.id === latestId;
              return (
                <div
                  className={`factor-card${isLatest ? " is-latest" : ""}`}
                  key={period.id}
                >
                  <div className="factor-card-main">
                    {isLatest && (
                      <span className="factor-card-badge">
                        {t("pricing.tax.usedNow")}
                      </span>
                    )}
                    <label>
                      {t("pricing.period.fromDate")}
                      <DateField
                        value={period.from ?? ""}
                        onChange={(value) =>
                          updatePeriod(period.id, { from: value })
                        }
                      />
                    </label>
                    <label>
                      {t("pricing.fixed.col.price")}
                      <input
                        inputMode="decimal"
                        value={period.price ? String(period.price) : ""}
                        onChange={(event) =>
                          updatePeriod(period.id, {
                            price:
                              Number(
                                event.target.value
                                  .replace(/[^0-9.,]/g, "")
                                  .replace(",", ".")
                              ) || 0
                          })
                        }
                      />
                    </label>
                  </div>
                  {draft.prices.length > 1 && (
                    <button
                      type="button"
                      className="link-button remove-link"
                      onClick={() => removePeriod(period.id)}
                    >
                      {t("common.remove")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {adding ? (
            <div className="factor-card is-new">
              <div className="factor-card-main">
                <label>
                  {t("pricing.period.fromDate")}
                  <DateField value={newFrom} onChange={setNewFrom} />
                </label>
                <label>
                  {t("pricing.fixed.col.price")}
                  <input
                    inputMode="decimal"
                    value={newPrice}
                    placeholder="250"
                    onChange={(event) =>
                      setNewPrice(
                        event.target.value.replace(/[^0-9.,]/g, "")
                      )
                    }
                  />
                </label>
              </div>
              <div className="form-actions">
                <button type="button" onClick={addChange}>
                  {t("common.add")}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setAdding(false);
                    setError("");
                  }}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setAdding(true);
                setError("");
              }}
            >
              {t("pricing.fixed.addPeriod")}
            </button>
          )}

          {error && <div className="error-banner">{error}</div>}
        </div>
        <div className="modal-actions">
          {onDelete && (
            <button type="button" className="ghost danger" onClick={onDelete}>
              {t("pricing.fixed.removeTechnique")}
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" onClick={save}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function requireApi<K extends keyof typeof window.inventoryApi>(
  name: K,
  t?: Translate
): (typeof window.inventoryApi)[K] {
  const fn = window.inventoryApi?.[name];
  if (typeof fn !== "function") {
    throw new Error(
      t ? t("app.restart.api") : translate("es", "app.restart.api")
    );
  }
  return fn;
}

async function copyTextToClipboard(text: string, t?: Translate): Promise<void> {
  const api = window.inventoryApi?.writeClipboardText;
  if (typeof api === "function") {
    await api(text);
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  if (!ok)
    throw new Error(
      t ? t("common.error.clipboard") : translate("es", "common.error.clipboard")
    );
}

/** Clickable value that copies plain text to the clipboard. */
function CopyableValue({
  value,
  onCopied,
  className,
  children
}: {
  value: string;
  onCopied?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const t = useT();
  const text = String(value ?? "").trim();
  const empty = !text || text === "-";
  const [flash, setFlash] = useState(false);

  async function copy() {
    if (empty) return;
    try {
      await copyTextToClipboard(text, t);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 900);
      onCopied?.();
    } catch {
      /* ignore — toast/errors handled by caller if needed */
    }
  }

  return (
    <button
      type="button"
      className={[
        "copyable-value",
        empty ? "is-empty" : "",
        flash ? "is-copied" : "",
        className || ""
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => void copy()}
      disabled={empty}
      title={empty ? undefined : t("common.clickToCopy")}
    >
      {children ?? text}
    </button>
  );
}

/** Accent- and case-insensitive haystack for the example searches. */
function searchKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function exampleMatchesSearch(
  example: TextGeneratorExample,
  search: string
): boolean {
  const term = searchKey(search.trim());
  if (!term) return true;
  const haystack = searchKey(
    `${example.topic} ${example.body} ${example.category ?? ""}`
  );
  return term
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

function normalizeTextExample(
  example: TextGeneratorExample
): TextGeneratorExample {
  return {
    id: example.id,
    topic: String(example.topic ?? example.title ?? "").trim(),
    body: String(example.body ?? example.text ?? ""),
    category: String(example.category ?? "").trim()
  };
}

function seriesTextKey(seriesId: string, textId: string): string {
  return `${seriesId}::${textId}`;
}

const TEXTGEN_DRAFT_KEY = "textgen-draft-v1";
const DEFAULT_TEXTGEN_INSTRUCTION = "";
/** Legacy default — treat as empty so the hint placeholder can show. */
const LEGACY_TEXTGEN_INSTRUCTION =
  "Escribe un borrador claro y personal (unas 200 palabras) para presentar estas obras. No inventes datos.";

type TextgenDraft = {
  selectedIds: string[];
  instruction: string;
  freeText: string;
  emailHistory: string;
  emailHistoryOpen: boolean;
  toneFormality: 1 | 2 | 3;
  toneFirmness: 1 | 2 | 3;
  toneWarmth: 1 | 2 | 3;
  responseLanguage: "es" | "en" | "de";
  referenceLinks: Array<{ id: string; url: string; note: string }>;
  selectedExampleIds: string[];
  selectedSeriesTextKeys: string[];
  autoSeriesTextKeys: string[];
  /** Series texts the user checked under «otras series» (kept without matching works). */
  manualOtherSeriesTextKeys: string[];
  seriesOpen: boolean;
  showOtherSeries: boolean;
  moreOpen: boolean;
};

function defaultTextgenDraft(): TextgenDraft {
  return {
    selectedIds: [],
    instruction: DEFAULT_TEXTGEN_INSTRUCTION,
    freeText: "",
    emailHistory: "",
    emailHistoryOpen: false,
    toneFormality: 2,
    toneFirmness: 2,
    toneWarmth: 2,
    responseLanguage: "es",
    referenceLinks: [],
    selectedExampleIds: [],
    selectedSeriesTextKeys: [],
    autoSeriesTextKeys: [],
    manualOtherSeriesTextKeys: [],
    seriesOpen: false,
    showOtherSeries: false,
    moreOpen: false
  };
}

function asToneLevel(value: unknown): 1 | 2 | 3 {
  return value === 1 || value === 3 ? value : 2;
}

function loadTextgenDraft(): TextgenDraft {
  const defaults = defaultTextgenDraft();
  try {
    const raw = localStorage.getItem(TEXTGEN_DRAFT_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<TextgenDraft>;
    const links = Array.isArray(parsed.referenceLinks)
      ? parsed.referenceLinks
          .map((link) => ({
            id: String(link?.id ?? ""),
            url: String(link?.url ?? ""),
            note: String(link?.note ?? "")
          }))
          .filter((link) => link.id)
      : [];
    const lang = parsed.responseLanguage;
    return {
      ...defaults,
      selectedIds: Array.isArray(parsed.selectedIds)
        ? parsed.selectedIds.map(String)
        : defaults.selectedIds,
      instruction:
        typeof parsed.instruction === "string"
          ? parsed.instruction === LEGACY_TEXTGEN_INSTRUCTION
            ? defaults.instruction
            : parsed.instruction
          : defaults.instruction,
      freeText:
        typeof parsed.freeText === "string" ? parsed.freeText : defaults.freeText,
      emailHistory:
        typeof parsed.emailHistory === "string"
          ? parsed.emailHistory
          : defaults.emailHistory,
      emailHistoryOpen: Boolean(parsed.emailHistoryOpen),
      toneFormality: asToneLevel(parsed.toneFormality),
      toneFirmness: asToneLevel(parsed.toneFirmness),
      toneWarmth: asToneLevel(parsed.toneWarmth),
      responseLanguage:
        lang === "en" || lang === "de" || lang === "es"
          ? lang
          : defaults.responseLanguage,
      referenceLinks: links,
      selectedExampleIds: Array.isArray(parsed.selectedExampleIds)
        ? parsed.selectedExampleIds.map(String)
        : defaults.selectedExampleIds,
      selectedSeriesTextKeys: Array.isArray(parsed.selectedSeriesTextKeys)
        ? parsed.selectedSeriesTextKeys.map(String)
        : defaults.selectedSeriesTextKeys,
      autoSeriesTextKeys: Array.isArray(parsed.autoSeriesTextKeys)
        ? parsed.autoSeriesTextKeys.map(String)
        : defaults.autoSeriesTextKeys,
      manualOtherSeriesTextKeys: Array.isArray(parsed.manualOtherSeriesTextKeys)
        ? parsed.manualOtherSeriesTextKeys.map(String)
        : defaults.manualOtherSeriesTextKeys,
      seriesOpen: Boolean(parsed.seriesOpen),
      showOtherSeries: Boolean(parsed.showOtherSeries),
      moreOpen: Boolean(parsed.moreOpen)
    };
  } catch {
    return defaults;
  }
}

function saveTextgenDraft(draft: TextgenDraft): void {
  try {
    localStorage.setItem(TEXTGEN_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Keep a clicked control fixed on screen while content expands below it. */
function expandDownFrom(
  anchor: HTMLElement,
  update: () => void
): void {
  const before = anchor.getBoundingClientRect().top;
  flushSync(update);
  const delta = anchor.getBoundingClientRect().top - before;
  if (Math.abs(delta) < 1) return;
  let node: HTMLElement | null = anchor.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      node.scrollTop += delta;
      return;
    }
    node = node.parentElement;
  }
  window.scrollBy(0, delta);
}

function expenseCategoryLabel(
  category: ExpenseCategory,
  t: Translate
): string {
  switch (category) {
    case "material":
      return t("financials.expense.type.materials");
    case "exhibition":
      return t("financials.expense.type.exhibition");
    default:
      return t("financials.expense.type.other");
  }
}

function ExpenseModal({
  inventory,
  setInventory,
  expense,
  onClose,
  onError,
  onToast
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  expense: Expense | null;
  onClose: () => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<ExpenseInput>(() =>
    expense
      ? {
          id: expense.id,
          category: expense.category,
          amount: expense.amount,
          date: expense.date,
          note: expense.note,
          contactId: expense.contactId ?? "",
          exhibitionId: expense.exhibitionId ?? "",
          receiptImageId: expense.receiptImageId ?? ""
        }
      : {
          category: "material",
          amount: "",
          date: (() => {
            const now = new Date();
            const d = String(now.getDate()).padStart(2, "0");
            const m = String(now.getMonth() + 1).padStart(2, "0");
            return `${d}-${m}-${now.getFullYear()}`;
          })(),
          note: "",
          contactId: "",
          exhibitionId: "",
          receiptImageId: ""
        }
  );
  const [saving, setSaving] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState("");

  useEffect(() => {
    const imageId = form.receiptImageId || expense?.receiptImageId;
    const image = inventory.images.find((img) => img.id === imageId);
    if (!image?.absolutePath) {
      setReceiptUrl("");
      return;
    }
    let cancelled = false;
    void window.inventoryApi.imageToDataUrl(image.absolutePath).then((url) => {
      if (!cancelled) setReceiptUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [form.receiptImageId, expense?.receiptImageId, inventory.images]);

  function set<K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!form.amount.trim()) {
      onError(t("financials.expense.error.needAmount"));
      return;
    }
    setSaving(true);
    try {
      const data = await requireApi("saveExpense", t)(form);
      setInventory(data);
      onToast(t("financials.toast.expenseSaved"));
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : t("common.error.save"));
    } finally {
      setSaving(false);
    }
  }

  async function attachReceipt() {
    try {
      let expenseId = form.id;
      if (!expenseId) {
        if (!form.amount.trim()) {
          onError(t("financials.expense.error.amountBeforeReceipt"));
          return;
        }
        const data = await requireApi("saveExpense", t)(form);
        setInventory(data);
        const created = [...data.expenses].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt)
        )[0];
        expenseId = created?.id;
        if (!expenseId) {
          onError(t("financials.expense.error.create"));
          return;
        }
        setForm((current) => ({ ...current, id: expenseId }));
      }
      const result = await requireApi("importImage", t)("expense", expenseId, "receipt");
      if (!result) return;
      setInventory(result.inventory);
      const image = result.image as { id?: string };
      if (image?.id) set("receiptImageId", image.id);
      onToast(t("financials.toast.ticketSaved"));
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : t("financials.expense.error.attach")
      );
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide cuentas-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            {expense
              ? t("financials.expense.modalEdit")
              : t("financials.expense.modalNew")}
          </h3>
          <button type="button" className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="cuentas-step">
            <p className="cuentas-q">{t("financials.expense.qType")}</p>
            <div className="cuentas-type-grid">
              {(
                [
                  [
                    "material",
                    t("financials.expense.type.materials"),
                    t("financials.expense.hint.materials")
                  ],
                  [
                    "exhibition",
                    t("financials.expense.type.exhibition"),
                    t("financials.expense.hint.exhibition")
                  ],
                  [
                    "misc",
                    t("financials.expense.type.other"),
                    t("financials.expense.hint.other")
                  ]
                ] as Array<[ExpenseCategory, string, string]>
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  className={`cuentas-type${form.category === value ? " active" : ""}`}
                  onClick={() => set("category", value)}
                >
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cuentas-step">
            <p className="cuentas-q">{t("financials.expense.qWhen")}</p>
            <div className="form-grid two">
              <label>
                {t("financials.expense.amountEuros")}
                <div className="money-input">
                  <input
                    autoFocus={!expense}
                    inputMode="decimal"
                    value={form.amount}
                    placeholder="0"
                    onChange={(event) => set("amount", event.target.value)}
                  />
                  <span>€</span>
                </div>
              </label>
              <label>
                {t("financials.expense.date")}
                <DateField
                  value={form.date ?? ""}
                  onChange={(value) => set("date", value)}
                />
              </label>
            </div>
          </div>

          <div className="cuentas-step">
            <p className="cuentas-q">{t("financials.expense.qWhat")}</p>
            <label>
              {t("financials.expense.shortNote")}
              <input
                value={form.note}
                placeholder={t("financials.expense.notePlaceholder")}
                onChange={(event) => set("note", event.target.value)}
              />
            </label>
          </div>

          {form.category === "exhibition" && (
            <div className="cuentas-step">
              <p className="cuentas-q">{t("financials.expense.qExhibition")}</p>
              <div className="form-grid two">
                <label>
                  {t("movement.detail.exhibition")}
                  <select
                    value={form.exhibitionId ?? ""}
                    onChange={(event) => set("exhibitionId", event.target.value)}
                  >
                    <option value="">{t("common.none")}</option>
                    {inventory.exhibitions.map((exhibition) => (
                      <option key={exhibition.id} value={exhibition.id}>
                        {exhibition.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("financials.expense.galleryOrPerson")}
                  <select
                    value={form.contactId ?? ""}
                    onChange={(event) => set("contactId", event.target.value)}
                  >
                    <option value="">{t("common.none")}</option>
                    {inventory.contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          <div className="cuentas-step">
            <p className="cuentas-q">{t("financials.expense.qReceipt")}</p>
            <div className="receipt-box">
              {receiptUrl ? (
                <img
                  className="receipt-thumb"
                  src={receiptUrl}
                  alt={t("financials.expense.ticket")}
                />
              ) : (
                <p className="muted">{t("financials.expense.noReceipt")}</p>
              )}
              <button type="button" className="ghost" onClick={attachReceipt}>
                {receiptUrl
                  ? t("artwork.photo.change")
                  : t("financials.expense.pickReceipt")}
              </button>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" disabled={saving} onClick={save}>
            {saving ? t("common.saving") : t("financials.expense.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FinancialExportModal({
  inventory,
  onClose,
  onError,
  onToast
}: {
  inventory: InventoryData;
  onClose: () => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const t = useT();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exhibitionId, setExhibitionId] = useState("");
  const [includeGalleryPayments, setIncludeGalleryPayments] = useState(false);
  const [includeSalesWithoutTax, setIncludeSalesWithoutTax] = useState(false);
  const [busy, setBusy] = useState(false);

  function inRange(date?: string): boolean {
    const ms = dateToMs(date ?? "");
    if (!Number.isFinite(ms)) return !fromDate && !toDate;
    const fromMs = dateToMs(fromDate);
    const toMs = dateToMs(toDate);
    if (Number.isFinite(fromMs) && (ms as number) < (fromMs as number)) return false;
    if (Number.isFinite(toMs) && (ms as number) > (toMs as number)) return false;
    return true;
  }

  async function generate() {
    setBusy(true);
    try {
      const expenses = (inventory.expenses ?? []).filter((expense) => {
        if (exhibitionId && expense.exhibitionId !== exhibitionId) return false;
        return inRange(expense.date);
      });
      const sales = inventory.movements.filter((movement) => {
        if (movementKind(movement.type) !== "sale") return false;
        if (exhibitionId && movement.exhibitionId !== exhibitionId) return false;
        if (!includeSalesWithoutTax && movement.taxCharged === false) return false;
        return inRange(movement.date);
      });
      const galleryPayments = includeGalleryPayments
        ? inventory.movements.filter((movement) => {
            if (movementKind(movement.type) !== "payment") return false;
            if (exhibitionId) return false;
            return inRange(movement.date);
          })
        : [];

      const contactName = (id?: string) =>
        inventory.contacts.find((c) => c.id === id)?.name ?? "";
      const exhibitionTitle = exhibitionId
        ? inventory.exhibitions.find((e) => e.id === exhibitionId)?.title ?? ""
        : "";

      const expenseRows = [
        ...expenses.map((expense) => ({
          category: expenseCategoryLabel(expense.category, t),
          date: expense.date || "",
          amount: parseMoney(expense.amount) ?? 0,
          note: expense.note,
          where:
            contactName(expense.contactId) ||
            inventory.exhibitions.find((e) => e.id === expense.exhibitionId)?.title ||
            ""
        })),
        ...galleryPayments.map((payment) => {
          const art = inventory.artworks.find((a) => a.id === payment.artworkId);
          const settings: AppSettings = {
            sizeTypes: inventory.settings.sizeTypes ?? [],
            taxRates: inventory.settings.taxRates ?? []
          };
          return {
            category: t("financials.export.row.galleryPayment"),
            date: payment.date || "",
            amount: galleryPaymentCost(payment, art, settings),
            note: art?.title
              ? t("financials.export.row.artwork", { title: art.title })
              : t("financials.export.row.artworkAsPayment"),
            where: contactName(payment.contactId) || payment.contactName || ""
          };
        })
      ];
      const incomeRows = sales.map((sale) => {
        const art = inventory.artworks.find((a) => a.id === sale.artworkId);
        const contextLabel =
          sale.context === "gallery"
            ? t("financials.export.row.saleGallery")
            : sale.context === "exhibition"
              ? t("financials.export.row.saleExhibition")
              : t("financials.export.row.saleDirect");
        return {
          date: sale.date || "",
          amount: saleIncomeAmount(sale),
          how: contextLabel,
          artwork: art?.title ?? sale.artworkId,
          series: art?.series ?? "",
          where:
            sale.exhibitionTitle ||
            contactName(sale.contactId) ||
            sale.contactName ||
            "",
          salePrice: parseMoney(sale.price),
          taxCharged: sale.taxCharged !== false
        };
      });
      const spent = expenseRows.reduce((sum, row) => sum + row.amount, 0);
      const earned = incomeRows.reduce((sum, row) => sum + row.amount, 0);

      const path = await requireApi("exportFinancialsSheet", t)({
        filename: "cuentas.xlsx",
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        exhibitionTitle: exhibitionTitle || undefined,
        expenseRows,
        incomeRows,
        totals: { spent, earned, net: earned - spent }
      });
      if (path) {
        onToast(t("financials.toast.summarySaved"));
        onClose();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : t("common.error.export"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("financials.export.title")}</h3>
          <button type="button" className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body export-wizard">
          <p className="muted small-note">{t("financials.export.lead")}</p>
          <div className="export-step">
            <h4>{t("financials.export.step1")}</h4>
            <div className="form-grid two">
              <label>
                {t("exhibition.field.from")}
                <DateField value={fromDate} onChange={setFromDate} />
              </label>
              <label>
                {t("exhibition.field.until")}
                <DateField value={toDate} onChange={setToDate} />
              </label>
            </div>
            <button
              type="button"
              className="ghost small"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
            >
              {t("financials.filter.allTime")}
            </button>
          </div>
          <div className="export-step">
            <h4>{t("financials.export.step2")}</h4>
            <select
              value={exhibitionId}
              onChange={(event) => setExhibitionId(event.target.value)}
            >
              <option value="">{t("financials.export.allExhibitions")}</option>
              {inventory.exhibitions.map((exhibition) => (
                <option key={exhibition.id} value={exhibition.id}>
                  {exhibition.title}
                </option>
              ))}
            </select>
          </div>
          <div className="export-step">
            <h4>{t("financials.export.step3")}</h4>
            <label className="checkline">
              <input
                type="checkbox"
                checked={includeGalleryPayments}
                onChange={(event) =>
                  setIncludeGalleryPayments(event.target.checked)
                }
              />
              {t("financials.export.includePayments")}
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={includeSalesWithoutTax}
                onChange={(event) =>
                  setIncludeSalesWithoutTax(event.target.checked)
                }
              />
              {t("financials.export.includeNoTax")}
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" disabled={busy} onClick={generate}>
            {busy ? t("setup.working") : t("financials.export.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

function yearFromDate(value?: string): number | null {
  if (!value) return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (match) return Number(match[3]);
  const y = Number(String(value).replace(/[^0-9]/g, "").slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}

function FinancialsPage({
  inventory,
  setInventory,
  onError,
  onToast
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const { lang, t } = useLanguage();
  const thisYear = new Date().getFullYear();
  const [editing, setEditing] = useState<Expense | null | "new">(null);
  const [showExport, setShowExport] = useState(false);
  const [category, setCategory] = useState<"all" | ExpenseCategory>("all");
  const [year, setYear] = useState<"all" | number>(thisYear);
  const [exhibitionId, setExhibitionId] = useState("");
  const [contactId, setContactId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [periodMode, setPeriodMode] = useState<"year" | "range">("year");
  const [showMore, setShowMore] = useState(false);
  const [hideMoney, setHideMoney] = useState(() => {
    try {
      return localStorage.getItem("cuentas-hide-money") === "1";
    } catch {
      return false;
    }
  });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showPayments, setShowPayments] = useState(false);

  function toggleHideMoney() {
    setHideMoney((current) => {
      const next = !current;
      try {
        localStorage.setItem("cuentas-hide-money", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function moneyLabel(value: number): string {
    return hideMoney ? "••••" : formatMoney(value);
  }

  const allExpenses = inventory.expenses ?? [];
  const yearOptions = uniqueNumbers(
    [
      thisYear,
      thisYear - 1,
      thisYear - 2,
      ...allExpenses.map((e) => yearFromDate(e.date)),
      ...inventory.movements
        .filter((m) => movementKind(m.type) === "sale")
        .map((m) => yearFromDate(m.date))
    ].filter((y): y is number => y != null)
  ).sort((a, b) => b - a);

  function matchesWindow(date?: string): boolean {
    if (periodMode === "range") {
      const ms = dateToMs(date ?? "");
      if (!Number.isFinite(ms)) return !fromDate && !toDate;
      const fromMs = dateToMs(fromDate);
      const toMs = dateToMs(toDate);
      if (Number.isFinite(fromMs) && (ms as number) < (fromMs as number)) return false;
      if (Number.isFinite(toMs) && (ms as number) > (toMs as number)) return false;
      return true;
    }
    if (year === "all") return true;
    return yearFromDate(date) === year;
  }

  const expenses = [...allExpenses]
    .filter((expense) => {
      if (category !== "all" && expense.category !== category) return false;
      if (exhibitionId && expense.exhibitionId !== exhibitionId) return false;
      if (contactId && expense.contactId !== contactId) return false;
      return matchesWindow(expense.date);
    })
    .sort((a, b) => {
      const aMs = dateToMs(a.date);
      const bMs = dateToMs(b.date);
      if (Number.isFinite(aMs) && Number.isFinite(bMs))
        return (bMs as number) - (aMs as number);
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });

  const sales = inventory.movements.filter((movement) => {
    if (movementKind(movement.type) !== "sale") return false;
    if (exhibitionId && movement.exhibitionId !== exhibitionId) return false;
    if (contactId && movement.contactId !== contactId) return false;
    return matchesWindow(movement.date);
  });

  const galleryPayments = inventory.movements.filter((movement) => {
    if (movementKind(movement.type) !== "payment") return false;
    if (exhibitionId) return false;
    if (contactId && movement.contactId !== contactId) return false;
    return matchesWindow(movement.date);
  });

  const settings: AppSettings = {
    sizeTypes: inventory.settings.sizeTypes ?? [],
    taxRates: inventory.settings.taxRates ?? []
  };

  const paymentCost = galleryPayments.reduce((sum, m) => {
    const art = inventory.artworks.find((a) => a.id === m.artworkId);
    return sum + galleryPaymentCost(m, art, settings);
  }, 0);
  const spent =
    expenses.reduce((sum, e) => sum + (parseMoney(e.amount) ?? 0), 0) +
    paymentCost;
  const earned = sales.reduce((sum, m) => sum + saleIncomeAmount(m), 0);

  async function remove(id: string) {
    try {
      const data = await requireApi("deleteExpense", t)(id);
      setInventory(data);
      setConfirmId(null);
      onToast(t("financials.toast.expenseDeleted"));
    } catch (error) {
      onError(error instanceof Error ? error.message : t("common.error.delete"));
    }
  }

  function clearExtra() {
    setCategory("all");
    setExhibitionId("");
    setContactId("");
  }

  return (
    <section className="list-page financials-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{t("financials.eyebrow")}</p>
          <h2>{t("financials.title")}</h2>
          <p className="page-lead">{t("financials.leadLong")}</p>
        </div>
        <label className="checkline hide-money-toggle">
          <input type="checkbox" checked={hideMoney} onChange={toggleHideMoney} />
          {t("financials.hideAmounts")}
        </label>
      </div>

      <div className="cuentas-toolbar">
        <label className="cuentas-select">
          {t("financials.filter.year")}
          <select
            value={periodMode === "range" ? "range" : year === "all" ? "all" : String(year)}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "range") {
                setPeriodMode("range");
                return;
              }
              setPeriodMode("year");
              setYear(value === "all" ? "all" : Number(value));
            }}
          >
            <option value={String(thisYear)}>
              {t("common.thisYearWith", { year: thisYear })}
            </option>
            {yearOptions
              .filter((y) => y !== thisYear)
              .map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            <option value="all">{t("financials.filter.allTime")}</option>
            <option value="range">{t("financials.filter.pickDates")}</option>
          </select>
        </label>

        <label className="cuentas-select">
          {t("financials.filter.expenseType")}
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as "all" | ExpenseCategory)
            }
          >
            <option value="all">{t("common.all")}</option>
            <option value="material">{t("financials.expense.type.materials")}</option>
            <option value="exhibition">
              {t("financials.expense.type.exhibition")}
            </option>
            <option value="misc">{t("financials.expense.type.other")}</option>
          </select>
        </label>

        <button
          type="button"
          className={`ghost${showMore ? " is-on" : ""}`}
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? t("common.fewerFilters") : t("common.moreFilters")}
        </button>
      </div>

      {periodMode === "range" && (
        <div className="cuentas-range-row">
          <label>
            {t("exhibition.field.from")}
            <DateField value={fromDate} onChange={setFromDate} />
          </label>
          <label>
            {t("exhibition.field.until")}
            <DateField value={toDate} onChange={setToDate} />
          </label>
        </div>
      )}

      {showMore && (
        <div className="cuentas-more-filters">
          <label>
            {t("movement.detail.exhibition")}
            <select
              value={exhibitionId}
              onChange={(event) => setExhibitionId(event.target.value)}
            >
              <option value="">{t("common.allFeminine")}</option>
              {inventory.exhibitions.map((exhibition) => (
                <option key={exhibition.id} value={exhibition.id}>
                  {exhibition.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("financials.filter.personGallery")}
            <select
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
            >
              <option value="">{t("common.allFeminine")}</option>
              {inventory.contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>
          {(category !== "all" || exhibitionId || contactId) && (
            <button type="button" className="ghost small" onClick={clearExtra}>
              {t("common.clear")}
            </button>
          )}
        </div>
      )}

      <div className="money-totals money-totals-stack">
        <div className="money-card spent">
          <span>{t("financials.totals.spent")}</span>
          <strong>{moneyLabel(spent)}</strong>
        </div>
        <div className="money-card earned">
          <span>{t("financials.totals.received")}</span>
          <strong>{moneyLabel(earned)}</strong>
        </div>
      </div>

      <div className="cuentas-actions">
        <button type="button" className="cuentas-primary" onClick={() => setEditing("new")}>
          {t("financials.actions.addExpense")}
        </button>
        <button type="button" className="ghost" onClick={() => setShowExport(true)}>
          {t("financials.actions.excelSummary")}
        </button>
      </div>

      <div className="cuentas-links">
        <button
          type="button"
          className="cuentas-link-card"
          onClick={() => setShowExpenses(true)}
        >
          <span className="cuentas-link-label">{t("financials.expenses.title")}</span>
          <strong>{expenses.length}</strong>
          <span className="muted">
            {expenses.length === 0
              ? allExpenses.length === 0
                ? t("financials.expenses.none")
                : t("financials.expenses.noneInFilter")
              : t("common.viewDetail")}
          </span>
        </button>
        {galleryPayments.length > 0 && (
          <button
            type="button"
            className="cuentas-link-card"
            onClick={() => setShowPayments(true)}
          >
            <span className="cuentas-link-label">
              {t("financials.expense.galleryPayment")}
            </span>
            <strong>{galleryPayments.length}</strong>
            <span className="muted">{t("common.viewDetail")}</span>
          </button>
        )}
      </div>

      {showExpenses && (
        <div className="modal-backdrop" onClick={() => setShowExpenses(false)}>
          <div
            className="modal modal-wide cuentas-expenses-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{t("financials.expenses.countTitle", { count: expenses.length })}</h3>
              <button
                type="button"
                className="icon-button ghost"
                onClick={() => setShowExpenses(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {expenses.length === 0 ? (
                <div className="empty-friendly">
                  <p>
                    {allExpenses.length === 0
                      ? t("financials.expenses.emptyFriendly")
                      : t("financials.expenses.empty")}
                  </p>
                </div>
              ) : (
                <div className="expense-list">
                  {expenses.map((expense) => {
                    const where =
                      inventory.exhibitions.find((e) => e.id === expense.exhibitionId)
                        ?.title ||
                      inventory.contacts.find((c) => c.id === expense.contactId)?.name ||
                      "";
                    return (
                      <div className="expense-card" key={expense.id}>
                        <button
                          type="button"
                          className="expense-card-main"
                          onClick={() => setEditing(expense)}
                        >
                          <span className="expense-cat-pill">
                            {expenseCategoryLabel(expense.category, t)}
                          </span>
                          <strong className="expense-note">
                            {expense.note || t("financials.expense.noDescription")}
                          </strong>
                          <span className="muted expense-meta">
                            {expense.date || t("common.noDate")}
                            {where ? ` · ${where}` : ""}
                          </span>
                          <strong className="expense-amount">
                            {moneyLabel(parseMoney(expense.amount) ?? 0)}
                          </strong>
                        </button>
                        <button
                          type="button"
                          className="ghost danger small"
                          onClick={() => setConfirmId(expense.id)}
                        >
                          {t("common.erase")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setEditing("new")}
              >
                {t("financials.actions.addExpense")}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowExpenses(false)}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPayments && (
        <div className="modal-backdrop" onClick={() => setShowPayments(false)}>
          <div
            className="modal modal-wide cuentas-expenses-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>
                {t("financials.payments.countTitle", {
                  count: galleryPayments.length
                })}
              </h3>
              <button
                type="button"
                className="icon-button ghost"
                onClick={() => setShowPayments(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="expense-list">
                {galleryPayments.map((payment) => {
                  const art = inventory.artworks.find((a) => a.id === payment.artworkId);
                  const gallery =
                    inventory.contacts.find((c) => c.id === payment.contactId)?.name ||
                    payment.contactName ||
                    "";
                  const amount = galleryPaymentCost(payment, art, settings);
                  return (
                    <div className="expense-card" key={payment.id}>
                      <div className="expense-card-main" style={{ cursor: "default" }}>
                        <span className="expense-cat-pill">
                          {t("financials.expense.galleryPayment")}
                        </span>
                        <strong className="expense-note">
                          {art?.title || payment.artworkId}
                        </strong>
                        <span className="muted expense-meta">
                          {payment.date || t("common.noDate")}
                          {gallery ? ` · ${gallery}` : ""}
                        </span>
                        <strong className="expense-amount">{moneyLabel(amount)}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setShowPayments(false)}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing !== null && (
        <ExpenseModal
          inventory={inventory}
          setInventory={setInventory}
          expense={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onError={onError}
          onToast={onToast}
        />
      )}
      {showExport && (
        <FinancialExportModal
          inventory={inventory}
          onClose={() => setShowExport(false)}
          onError={onError}
          onToast={onToast}
        />
      )}
      {confirmId && (
        <div className="modal-backdrop" onClick={() => setConfirmId(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{t("confirm.expense.title")}</h3>
            </div>
            <p className="confirm-message">{t("confirm.expense.message")}</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setConfirmId(null)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="ghost danger"
                onClick={() => remove(confirmId)}
              >
                {t("confirm.expense.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}


/* art type translations for the price list -------------------------------- */

type PriceLang = "es" | "de" | "en";

const PRICE_LANGS: Array<[PriceLang, string]> = [
  ["es", "Español"],
  ["de", "Deutsch"],
  ["en", "English"]
];

const ART_TYPE_I18N: Record<string, Record<PriceLang, string>> = {
  oil_canvas: { es: "Óleo sobre lienzo", de: "Öl auf Leinwand", en: "Oil on canvas" },
  acrylic_canvas: {
    es: "Acrílico sobre lienzo",
    de: "Acryl auf Leinwand",
    en: "Acrylic on canvas"
  },
  painting: { es: "Pintura", de: "Malerei", en: "Painting" },
  watercolor: { es: "Acuarela", de: "Aquarell", en: "Watercolour" },
  sculpture: { es: "Escultura", de: "Skulptur", en: "Sculpture" },
  drawing: { es: "Dibujo", de: "Zeichnung", en: "Drawing" },
  print: { es: "Grabado", de: "Druck", en: "Print" },
  mixed_media: { es: "Técnica mixta", de: "Mischtechnik", en: "Mixed media" },
  ipad_drawing: {
    es: "Ipad Drawings",
    de: "Ipad Drawings",
    en: "Ipad Drawings"
  },
  plexiglass: {
    es: "Plexiglass",
    de: "Plexiglas",
    en: "Plexiglass"
  },
  other: { es: "Otro", de: "Sonstiges", en: "Other" }
};

function artTypeLabel(
  inventory: InventoryData,
  value: string | undefined,
  lang: PriceLang
): string {
  if (!value) return "";
  const translated = ART_TYPE_I18N[value]?.[lang];
  if (translated) return translated;
  return labelFor(inventory, "artworkType", value, lang);
}

function headingDefaults(lang: PriceLang) {
  return APP_HEADING_DEFAULTS[lang] ?? APP_HEADING_DEFAULTS.es;
}

const APP_HEADING_DEFAULTS: Record<
  PriceLang,
  {
    works: string;
    aboutWorks: string;
    aboutProject: string;
    emptyImage: string;
    seriesPrefix: string;
    noSeries: string;
    sizeLabel: string;
    yearLabel: string;
    typeLabel: string;
    tocLabel: string;
    sectionsLabel: string;
    workSingular: string;
    workPlural: string;
  }
> = {
  es: {
    works: "Obras",
    aboutWorks: "Sobre las obras",
    aboutProject: "Sobre el proyecto",
    emptyImage: "Sin imagen",
    seriesPrefix: "Serie",
    noSeries: "sin serie",
    sizeLabel: "Tamaño",
    yearLabel: "Año",
    typeLabel: "Técnica",
    tocLabel: "Índice",
    sectionsLabel: "Textos",
    workSingular: "cuadro",
    workPlural: "cuadros"
  },
  en: {
    works: "Works",
    aboutWorks: "About the works",
    aboutProject: "About the project",
    emptyImage: "No image",
    seriesPrefix: "Series",
    noSeries: "no series",
    sizeLabel: "Size",
    yearLabel: "Year",
    typeLabel: "Technique",
    tocLabel: "Contents",
    sectionsLabel: "Texts",
    workSingular: "work",
    workPlural: "works"
  },
  de: {
    works: "Werke",
    aboutWorks: "Über die Werke",
    aboutProject: "Über das Projekt",
    emptyImage: "Kein Bild",
    seriesPrefix: "Serie",
    noSeries: "ohne Serie",
    sizeLabel: "Größe",
    yearLabel: "Jahr",
    typeLabel: "Technik",
    tocLabel: "Inhalt",
    sectionsLabel: "Texte",
    workSingular: "Werk",
    workPlural: "Werke"
  }
};

function moveIdInList(ids: string[], index: number, dir: -1 | 1): string[] {
  const next = [...ids];
  const j = index + dir;
  if (j < 0 || j >= next.length) return ids;
  const tmp = next[index];
  next[index] = next[j];
  next[j] = tmp;
  return next;
}

function reorderIdInList(
  ids: string[],
  fromIndex: number,
  toIndex: number
): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ids.length ||
    toIndex >= ids.length
  ) {
    return ids;
  }
  const next = [...ids];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function moveIdInListById(ids: string[], id: string, dir: -1 | 1): string[] {
  const index = ids.indexOf(id);
  if (index < 0) return ids;
  return moveIdInList(ids, index, dir);
}

function OrderButtons({
  index,
  total,
  onMove
}: {
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
}) {
  const t = useT();
  return (
    <span className="order-btns">
      <button
        type="button"
        className="ghost small order-btn"
        disabled={index === 0}
        title={t("common.moveUp")}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="ghost small order-btn"
        disabled={index >= total - 1}
        title={t("common.moveDown")}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
    </span>
  );
}

function RichMenuSelect({
  label,
  value,
  options,
  onPick,
  className
}: {
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  onPick: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const display = selected?.label ?? label;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      className={["rich-menu", className].filter(Boolean).join(" ")}
      ref={rootRef}
    >
      <button
        type="button"
        className="rich-menu-trigger"
        title={label}
        aria-expanded={open}
        onMouseDown={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        {display}
        <span className="rich-menu-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="rich-menu-panel" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rich-menu-item${
                option.value === value ? " selected" : ""
              }`}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Keep only safe tags for inbox notes (bold + lists). */
function sanitizeNoteHtml(html: string): string {
  if (!html) return "";
  let out = String(html);
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/javascript:/gi, "");
  out = out.replace(
    /<\/?(?!\/?(?:b|strong|i|em|br|p|div|ul|ol|li|span)\b)[^>]*>/gi,
    ""
  );
  out = out.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "");
  out = out.replace(/\sclass\s*=\s*("[^"]*"|'[^']*')/gi, "");
  return out;
}

function noteBodyToEditorHtml(body: string): string {
  const raw = String(body ?? "");
  if (!raw.trim()) return "<p><br></p>";
  if (looksLikeHtml(raw)) {
    const cleaned = sanitizeNoteHtml(raw).trim();
    return cleaned || "<p><br></p>";
  }
  return escapeHtmlText(raw)
    .split(/\r\n|\r|\n/)
    .map((line) => `<p>${line || "<br>"}</p>`)
    .join("");
}

function stripNoteHtml(html: string): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isNoteBodyEmpty(html: string): boolean {
  return !stripNoteHtml(html);
}

/** Compact note editor: bold, bullets, numbered list. */
function SimpleNoteEditor({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const t = useT();
  const editorRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const savedRangeRef = useRef<Range | null>(null);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = noteBodyToEditorHtml(value);
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      /* ignore */
    }
    // Mount only — avoid wiping while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    const html = sanitizeNoteHtml(editorRef.current?.innerHTML ?? "");
    onChangeRef.current(html);
  }

  function rememberSelection() {
    const el = editorRef.current;
    const selection = window.getSelection();
    if (!el || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }

  function restoreSelection() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const saved = savedRangeRef.current;
    if (saved) {
      try {
        if (el.contains(saved.commonAncestorContainer)) {
          selection.removeAllRanges();
          selection.addRange(saved);
          return;
        }
      } catch {
        /* detached range */
      }
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function run(cmd: string) {
    restoreSelection();
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      /* ignore */
    }
    document.execCommand(cmd, false);
    rememberSelection();
    emit();
  }

  return (
    <div className="note-editor">
      <div className="note-toolbar" role="toolbar" aria-label={t("inbox.notes.format")}>
        <button
          type="button"
          className="note-tool"
          title={t("inbox.notes.bold")}
          aria-label={t("inbox.notes.bold")}
          onMouseDown={(event) => {
            event.preventDefault();
            run("bold");
          }}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="note-tool"
          title={t("inbox.notes.bullets")}
          aria-label={t("inbox.notes.bullets")}
          onMouseDown={(event) => {
            event.preventDefault();
            run("insertUnorderedList");
          }}
        >
          •
        </button>
        <button
          type="button"
          className="note-tool"
          title={t("inbox.notes.numbers")}
          aria-label={t("inbox.notes.numbers")}
          onMouseDown={(event) => {
            event.preventDefault();
            run("insertOrderedList");
          }}
        >
          1.
        </button>
      </div>
      <div
        ref={editorRef}
        className="note-editor-body"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder || t("inbox.notePlaceholder")}
        onInput={emit}
        onBlur={emit}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
            event.preventDefault();
            run("bold");
          }
        }}
      />
    </div>
  );
}

function RichTextField({
  value,
  onChange,
  placeholder,
  baseFont = "Georgia",
  baseSizePt = 12,
  baseBold = false,
  baseItalic = false
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  baseFont?: string;
  baseSizePt?: number;
  baseBold?: boolean;
  baseItalic?: boolean;
}) {
  const t = useT();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialRef = useRef(value || "");
  const savedRangeRef = useRef<globalThis.Range | null>(null);
  const [pickedFont, setPickedFont] = useState<string | undefined>(undefined);
  const [pickedSize, setPickedSize] = useState<string | undefined>(undefined);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    const family = `"${baseFont.replace(/"/g, "")}", Georgia, serif`;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>
      html, body {
        background: #fff;
        color: #2a2620;
        font-family: ${family};
        font-size: ${baseSizePt}pt;
        font-weight: ${baseBold ? 700 : 400};
        font-style: ${baseItalic ? "italic" : "normal"};
        line-height: 1.45;
        margin: 0;
        min-height: 100%;
      }
      body {
        outline: none;
        padding: 0.65rem 0.75rem;
      }
      body:empty:before {
        color: #9a9286;
        content: attr(data-placeholder);
        pointer-events: none;
      }
    </style></head><body contenteditable="true" data-placeholder="${(
      placeholder || t("richtext.placeholder")
    ).replace(/"/g, "&quot;")}"></body></html>`);
    doc.close();

    const body = doc.body;
    body.innerHTML = initialRef.current || "";

    const emit = () => onChangeRef.current(body.innerHTML);
    // Only remember selection from real editor interaction. Do NOT listen to
    // selectionchange — opening the toolbar menus collapses the iframe
    // selection and would wipe the saved range before font/size apply.
    const rememberSelection = () => {
      const selection = doc.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (body.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    };
    body.addEventListener("input", emit);
    body.addEventListener("blur", emit);
    body.addEventListener("keyup", rememberSelection);
    body.addEventListener("mouseup", rememberSelection);

    return () => {
      body.removeEventListener("input", emit);
      body.removeEventListener("blur", emit);
      body.removeEventListener("keyup", rememberSelection);
      body.removeEventListener("mouseup", rememberSelection);
    };
    // Base look is updated in a separate effect so we don't wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) return;
    body.style.fontFamily = `"${baseFont.replace(/"/g, "")}", Georgia, serif`;
    body.style.fontSize = `${baseSizePt}pt`;
    body.style.fontWeight = baseBold ? "700" : "400";
    body.style.fontStyle = baseItalic ? "italic" : "normal";
  }, [baseFont, baseSizePt, baseBold, baseItalic]);

  function withDoc(fn: (doc: Document, body: HTMLElement) => void) {
    const doc = iframeRef.current?.contentDocument;
    const body = doc?.body;
    if (!doc || !body) return;
    body.focus();
    const savedRange = savedRangeRef.current;
    if (savedRange) {
      try {
        if (body.contains(savedRange.commonAncestorContainer)) {
          const selection = doc.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(savedRange);
        }
      } catch {
        // Detached range after DOM edits — ignore and use current selection.
      }
    }
    fn(doc, body);
    const selection = doc.getSelection();
    if (selection && selection.rangeCount > 0) {
      try {
        savedRangeRef.current = selection.getRangeAt(0).cloneRange();
      } catch {
        /* ignore */
      }
    }
    onChangeRef.current(body.innerHTML);
  }

  function run(cmd: string, arg?: string) {
    withDoc((doc) => {
      doc.execCommand("styleWithCSS", false, "true");
      doc.execCommand(cmd, false, arg);
    });
  }

  function applyInlineStyle(patch: { fontFamily?: string; fontSize?: string }) {
    withDoc((doc, body) => {
      const sel = doc.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

      const applyToElement = (el: HTMLElement) => {
        if (patch.fontFamily) el.style.fontFamily = patch.fontFamily;
        if (patch.fontSize) el.style.fontSize = patch.fontSize;
      };

      const forceOnDescendants = (root: HTMLElement) => {
        root.querySelectorAll("span, font").forEach((child) => {
          const el = child as HTMLElement;
          if (patch.fontFamily) el.style.fontFamily = patch.fontFamily!;
          if (patch.fontSize) el.style.fontSize = patch.fontSize!;
        });
      };

      if (sel.isCollapsed) {
        let node: Node | null = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        const existing =
          node instanceof HTMLElement
            ? node.closest("span[style], font")
            : null;
        if (existing instanceof HTMLElement) {
          applyToElement(existing);
          forceOnDescendants(existing);
          return;
        }
        // No selection and no styled span: apply to all current text so the
        // dropdown always has a visible effect; empty editor gets a caret span.
        const plain = (body.textContent || "").replace(/\u200b/g, "").trim();
        if (plain) {
          const wrap = doc.createElement("span");
          applyToElement(wrap);
          while (body.firstChild) wrap.appendChild(body.firstChild);
          forceOnDescendants(wrap);
          body.appendChild(wrap);
          const pick = doc.createRange();
          pick.selectNodeContents(wrap);
          pick.collapse(false);
          sel.removeAllRanges();
          sel.addRange(pick);
          return;
        }
        const span = doc.createElement("span");
        applyToElement(span);
        span.appendChild(doc.createTextNode("\u200b"));
        range.insertNode(span);
        const next = doc.createRange();
        next.setStart(span.firstChild || span, 1);
        next.collapse(true);
        sel.removeAllRanges();
        sel.addRange(next);
        return;
      }

      const span = doc.createElement("span");
      applyToElement(span);
      span.appendChild(range.extractContents());
      // Legacy <font> from execCommand can trap size; unwrap into styled spans.
      span.querySelectorAll("font").forEach((fontEl) => {
        const replacement = doc.createElement("span");
        const face = fontEl.getAttribute("face");
        if (face) replacement.style.fontFamily = face;
        const legacySize = fontEl.getAttribute("size");
        if (legacySize && !replacement.style.fontSize) {
          const map: Record<string, string> = {
            "1": "10pt",
            "2": "11pt",
            "3": "12pt",
            "4": "14pt",
            "5": "18pt",
            "6": "24pt",
            "7": "36pt"
          };
          replacement.style.fontSize = map[legacySize] || "12pt";
        }
        while (fontEl.firstChild) replacement.appendChild(fontEl.firstChild);
        fontEl.replaceWith(replacement);
      });
      // Always overwrite — otherwise an older font-family on a nested span
      // wins and the dropdown looks like it does nothing.
      forceOnDescendants(span);
      range.insertNode(span);
      sel.removeAllRanges();
      const pick = doc.createRange();
      pick.selectNodeContents(span);
      sel.addRange(pick);
    });
  }

  function applyFont(font: string) {
    setPickedFont(font);
    applyInlineStyle({ fontFamily: `"${font.replace(/"/g, "")}"` });
  }

  function applySize(size: string) {
    setPickedSize(size);
    applyInlineStyle({ fontSize: size });
  }

  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
        <div
          className="rich-tool-group"
          role="group"
          aria-label={t("richtext.group.perLetter")}
        >
          <button
            type="button"
            className="rich-tool"
            title={t("richtext.bold")}
            onMouseDown={(e) => {
              e.preventDefault();
              run("bold");
            }}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className="rich-tool"
            title={t("richtext.italic")}
            onMouseDown={(e) => {
              e.preventDefault();
              run("italic");
            }}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className="rich-tool"
            title={t("richtext.underline")}
            onMouseDown={(e) => {
              e.preventDefault();
              run("underline");
            }}
          >
            <span className="rich-tool-u">U</span>
          </button>
        </div>
        <RichMenuSelect
          label={t("richtext.font")}
          value={pickedFont}
          className="rich-font"
          options={PRICELIST_FONTS.map((font) => ({
            value: font,
            label: font
          }))}
          onPick={(v) => applyFont(v)}
        />
        <RichMenuSelect
          label={t("richtext.size")}
          value={pickedSize}
          className="rich-size"
          options={RICH_TEXT_SIZES.map((pt) => ({
            value: `${pt}pt`,
            label: String(pt)
          }))}
          onPick={(v) => applySize(v)}
        />
        <label className="rich-color" title={t("richtext.color")}>
          <input
            type="color"
            defaultValue="#2a2620"
            onMouseDown={(e) => e.preventDefault()}
            onChange={(event) => run("foreColor", event.target.value)}
          />
        </label>
      </div>
      <iframe
        className="rich-frame"
        title={t("richtext.frameTitle")}
        ref={iframeRef}
      />
    </div>
  );
}

function sectionsFromApplication(
  application: Application | null,
  lang: PriceLang
): ApplicationTextSection[] {
  if (application?.sections?.length) {
    return application.sections.map((s) => ({ ...s }));
  }
  const out: ApplicationTextSection[] = [];
  if (application?.textAboutWorks?.trim()) {
    out.push({
      id: "sec-legacy-works",
      heading: application.headingAboutWorks || headingDefaults(lang).aboutWorks,
      bodyHtml: `<p>${application.textAboutWorks
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>")}</p>`
    });
  }
  if (application?.textAboutProject?.trim()) {
    out.push({
      id: "sec-legacy-project",
      heading:
        application.headingAboutProject || headingDefaults(lang).aboutProject,
      bodyHtml: `<p>${application.textAboutProject
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>")}</p>`
    });
  }
  return out;
}

function applicationKindLabel(kind: ApplicationKind, lang: PriceLang = "es"): string {
  const map: Record<ApplicationKind, Record<PriceLang, string>> = {
    concurso: { es: "Concurso", en: "Competition", de: "Wettbewerb" },
    beca: { es: "Beca", en: "Grant / stipend", de: "Stipendium" },
    residencia: { es: "Residencia", en: "Residency", de: "Residenz" },
    otro: { es: "Otro", en: "Other", de: "Sonstiges" }
  };
  return map[kind]?.[lang] ?? map.concurso.es;
}

function isDefaultAppHeading(
  value: string | undefined,
  field: "works" | "aboutWorks" | "aboutProject"
): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return true;
  return (Object.values(APP_HEADING_DEFAULTS) as Array<(typeof APP_HEADING_DEFAULTS)["es"]>).some(
    (d) => d[field] === trimmed
  );
}


function SeriesPage({
  inventory,
  setInventory,
  onError,
  onToast,
  onOpenArtwork
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onOpenArtwork: (artworkId: string) => void;
}) {
  const t = useT();
  // Series come from paintings (plus any already saved metadata).
  // Skip blank / «sin serie» — those works have no series to describe.
  const names = uniqueValues([
    ...inventory.artworks.map((a) => a.series),
    ...inventory.seriesInfo.map((s) => s.name)
  ])
    .filter((name) => name.trim() && !isNoSeries(name))
    .sort((a, b) => a.localeCompare(b, "es"));
  const [selectedName, setSelectedName] = useState<string | null>(
    names[0] ?? null
  );
  const [sidebarSplitPct, setSidebarSplitPct] = useState(() => {
    try {
      const raw = Number(localStorage.getItem("series-sidebar-split"));
      if (Number.isFinite(raw) && raw >= 18 && raw <= 55) return raw;
    } catch {
      /* ignore */
    }
    return 28;
  });
  const splitDragging = useRef(false);

  useEffect(() => {
    setSelectedName((current) =>
      current && names.some((name) => name === current)
        ? current
        : names[0] ?? null
    );
  }, [names.join("\0")]);

  const info =
    inventory.seriesInfo.find(
      (s) => s.name.toLowerCase() === (selectedName ?? "").toLowerCase()
    ) ?? null;
  const works = inventory.artworks.filter(
    (a) => (a.series ?? "").toLowerCase() === (selectedName ?? "").toLowerCase()
  );

  function onSplitPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    const layout = handle.parentElement;
    if (!layout) return;
    splitDragging.current = true;
    handle.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent) => {
      if (!splitDragging.current) return;
      const rect = layout.getBoundingClientRect();
      if (rect.width < 80) return;
      const fromLeft = ev.clientX - rect.left;
      const pct = Math.round((fromLeft / rect.width) * 100);
      const next = Math.min(55, Math.max(18, pct));
      setSidebarSplitPct(next);
      try {
        localStorage.setItem("series-sidebar-split", String(next));
      } catch {
        /* ignore */
      }
    };
    const onUp = () => {
      splitDragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <section className="list-page series-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{t("series.page.eyebrow")}</p>
          <h2>{t("series.page.title")}</h2>
          <p className="page-lead">{t("series.page.lead")}</p>
        </div>
      </div>

      <div
        className="series-layout"
        style={{
          gridTemplateColumns: `minmax(160px, ${sidebarSplitPct}fr) 8px minmax(280px, ${100 - sidebarSplitPct}fr)`
        }}
      >
        <aside className="series-sidebar">
          <div className="series-name-list">
            {names.length === 0 ? (
              <p className="muted small-note">{t("series.empty.sidebar")}</p>
            ) : (
              names.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`series-name-btn${
                    selectedName === name ? " active" : ""
                  }`}
                  onClick={() => setSelectedName(name)}
                >
                  <span>{name}</span>
                  <span className="muted">
                    {
                      inventory.artworks.filter(
                        (a) => (a.series ?? "").toLowerCase() === name.toLowerCase()
                      ).length
                    }
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div
          className="app-split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("series.splitHandle")}
          onPointerDown={onSplitPointerDown}
        />

        <div className="series-detail">
          {!selectedName ? (
            <div className="empty-friendly">
              <p>{t("series.empty.pick")}</p>
            </div>
          ) : (
            <SeriesDetailPanel
              name={selectedName}
              info={info}
              works={works}
              inventory={inventory}
              setInventory={setInventory}
              onError={onError}
              onToast={onToast}
              onOpenArtwork={onOpenArtwork}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function SeriesDetailPanel({
  name,
  info,
  works,
  inventory,
  setInventory,
  onError,
  onToast,
  onOpenArtwork
}: {
  name: string;
  info: SeriesInfo | null;
  works: Artwork[];
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onOpenArtwork: (artworkId: string) => void;
}) {
  const t = useT();
  const [texts, setTexts] = useState<SeriesText[]>(info?.texts ?? []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ topic: string; body: string }>({
    topic: "",
    body: ""
  });
  const [worksOpen, setWorksOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsBusy, setDocsBusy] = useState(false);
  const [docsPickMode, setDocsPickMode] = useState<null | "save" | "remove">(
    null
  );
  const [docsDescribeId, setDocsDescribeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const docsDrop = useFileDragOver(!docsBusy);

  const docs = inventory.images.filter(
    (image) =>
      image.targetType === "series" &&
      image.targetId === info?.id &&
      (image.category === "document" || image.category === "extra")
  );
  const imageDocs = docs.filter((image) =>
    isImageFile(documentDisplayName(image, ""))
  );

  useEffect(() => {
    setTexts(info?.texts ?? []);
    setOpenId(null);
    setEditingId(null);
    setWorksOpen(false);
    setDocsOpen(false);
    setDocsPickMode(null);
    setDocsDescribeId(null);
  }, [info?.id, name]);

  async function save(nextTexts = texts) {
    setSaving(true);
    try {
      const data = await requireApi("saveSeriesInfo", t)({
        id: info?.id,
        name,
        texts: nextTexts,
        notes: info?.notes ?? ""
      });
      setInventory(data);
      onToast(t("series.toast.saved"));
    } catch (error) {
      onError(error instanceof Error ? error.message : t("common.error.save"));
    } finally {
      setSaving(false);
    }
  }

  function openEditText(text: SeriesText) {
    setEditingId(text.id);
    setEditDraft({ topic: text.topic, body: text.body });
    setOpenId(text.id);
  }

  function closeEditText() {
    setEditingId(null);
  }

  function applyEditText() {
    if (!editingId) return;
    setTexts((list) =>
      list.map((item) =>
        item.id === editingId
          ? { ...item, topic: editDraft.topic, body: editDraft.body }
          : item
      )
    );
    setEditingId(null);
  }

  function addText() {
    const id = `txt-${Date.now()}`;
    const nextText: SeriesText = {
      id,
      topic: t("series.texts.new"),
      body: ""
    };
    setTexts([...texts, nextText]);
    openEditText(nextText);
  }

  function removeText(id: string) {
    const next = texts.filter((item) => item.id !== id);
    setTexts(next);
    if (openId === id) setOpenId(null);
    if (editingId === id) setEditingId(null);
  }

  async function ensureSeriesId(): Promise<string | null> {
    if (info?.id) return info.id;
    const data = await requireApi("saveSeriesInfo", t)({
      name,
      texts,
      notes: info?.notes ?? ""
    });
    setInventory(data);
    const seriesId = data.seriesInfo.find(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    )?.id;
    if (!seriesId) {
      onError(t("series.error.create"));
      return null;
    }
    return seriesId;
  }

  async function addDocument() {
    setDocsBusy(true);
    try {
      const seriesId = await ensureSeriesId();
      if (!seriesId) return;
      const result = await window.inventoryApi.importDocument("series", seriesId);
      if (!result) return;
      setInventory(result.inventory);
      setDocsOpen(true);
      const imported = result.image as ArtworkImage | undefined;
      if (imported?.id) setDocsDescribeId(imported.id);
      onToast(t("series.toast.docAdded"));
    } catch (error) {
      onError(
        error instanceof Error ? error.message : t("common.error.save")
      );
    } finally {
      setDocsBusy(false);
    }
  }

  async function importDroppedDocuments(files: File[]) {
    if (!files.length) return;
    setDocsBusy(true);
    try {
      const seriesId = await ensureSeriesId();
      if (!seriesId) return;
      let lastImported: ArtworkImage | undefined;
      let nextInventory: InventoryData | null = null;
      let importedCount = 0;
      for (const file of files) {
        const sourcePath = pathForDroppedFile(file);
        if (!sourcePath) continue;
        const result = await window.inventoryApi.importImageFromPath(
          sourcePath,
          "series",
          seriesId,
          "document"
        );
        if (!result) continue;
        nextInventory = result.inventory;
        lastImported = result.image as ArtworkImage | undefined;
        importedCount += 1;
      }
      if (nextInventory) {
        setInventory(nextInventory);
        setDocsOpen(true);
        if (lastImported?.id) setDocsDescribeId(lastImported.id);
        onToast(
          importedCount > 1
            ? t("series.toast.docsAdded", { count: importedCount })
            : t("series.toast.docAdded")
        );
      } else {
        onError(t("artwork.error.dropFailed"));
      }
    } catch (error) {
      onError(
        error instanceof Error ? error.message : t("common.error.save")
      );
    } finally {
      setDocsBusy(false);
    }
  }

  async function saveCopyOf(image: ArtworkImage) {
    setDocsPickMode(null);
    if (!image.absolutePath) return;
    await window.inventoryApi.saveImageCopy(
      image.absolutePath,
      image.caption || documentDisplayName(image, t("common.documentOne"))
    );
  }

  async function removeOf(image: ArtworkImage) {
    setDocsPickMode(null);
    const data = await window.inventoryApi.deleteImage(image.id);
    setInventory(data);
  }

  return (
    <div className="series-panel">
      <div className="related-head">
        <h3>{name}</h3>
        <button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>

      <div className="series-texts-head">
        <h4>{t("series.texts.title")}</h4>
        <button type="button" className="ghost" onClick={addText}>
          {t("series.texts.add")}
        </button>
      </div>
      <p className="muted small-note">{t("series.texts.hint")}</p>

      {texts.length === 0 ? (
        <div className="empty-friendly">
          <p>{t("series.texts.empty")}</p>
          <button type="button" onClick={addText}>
            {t("common.addFirst")}
          </button>
        </div>
      ) : (
        <div className="series-text-list">
          {texts.map((text) => {
            const open = openId === text.id;
            const preview =
              text.body.trim().slice(0, 90) +
              (text.body.trim().length > 90 ? "…" : "");
            return (
              <div className={`series-text-card${open ? " open" : ""}`} key={text.id}>
                <button
                  type="button"
                  className="series-text-summary"
                  onClick={() => setOpenId(open ? null : text.id)}
                >
                  <span className="series-text-line">
                    <strong>{text.topic || t("common.noTopic")}</strong>
                    {preview ? (
                      <span className="series-text-preview">{preview}</span>
                    ) : null}
                  </span>
                  <span className="series-text-chevron">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="series-text-body">
                    <div className="series-text-readonly">
                      {text.body.trim() ? (
                        <p className="series-text-readonly-body">{text.body}</p>
                      ) : (
                        <p className="muted small-note">{t("series.texts.emptyBody")}</p>
                      )}
                    </div>
                    <div className="series-text-actions">
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => openEditText(text)}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        className="ghost danger small"
                        onClick={() => removeText(text.id)}
                      >
                        {t("series.texts.remove")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingId && (
        <div className="modal-backdrop" onClick={closeEditText}>
          <div
            className="modal series-text-edit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{t("series.texts.editTitle")}</h3>
              <button
                type="button"
                className="icon-button ghost"
                onClick={closeEditText}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <label className="field">
                {t("series.texts.topic")}
                <input
                  value={editDraft.topic}
                  placeholder={t("series.texts.topicPlaceholder")}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      topic: event.target.value
                    }))
                  }
                  autoFocus
                />
              </label>
              <label className="field">
                {t("series.texts.body")}
                <textarea
                  rows={10}
                  value={editDraft.body}
                  placeholder={t("series.texts.bodyPlaceholder")}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      body: event.target.value
                    }))
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={closeEditText}>
                {t("common.cancel")}
              </button>
              <button type="button" onClick={applyEditText}>
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`artwork-docs${docsOpen ? " open" : ""}${
          docsDrop.over ? " is-file-drag" : ""
        }`}
        {...docsDrop.handlers}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          docsDrop.reset();
          void importDroppedDocuments(filesFromDropEvent(event));
        }}
      >
        <button
          type="button"
          className="series-works-toggle"
          onClick={() => setDocsOpen((value) => !value)}
          aria-expanded={docsOpen}
        >
          <span>{t("artwork.docs", { count: docs.length })}</span>
          <span className="series-works-chevron" aria-hidden>
            {docsOpen ? "▾" : "▸"}
          </span>
        </button>
        {docsOpen ? (
          <div className="artwork-docs-body">
            <div className="artwork-docs-toolbar">
              <p className="muted small-note">{t("series.docs.hint")}</p>
              <div className="artwork-docs-actions">
                <button
                  type="button"
                  className="ghost small doc-action-add"
                  disabled={docsBusy}
                  onClick={() => void addDocument()}
                >
                  {docsBusy ? "…" : t("artwork.docs.add")}
                </button>
                <button
                  type="button"
                  className="ghost small doc-action-save"
                  disabled={imageDocs.length === 0}
                  title={t("media.saveCopyElsewhere")}
                  onClick={() => setDocsPickMode("save")}
                >
                  {t("media.saveCopy")}
                </button>
                <button
                  type="button"
                  className="ghost small doc-action-remove"
                  disabled={docs.length === 0}
                  onClick={() => setDocsPickMode("remove")}
                >
                  {t("common.remove")}
                </button>
              </div>
            </div>
            {docs.length === 0 ? (
              <p className="muted small-note">{t("series.docs.empty")}</p>
            ) : (
              <div className="doc-list">
                {docs.map((image) => (
                  <DocumentRow
                    key={image.id}
                    image={image}
                    setInventory={setInventory}
                    autoEdit={docsDescribeId === image.id}
                    onAutoEditHandled={() => setDocsDescribeId(null)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}
        {docsPickMode === "save" ? (
          <DocumentPickModal
            documents={imageDocs}
            title={t("artwork.docs.pickSave")}
            emptyLabel={t("artwork.docs.noImages")}
            onPick={(image) => void saveCopyOf(image)}
            onClose={() => setDocsPickMode(null)}
          />
        ) : null}
        {docsPickMode === "remove" ? (
          <DocumentPickModal
            documents={docs}
            title={t("artwork.docs.pickRemove")}
            emptyLabel={t("series.docs.empty")}
            onPick={(image) => void removeOf(image)}
            onClose={() => setDocsPickMode(null)}
          />
        ) : null}
      </div>

      <div className={`series-works${worksOpen ? " open" : ""}`}>
        <button
          type="button"
          className="series-works-toggle"
          onClick={() => setWorksOpen((open) => !open)}
          aria-expanded={worksOpen}
        >
          <span>
            {t("series.works", { count: works.length })}
          </span>
          <span className="series-works-chevron" aria-hidden>
            {worksOpen ? "▾" : "▸"}
          </span>
        </button>
        {worksOpen ? (
          works.length === 0 ? (
            <p className="muted small-note">{t("series.works.empty")}</p>
          ) : (
            <ul className="series-work-list">
              {works.map((art) => (
                <li key={art.id}>
                  <button
                    type="button"
                    className="series-work-row"
                    onClick={() => onOpenArtwork(art.id)}
                  >
                    <span className="series-work-title">{art.title}</span>
                    {art.yearMade ? (
                      <span className="series-work-year">{art.yearMade}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}

function ExampleLibraryPage({
  inventory,
  setInventory,
  onError,
  onToast,
  onDirtyChange,
  saveRef
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: MutableRefObject<null | (() => Promise<boolean>)>;
}) {
  const t = useT();
  const stored = useMemo(
    () => (inventory.textGeneratorExamples ?? []).map(normalizeTextExample),
    [inventory.textGeneratorExamples]
  );
  const [examples, setExamples] = useState<TextGeneratorExample[]>(stored);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newCategory, setNewCategory] = useState("");
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moveNewName, setMoveNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteBulk, setDeleteBulk] = useState<{
    ids: string[];
    section: string;
  } | null>(null);

  useEffect(() => {
    setExamples(stored);
  }, [stored]);

  const dirty = JSON.stringify(examples) !== JSON.stringify(stored);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist(): Promise<boolean> {
    setSaving(true);
    try {
      const cleaned = examples
        .map(normalizeTextExample)
        .filter((example) => example.topic.trim() || example.body.trim());
      const data = await requireApi("saveTextGeneratorExamples", t)(cleaned);
      setInventory(data);
      onDirtyChange?.(false);
      onToast(t("examples.toast.saved"));
      return true;
    } catch (error) {
      onError(
        error instanceof Error ? error.message : t("examples.error.save")
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => persist();
    return () => {
      if (saveRef) saveRef.current = null;
    };
  });

  function addExample(category = "") {
    const id = `example-${Date.now()}`;
    setSearch("");
    setExamples((current) => [
      { id, topic: "", body: "", category },
      ...current
    ]);
    setEditingId(id);
    if (category) {
      setCollapsed((current) => ({ ...current, [category]: false }));
    }
  }

  function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    setExtraCategories((current) =>
      current.includes(name) ? current : [...current, name]
    );
    setNewCategory("");
    setAddingCategory(false);
    setCollapsed((current) => ({ ...current, [name]: false }));
    addExample(name);
  }

  function update(id: string, patch: Partial<TextGeneratorExample>) {
    setExamples((current) =>
      current.map((example) =>
        example.id === id ? { ...example, ...patch } : example
      )
    );
  }

  function remove(id: string) {
    setExamples((current) => current.filter((example) => example.id !== id));
    setSelectedIds((current) => current.filter((item) => item !== id));
    if (editingId === id) setEditingId(null);
  }

  function removeMany(ids: string[]) {
    const removeSet = new Set(ids);
    setExamples((current) =>
      current.filter((example) => !removeSet.has(example.id))
    );
    setSelectedIds((current) => current.filter((item) => !removeSet.has(item)));
    if (editingId && removeSet.has(editingId)) setEditingId(null);
    if (viewingId && removeSet.has(viewingId)) setViewingId(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function openMove(ids: string[]) {
    if (ids.length === 0) return;
    setMoveIds(ids);
    setMoveTarget("");
    setMoveNewName("");
  }

  function resolveTargetCategory(): string | null {
    if (moveTarget === "__new__") {
      const name = moveNewName.trim();
      return name || null;
    }
    if (moveTarget === "__none__") return "";
    return moveTarget;
  }

  function applyMove() {
    if (!moveIds) return;
    const target = resolveTargetCategory();
    if (target == null) return;
    const idSet = new Set(moveIds);
    const next = examples.map((example) =>
      idSet.has(example.id) ? { ...example, category: target } : example
    );
    setExamples(next);
    // Emptying a whole category by moving everything out is how merging works
    // here, so the drained category should not linger as an empty heading.
    const stillUsed = new Set(next.map((e) => (e.category ?? "").trim()));
    setExtraCategories((current) =>
      current.filter((name) => name === target || stillUsed.has(name))
    );
    if (target) {
      setExtraCategories((current) =>
        current.includes(target) ? current : [...current, target]
      );
      setCollapsed((current) => ({ ...current, [target]: false }));
    }
    setSelectedIds([]);
    setMoveIds(null);
  }

  const list = examples.filter((example) =>
    exampleMatchesSearch(example, search)
  );

  const allCategoryNames = useMemo(() => {
    const fromExamples = examples.map((e) => e.category?.trim() || "");
    const set = new Set([...fromExamples, ...extraCategories]);
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [examples, extraCategories]);

  const categoryNames = useMemo(() => {
    const fromExamples = list.map((e) => e.category?.trim() || "");
    const set = new Set([...fromExamples, ...extraCategories]);
    const named = [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
    const hasEmpty = set.has("") || list.some((e) => !(e.category ?? "").trim());
    return hasEmpty ? ["", ...named] : named;
  }, [list, extraCategories]);

  function categoryLabel(cat: string) {
    return cat || t("examples.uncategorized");
  }

  function renderMoveModal() {
    if (moveIds == null) return null;
    const close = () => setMoveIds(null);
    return (
      <div className="modal-backdrop" onClick={close}>
        <div
          className="modal confirm-modal examples-move-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-head">
            <h3>{t("examples.moveModal.title")}</h3>
          </div>
          <p className="confirm-message">
            {t("examples.moveModal.count", { n: moveIds.length })}
          </p>
          <label className="field">
            {t("examples.moveModal.target")}
            <select
              value={moveTarget}
              onChange={(event) => setMoveTarget(event.target.value)}
            >
              <option value="">{t("examples.moveModal.choose")}</option>
              <option value="__none__">{t("examples.uncategorized")}</option>
              {allCategoryNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="__new__">{t("examples.moveModal.new")}</option>
            </select>
          </label>
          {moveTarget === "__new__" ? (
            <label className="field">
              {t("examples.categoryName")}
              <input
                autoFocus
                value={moveNewName}
                onChange={(event) => setMoveNewName(event.target.value)}
              />
            </label>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={close}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={
                !moveTarget ||
                (moveTarget === "__new__" && !moveNewName.trim())
              }
              onClick={applyMove}
            >
              {t("examples.moveModal.confirm")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderCard(example: TextGeneratorExample) {
    const editing = editingId === example.id;
    const body = example.body.trim();
    const selected = selectedIds.includes(example.id);
    return (
      <article
        className={`example-card${editing ? " is-editing" : ""}${
          selected ? " is-selected" : ""
        }`}
        key={example.id}
      >
        {editing ? (
          <>
            <input
              className="example-topic-input"
              value={example.topic}
              placeholder={t("examples.topicPlaceholder")}
              autoFocus
              onChange={(event) =>
                update(example.id, { topic: event.target.value })
              }
            />
            <textarea
              rows={12}
              value={example.body}
              placeholder={t("examples.bodyPlaceholder")}
              onChange={(event) =>
                update(example.id, { body: event.target.value })
              }
            />
            <div className="example-card-actions">
              <button
                type="button"
                className="ghost danger small"
                onClick={() => remove(example.id)}
              >
                {t("common.erase")}
              </button>
              <button
                type="button"
                className="ghost small"
                onClick={() => openMove([example.id])}
              >
                {t("examples.move")}
              </button>
              <button
                type="button"
                className="small"
                onClick={() => setEditingId(null)}
              >
                {t("common.done")}
              </button>
            </div>
          </>
        ) : (
          <div className="example-row">
            <input
              className="example-select"
              type="checkbox"
              checked={selected}
              onChange={() => toggleSelect(example.id)}
              onClick={(event) => event.stopPropagation()}
              aria-label={t("examples.select")}
            />
            <button
              type="button"
              className="example-row-main example-row-open"
              onClick={() => setViewingId(example.id)}
              title={t("examples.view")}
            >
              <strong>{example.topic || t("common.noTopic")}</strong>
              <p className="example-card-body">
                {body || (
                  <span className="muted">{t("examples.noTextYet")}</span>
                )}
              </p>
            </button>
            <span className="example-row-count muted small-note">
              {t("examples.words", { n: countWords(body) })}
            </span>
            <div className="example-row-actions">
              <button
                type="button"
                className="ghost small"
                onClick={() => setViewingId(example.id)}
              >
                {t("examples.view")}
              </button>
              <button
                type="button"
                className="ghost small"
                onClick={() => openMove([example.id])}
              >
                {t("examples.move")}
              </button>
              <button
                type="button"
                className="small"
                onClick={() => setEditingId(example.id)}
              >
                {t("common.edit")}
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  const viewing = viewingId
    ? examples.find((example) => example.id === viewingId)
    : null;

  return (
    <section className="list-page examples-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{t("examples.eyebrow")}</p>
          <h2>{t("examples.title")}</h2>
          <p className="page-lead">{t("examples.leadLong")}</p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setAddingCategory((current) => !current)}
          >
            {t("examples.addCategory")}
          </button>
          <button
            type="button"
            className="cuentas-primary"
            disabled={!dirty || saving}
            onClick={() => void persist()}
          >
            {saving
              ? t("common.saving")
              : dirty
                ? t("examples.saveChanges")
                : t("examples.allSaved")}
          </button>
        </div>
      </div>

      <div className="examples-toolbar">
        <input
          className="search-input grow"
          placeholder={t("examples.searchLong")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span className="count-pill">
          {search
            ? t("examples.count", {
                n: list.length,
                total: examples.length
              })
            : t("examples.countTotal", { n: examples.length })}
        </span>
      </div>

      {addingCategory ? (
        <div className="examples-category-add">
          <input
            autoFocus
            value={newCategory}
            placeholder={t("examples.categoryName")}
            onChange={(event) => setNewCategory(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCategory();
              }
            }}
          />
          <button type="button" onClick={addCategory}>
            {t("common.add")}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setAddingCategory(false);
              setNewCategory("");
            }}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="examples-selection-bar">
          <span>
            {t("examples.moveModal.count", { n: selectedIds.length })}
          </span>
          <div className="row-actions">
            <button
              type="button"
              className="ghost small"
              onClick={() => setSelectedIds([])}
            >
              {t("examples.clearSelection")}
            </button>
            <button type="button" onClick={() => openMove(selectedIds)}>
              {t("examples.moveSelected")}
            </button>
          </div>
        </div>
      ) : null}

      {examples.length === 0 ? (
        <div className="empty-state">{t("examples.emptyLong")}</div>
      ) : list.length === 0 ? (
        <p className="muted">{t("examples.noMatch")}</p>
      ) : (
        <div className="examples-categories">
          {categoryNames.map((cat) => {
            const key = cat || "__none__";
            const items = list.filter(
              (example) => (example.category ?? "").trim() === cat
            );
            if (items.length === 0 && !extraCategories.includes(cat)) {
              return null;
            }
            const isCollapsed = collapsed[key] !== false;
            const label = categoryLabel(cat);
            return (
              <section className="examples-category" key={key}>
                <button
                  type="button"
                  className="examples-category-head"
                  onClick={() =>
                    setCollapsed((current) => ({
                      ...current,
                      [key]: current[key] === false
                    }))
                  }
                >
                  <span className="examples-category-caret" aria-hidden>
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                  <span className="examples-category-name">{label}</span>
                  <span className="count-pill">{items.length}</span>
                </button>
                {!isCollapsed ? (
                  <div className="examples-category-body">
                    <div className="examples-category-actions">
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => addExample(cat)}
                      >
                        {t("examples.add")}
                      </button>
                      <div className="examples-category-actions-end">
                        <button
                          type="button"
                          className="ghost small"
                          disabled={items.length === 0}
                          onClick={() => openMove(items.map((item) => item.id))}
                        >
                          {t("examples.moveAll")}
                        </button>
                        <button
                          type="button"
                          className="danger-solid small"
                          disabled={items.length === 0}
                          onClick={() =>
                            setDeleteBulk({
                              ids: items.map((item) => item.id),
                              section: label
                            })
                          }
                        >
                          {t("examples.deleteAll")}
                        </button>
                      </div>
                    </div>
                    <div className="examples-list">
                      {items.map((example) => renderCard(example))}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {dirty && (
        <p className="muted small-note examples-dirty-note">
          {t("examples.dirty")}
        </p>
      )}

      {viewing ? (
        <div
          className="modal-backdrop"
          onClick={() => setViewingId(null)}
        >
          <div
            className="modal confirm-modal examples-view-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{viewing.topic || t("common.noTopic")}</h3>
              <button
                type="button"
                className="ghost small"
                onClick={() => setViewingId(null)}
              >
                {t("common.close")}
              </button>
            </div>
            <p className="examples-view-body">
              {viewing.body.trim() || (
                <span className="muted">{t("examples.noTextYet")}</span>
              )}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setViewingId(null)}
              >
                {t("common.close")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(viewing.id);
                  setViewingId(null);
                }}
              >
                {t("common.edit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renderMoveModal()}

      {deleteBulk ? (
        <ConfirmDialog
          title={t("confirm.examplesBulk.title")}
          message={t("confirm.examplesBulk.message", {
            n: deleteBulk.ids.length,
            section: deleteBulk.section
          })}
          confirmLabel={t("common.deleteForever")}
          onConfirm={() => {
            removeMany(deleteBulk.ids);
            setDeleteBulk(null);
          }}
          onCancel={() => setDeleteBulk(null)}
        />
      ) : null}
    </section>
  );
}

const DATE_LOCALES: Record<Lang, string> = {
  es: "es-ES",
  en: "en-GB",
  de: "de-DE"
};

function shortDate(iso: string, lang: Lang): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  return new Date(time).toLocaleDateString(DATE_LOCALES[lang], {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function reminderInterval(reminder: ContactReminder): {
  value: number;
  unit: ReminderIntervalUnit;
} {
  const unitRaw = String(reminder.intervalUnit ?? "").toLowerCase();
  if (unitRaw === "days" || unitRaw === "day") {
    const raw = Number(reminder.intervalValue ?? reminder.intervalMonths ?? 1);
    return {
      value: Math.max(1, Math.round(Number.isFinite(raw) && raw > 0 ? raw : 1)),
      unit: "days"
    };
  }
  if (unitRaw === "months" || unitRaw === "month") {
    const raw = Number(reminder.intervalValue ?? reminder.intervalMonths ?? 1);
    return {
      value: Math.max(1, Math.round(Number.isFinite(raw) && raw > 0 ? raw : 1)),
      unit: "months"
    };
  }
  // Legacy rows only had intervalMonths.
  const raw = Number(reminder.intervalMonths ?? reminder.intervalValue ?? 1);
  return {
    value: Math.max(1, Math.round(Number.isFinite(raw) && raw > 0 ? raw : 1)),
    unit: "months"
  };
}

function reminderDueInfo(
  reminder: ContactReminder,
  now = Date.now()
): { due: boolean; overdue: boolean; daysUntil: number } {
  const { value, unit } = reminderInterval(reminder);
  const ms =
    unit === "days"
      ? value * 24 * 60 * 60 * 1000
      : value * 30.44 * 24 * 60 * 60 * 1000;
  // Countdown starts at creation; after «Ya lo hice» it restarts from lastDoneAt.
  const anchorRaw =
    String(reminder.lastDoneAt ?? "").trim() ||
    String(reminder.createdAt ?? "").trim();
  const parsed = Date.parse(anchorRaw);
  const anchor = Number.isFinite(parsed) ? parsed : now;
  const next = anchor + ms;
  const daysUntil = Math.ceil((next - now) / (24 * 60 * 60 * 1000));
  return {
    due: daysUntil <= 0,
    overdue: daysUntil < 0,
    daysUntil
  };
}

/** Days until a DD-MM-YYYY due date (negative = overdue). NaN if unset/invalid. */
function todoDueDaysUntil(dueDate: string | undefined, now = Date.now()): number {
  const ms = dateToMs(dueDate);
  if (!Number.isFinite(ms)) return NaN;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const due = new Date(ms);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function todoDueWithinWeek(dueDate: string | undefined, now = Date.now()): boolean {
  const days = todoDueDaysUntil(dueDate, now);
  return Number.isFinite(days) && days <= 7;
}

function reminderIntervalLabel(
  reminder: ContactReminder,
  t: Translate
): string {
  const { value, unit } = reminderInterval(reminder);
  return unit === "days"
    ? t("inbox.everyDays", { n: value })
    : t("inbox.everyMonths", { n: value });
}

/** Keep intervalUnit/value intact on the client even if a save round-trip is messy. */
function hydrateReminderClient(
  item: Partial<ContactReminder>
): ContactReminder {
  const { value, unit } = reminderInterval(item as ContactReminder);
  const out: ContactReminder = {
    id: String(item.id ?? ""),
    contactId: String(item.contactId ?? ""),
    channel: String(item.channel ?? "call"),
    intervalValue: value,
    intervalUnit: unit,
    note: String(item.note ?? ""),
    lastDoneAt: String(item.lastDoneAt ?? ""),
    createdAt: String(item.createdAt ?? new Date().toISOString()),
    updatedAt: String(item.updatedAt ?? item.createdAt ?? new Date().toISOString())
  };
  if (unit === "months") out.intervalMonths = value;
  return out;
}

/** Case-insensitive: every word in the query must appear somewhere in the text. */
function textMatchesKeywords(haystack: string, query: string): boolean {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  const hay = haystack.toLowerCase();
  return words.every((word) => hay.includes(word));
}

const TODO_MAX_CHARS = 110;

type ReminderDraft = {
  id?: string;
  contactId: string;
  channel: ReminderChannel;
  intervalValue: number;
  intervalUnit: ReminderIntervalUnit;
  note: string;
};

function InboxPage({
  inventory,
  setInventory,
  onError,
  onToast,
  onDirtyChange,
  saveRef,
  onOpenContact
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: MutableRefObject<null | (() => Promise<boolean>)>;
  onOpenContact: (contactId: string) => void;
}) {
  const { lang, t } = useLanguage();
  const storedReminders = useMemo(
    () => inventory.contactReminders ?? [],
    [inventory.contactReminders]
  );
  const storedNotes = useMemo(
    () => inventory.inboxNotes ?? [],
    [inventory.inboxNotes]
  );
  const storedTodos = useMemo(
    () => inventory.inboxTodos ?? [],
    [inventory.inboxTodos]
  );
  const [reminders, setReminders] = useState(storedReminders);
  const [notes, setNotes] = useState(storedNotes);
  const [todos, setTodos] = useState(storedTodos);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [draftTodo, setDraftTodo] = useState("");
  const [noteDraft, setNoteDraft] = useState<{
    id?: string;
    body: string;
    createdAt?: string;
  } | null>(null);
  const [noteFindOpen, setNoteFindOpen] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");
  const [noteSort, setNoteSort] = useState<
    "newest" | "oldest" | "longest" | "shortest" | "alpha"
  >("newest");
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(
    null
  );
  const [collapsed, setCollapsed] = useState({
    todo: true,
    reminders: true,
    notes: true
  });
  const lastSavedRef = useRef("");
  const failedSaveRef = useRef("");

  useEffect(() => {
    setReminders(storedReminders.map((item) => hydrateReminderClient(item)));
  }, [storedReminders]);
  useEffect(() => {
    setNotes(storedNotes);
  }, [storedNotes]);

  const payload = JSON.stringify({ reminders, notes, todos });
  const storedPayload = JSON.stringify({
    reminders: storedReminders,
    notes: storedNotes,
    todos: storedTodos
  });
  const dirty = payload !== storedPayload && payload !== lastSavedRef.current;

  useEffect(() => {
    // Don't clobber in-progress edits while dirty (date picker / typing).
    if (dirty) return;
    setTodos(storedTodos);
  }, [storedTodos, dirty]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist(): Promise<boolean> {
    const snapshot = JSON.stringify({ reminders, notes, todos });
    const localReminders = reminders;
    const localTodos = todos;
    setSaving(true);
    try {
      await requireApi("saveContactReminders", t)(localReminders);
      await requireApi("saveInboxNotes", t)(notes);
      const data = await requireApi("saveInboxTodos", t)(localTodos);
      // Guard against an outdated main process dropping intervalUnit
      // (that bug turned “cada 1 día” into “cada 1 mes” ≈ 31 days).
      const savedReminders = (data.contactReminders ?? []).map((saved) => {
        const local = localReminders.find((item) => item.id === saved.id);
        if (!local) return hydrateReminderClient(saved);
        return hydrateReminderClient({
          ...saved,
          intervalValue: local.intervalValue,
          intervalUnit: local.intervalUnit,
          lastDoneAt: local.lastDoneAt ?? saved.lastDoneAt,
          note: local.note ?? saved.note
        });
      });
      // Keep dueDate even if an older main process drops the field.
      const savedTodos = (data.inboxTodos ?? localTodos).map((saved, index) => {
        const local =
          localTodos.find((item) => item.id === saved.id) ?? localTodos[index];
        return {
          ...saved,
          dueDate: local?.dueDate ?? saved.dueDate ?? ""
        };
      });
      lastSavedRef.current = JSON.stringify({
        reminders: savedReminders,
        notes,
        todos: savedTodos
      });
      setReminders(savedReminders);
      setTodos(savedTodos);
      setInventory({
        ...data,
        contactReminders: savedReminders,
        inboxTodos: savedTodos
      });
      onDirtyChange?.(false);
      return true;
    } catch (error) {
      failedSaveRef.current = snapshot;
      onError(error instanceof Error ? error.message : t("common.error.save"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => persist();
    return () => {
      if (saveRef) saveRef.current = null;
    };
  });

  useEffect(() => {
    if (!dirty || saving) return;
    if (payload === failedSaveRef.current) return;
    const timer = window.setTimeout(() => void persist(), 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, payload]);

  const contacts = [...inventory.contacts].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );

  function methodLabel(value: ReminderChannel): string {
    const option = translatedLookupOptions(
      inventory,
      "contactMethod",
      lang
    ).find((item) => item.value === value);
    return option?.label ?? value;
  }

  function contactName(contactId: string): string {
    return (
      contacts.find((item) => item.id === contactId)?.name ??
      t("inbox.pickContact")
    );
  }

  function toggleSection(key: keyof typeof collapsed) {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  }

  const openTodos = todos
    .filter((todo) => !todo.doneAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const archivedTodos = todos
    .filter((todo) => Boolean(todo.doneAt))
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const filteredArchived = archivedTodos.filter((todo) =>
    textMatchesKeywords(todo.body, historySearch)
  );

  const todoTooLong = draftTodo.length > TODO_MAX_CHARS;

  function saveTodoInline() {
    const body = draftTodo.trim();
    if (!body || todoTooLong) return;
    setTodos((current) => [
      {
        id: `TODO-${Date.now()}`,
        body,
        doneAt: "",
        dueDate: "",
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
    setDraftTodo("");
  }

  function setTodoDueDate(id: string, dueDate: string) {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === id ? { ...todo, dueDate: dueDate || "" } : todo
      )
    );
  }

  function todoDueLabel(dueDate: string | undefined): string {
    const days = todoDueDaysUntil(dueDate);
    if (!Number.isFinite(days)) return "";
    if (days < 0) return t("inbox.todo.dueOverdue", { n: Math.abs(days) });
    if (days === 0) return t("inbox.todo.dueToday");
    return t("inbox.todo.dueInDays", { n: days });
  }

  function completeTodo(id: string) {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === id
          ? { ...todo, doneAt: new Date().toISOString() }
          : todo
      )
    );
    onToast(t("inbox.todo.archived"));
  }

  function restoreTodo(id: string) {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === id ? { ...todo, doneAt: "" } : todo
      )
    );
    setHistoryOpen(false);
    setCollapsed((current) => ({ ...current, todo: false }));
    onToast(t("inbox.todo.restored"));
  }

  function removeTodo(id: string) {
    setTodos((current) => current.filter((todo) => todo.id !== id));
  }

  function blankReminderDraft(): ReminderDraft {
    return {
      contactId: contacts[0]?.id ?? "",
      channel: "call",
      intervalValue: 1,
      intervalUnit: "days",
      note: ""
    };
  }

  function openNewReminder(preset?: Partial<ReminderDraft>) {
    setReminderDraft({ ...blankReminderDraft(), ...preset });
    setCollapsed((current) => ({ ...current, reminders: false }));
  }

  function openEditReminder(reminder: ContactReminder) {
    const { value, unit } = reminderInterval(reminder);
    setReminderDraft({
      id: reminder.id,
      contactId: reminder.contactId,
      channel: reminder.channel,
      intervalValue: value,
      intervalUnit: unit,
      note: reminder.note ?? ""
    });
  }

  function startReminder() {
    if (!reminderDraft) return;
    if (!reminderDraft.contactId) {
      onError(t("inbox.pickContact"));
      return;
    }
    const now = new Date().toISOString();
    const value = Math.max(1, Math.round(Number(reminderDraft.intervalValue) || 1));
    const unit: ReminderIntervalUnit =
      reminderDraft.intervalUnit === "days" ? "days" : "months";
    const existing = reminderDraft.id
      ? reminders.find((item) => item.id === reminderDraft.id)
      : undefined;
    const next = hydrateReminderClient({
      id: reminderDraft.id ?? `REM-${Date.now()}`,
      contactId: reminderDraft.contactId,
      channel: reminderDraft.channel || "call",
      intervalValue: value,
      intervalUnit: unit,
      note: reminderDraft.note.trim(),
      lastDoneAt: existing?.lastDoneAt ?? "",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    setReminders((current) => {
      if (reminderDraft.id) {
        return current.map((item) =>
          item.id === reminderDraft.id ? next : item
        );
      }
      return [next, ...current];
    });
    setReminderDraft(null);
    setCollapsed((current) => ({ ...current, reminders: false }));
    const days = reminderDueInfo(next).daysUntil;
    onToast(
      reminderDraft.id
        ? t("inbox.reminder.started")
        : days > 0
          ? t("inbox.reminder.startedIn", { n: days })
          : t("inbox.reminder.startedDue")
    );
  }

  function removeReminder(id: string) {
    setReminders((current) => current.filter((item) => item.id !== id));
  }

  function markReminderDone(id: string) {
    const reminder = reminders.find((item) => item.id === id);
    if (!reminder) return;
    setReminders((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              lastDoneAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          : item
      )
    );
    onToast(
      t("inbox.markedDone", {
        interval: reminderIntervalLabel(reminder, t)
      })
    );
  }

  function openNewNote() {
    setNoteDraft({ body: "" });
    setCollapsed((current) => ({ ...current, notes: false }));
  }

  function openEditNote(note: InboxNote) {
    setNoteDraft({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt
    });
  }

  function saveNoteFromModal() {
    if (!noteDraft) return;
    const body = sanitizeNoteHtml(noteDraft.body);
    if (isNoteBodyEmpty(body)) return;
    if (noteDraft.id) {
      setNotes((current) =>
        current.map((note) =>
          note.id === noteDraft.id ? { ...note, body } : note
        )
      );
    } else {
      setNotes((current) => [
        {
          id: `NOTE-${Date.now()}`,
          body,
          createdAt: new Date().toISOString()
        },
        ...current
      ]);
    }
    setNoteDraft(null);
  }

  function removeNote(id: string) {
    setNotes((current) => current.filter((note) => note.id !== id));
    if (noteDraft?.id === id) setNoteDraft(null);
  }

  const sortedReminders = [...reminders].sort(
    (a, b) => reminderDueInfo(a).daysUntil - reminderDueInfo(b).daysUntil
  );
  // Show in «Toca contactar» from 3 days out; stay there until «Ya lo hice».
  const dueReminders = sortedReminders.filter(
    (reminder) => reminderDueInfo(reminder).daysUntil <= 3
  );
  const weekReminders = sortedReminders.filter((reminder) => {
    const days = reminderDueInfo(reminder).daysUntil;
    return days >= 4 && days <= 7;
  });
  const weekTodos = openTodos
    .filter((todo) => todoDueWithinWeek(todo.dueDate))
    .sort((a, b) => {
      const aDays = todoDueDaysUntil(a.dueDate);
      const bDays = todoDueDaysUntil(b.dueDate);
      if (aDays !== bDays) return aDays - bDays;
      return b.createdAt.localeCompare(a.createdAt);
    });
  const weekItemCount = weekReminders.length + weekTodos.length;
  const visibleNotes = [...notes]
    .filter((note) => textMatchesKeywords(stripNoteHtml(note.body), noteSearch))
    .sort((a, b) => {
      switch (noteSort) {
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "longest":
          return (
            stripNoteHtml(b.body).length - stripNoteHtml(a.body).length
          );
        case "shortest":
          return (
            stripNoteHtml(a.body).length - stripNoteHtml(b.body).length
          );
        case "alpha":
          return stripNoteHtml(a.body).localeCompare(
            stripNoteHtml(b.body),
            lang
          );
        case "newest":
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });

  function renderDueCard(reminder: ContactReminder) {
    const due = reminderDueInfo(reminder);
    const late = due.daysUntil < 0;
    const status = late
      ? due.daysUntil === -1
        ? t("inbox.overdueOne")
        : t("inbox.overdue", { n: Math.abs(due.daysUntil) })
      : due.daysUntil === 0
        ? t("inbox.due")
        : t("inbox.dueIn", { n: due.daysUntil });
    return (
      <li
        key={reminder.id}
        className={`inbox-due-card${late ? " is-late" : ""}`}
      >
        <div className="inbox-due-card-text">
          <strong>{contactName(reminder.contactId)}</strong>
          <span>
            {methodLabel(reminder.channel)}
            {" · "}
            {reminderIntervalLabel(reminder, t)}
            {reminder.note ? ` · ${reminder.note}` : ""}
          </span>
          <span
            className={`inbox-due-card-status${late ? " is-late" : ""}`}
          >
            {status}
          </span>
        </div>
        <button
          type="button"
          className="inbox-did-it"
          onClick={() => markReminderDone(reminder.id)}
        >
          {t("inbox.markDone")}
        </button>
        <button
          type="button"
          className="ghost small"
          onClick={() => openEditReminder(reminder)}
        >
          {t("inbox.reminder.edit")}
        </button>
      </li>
    );
  }

  function renderWeekReminderCard(reminder: ContactReminder) {
    const due = reminderDueInfo(reminder);
    return (
      <li key={reminder.id} className="inbox-due-card inbox-week-card">
        <div className="inbox-due-card-text">
          <strong>{contactName(reminder.contactId)}</strong>
          <span>
            {methodLabel(reminder.channel)}
            {" · "}
            {reminderIntervalLabel(reminder, t)}
            {reminder.note ? ` · ${reminder.note}` : ""}
          </span>
          <span className="inbox-week-card-status">
            {t("inbox.dueIn", { n: due.daysUntil })}
          </span>
        </div>
        <button
          type="button"
          className="ghost small"
          onClick={() => openEditReminder(reminder)}
        >
          {t("inbox.reminder.edit")}
        </button>
      </li>
    );
  }

  function renderWeekTodoCard(todo: InboxTodo) {
    return (
      <li key={todo.id} className="inbox-due-card inbox-week-card">
        <div className="inbox-due-card-text">
          <strong>{todo.body}</strong>
          <span className="inbox-week-card-status">
            {todoDueLabel(todo.dueDate)}
            {todo.dueDate ? ` · ${todo.dueDate}` : ""}
          </span>
        </div>
        <button
          type="button"
          className="inbox-did-it"
          onClick={() => completeTodo(todo.id)}
        >
          {t("inbox.todo.done")}
        </button>
      </li>
    );
  }

  function renderReminderSummary(reminder: ContactReminder) {
    const due = reminderDueInfo(reminder);
    const inContactPanel = due.daysUntil <= 3;
    const late = due.daysUntil < 0;
    const timing = late
      ? due.daysUntil === -1
        ? t("inbox.overdueOne")
        : t("inbox.overdue", { n: Math.abs(due.daysUntil) })
      : due.daysUntil === 0
        ? t("inbox.due")
        : t("inbox.dueIn", { n: due.daysUntil });
    const meta = [
      methodLabel(reminder.channel),
      reminderIntervalLabel(reminder, t),
      reminder.note?.trim() || "",
      timing,
      reminder.lastDoneAt
        ? t("inbox.lastDone", { date: shortDate(reminder.lastDoneAt, lang) })
        : t("inbox.neverDone")
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <li
        key={reminder.id}
        className={`inbox-summary-row${inContactPanel ? " is-due" : ""}${
          late ? " is-late" : ""
        }`}
      >
        <button
          type="button"
          className="inbox-summary-main"
          onClick={() => openEditReminder(reminder)}
          title={t("inbox.reminder.clickToEdit")}
        >
          <strong>{contactName(reminder.contactId)}</strong>
          <span
            className={`inbox-summary-meta${late ? " inbox-late-label" : ""}`}
          >
            {meta}
          </span>
        </button>
        <div className="inbox-summary-actions">
          {inContactPanel ? (
            <button
              type="button"
              className="small inbox-did-it"
              onClick={() => markReminderDone(reminder.id)}
            >
              {t("inbox.markDone")}
            </button>
          ) : null}
          <button
            type="button"
            className="ghost small"
            onClick={() => removeReminder(reminder.id)}
          >
            {t("common.erase")}
          </button>
        </div>
      </li>
    );
  }

  return (
    <section className="list-page inbox-page">
      <div className="page-head inbox-page-head">
        <div>
          <p className="eyebrow">{t("inbox.eyebrow")}</p>
          <h2>{t("inbox.title")}</h2>
          <p className="page-lead">{t("inbox.lead")}</p>
        </div>
        <span className="inbox-save-state muted small-note">
          {saving ? t("common.saving") : t("inbox.autosave")}
        </span>
      </div>

      <div className="inbox-alert-split">
        <section
          className={`inbox-due-panel inbox-week-panel${
            weekItemCount > 0 ? " has-items" : ""
          }`}
        >
          <header className="inbox-due-panel-head">
            <h3>
              {t("inbox.weekPanel.title")}
              {weekItemCount > 0 ? (
                <span className="inbox-count">{weekItemCount}</span>
              ) : null}
            </h3>
            <p className="muted small-note">{t("inbox.weekPanel.lead")}</p>
          </header>
          {weekItemCount === 0 ? (
            <p className="inbox-empty">{t("inbox.weekPanel.empty")}</p>
          ) : (
            <ul className="inbox-due-list">
              {weekReminders.map((reminder) =>
                renderWeekReminderCard(reminder)
              )}
              {weekTodos.map((todo) => renderWeekTodoCard(todo))}
            </ul>
          )}
        </section>

        <section
          className={`inbox-due-panel${
            dueReminders.length > 0 ? " has-items" : ""
          }`}
        >
          <header className="inbox-due-panel-head">
            <h3>
              {t("inbox.duePanel.title")}
              {dueReminders.length > 0 ? (
                <span className="inbox-count">{dueReminders.length}</span>
              ) : null}
            </h3>
            <p className="muted small-note">{t("inbox.duePanel.lead")}</p>
          </header>
          {dueReminders.length === 0 ? (
            <p className="inbox-empty">{t("inbox.duePanel.empty")}</p>
          ) : (
            <ul className="inbox-due-list">
              {dueReminders.map((reminder) => renderDueCard(reminder))}
            </ul>
          )}
        </section>
      </div>

      <div className="inbox-stack">
        {/* ── To Do ────────────────────────────────────────────── */}
        <section className="inbox-fold">
          <button
            type="button"
            className="inbox-fold-head"
            onClick={() => toggleSection("todo")}
          >
            <span className="inbox-fold-title">
              <span className="inbox-fold-caret" aria-hidden>
                {collapsed.todo ? "▸" : "▾"}
              </span>
              {t("inbox.todo.title")}
              {openTodos.length > 0 ? (
                <span className="inbox-count soft">{openTodos.length}</span>
              ) : null}
            </span>
          </button>
          {!collapsed.todo ? (
            <div className="inbox-fold-body todo-fold-body">
              <div className="todo-add">
                <input
                  type="text"
                  className="todo-add-input"
                  placeholder={t("inbox.todo.placeholder")}
                  value={draftTodo}
                  maxLength={110}
                  onChange={(event) => setDraftTodo(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveTodoInline();
                    }
                  }}
                />
                <button
                  type="button"
                  className="todo-add-btn"
                  disabled={!draftTodo.trim() || todoTooLong}
                  onClick={saveTodoInline}
                >
                  {t("inbox.todo.addShort")}
                </button>
              </div>
              {todoTooLong ? (
                <p className="inbox-todo-too-long">{t("inbox.todo.tooLong")}</p>
              ) : null}

              {openTodos.length === 0 ? (
                <p className="todo-empty">{t("inbox.todo.empty")}</p>
              ) : (
                <ul className="todo-list">
                  {openTodos.map((todo) => {
                    const days = todoDueDaysUntil(todo.dueDate);
                    const hasDue = Boolean(todo.dueDate);
                    return (
                      <li key={todo.id} className="todo-item">
                        <button
                          type="button"
                          className="todo-check"
                          aria-label={t("inbox.todo.done")}
                          title={t("inbox.todo.done")}
                          onClick={() => completeTodo(todo.id)}
                        />
                        <span className="todo-item-text">{todo.body}</span>
                        <div className="todo-item-due">
                          {hasDue ? (
                            <span
                              className={`todo-due-chip${
                                days < 0
                                  ? " is-overdue"
                                  : todoDueWithinWeek(todo.dueDate)
                                    ? " is-soon"
                                    : ""
                              }`}
                            >
                              {todoDueLabel(todo.dueDate)}
                            </span>
                          ) : null}
                          <input
                            type="date"
                            className="todo-due-input"
                            aria-label={t("inbox.todo.dueDate")}
                            value={toIsoDate(todo.dueDate || "")}
                            onChange={(event) => {
                              const iso = event.target.value;
                              // Ignore empty flicker from the native picker.
                              if (!iso) return;
                              setTodoDueDate(todo.id, fromIsoDate(iso));
                            }}
                          />
                          {hasDue ? (
                            <button
                              type="button"
                              className="todo-due-clear"
                              title={t("inbox.todo.dueDateClear")}
                              aria-label={t("inbox.todo.dueDateClear")}
                              onClick={() => setTodoDueDate(todo.id, "")}
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </section>

        {/* ── Recordatorios ────────────────────────────────────── */}
        <section className="inbox-fold">
          <button
            type="button"
            className="inbox-fold-head"
            onClick={() => toggleSection("reminders")}
          >
            <span className="inbox-fold-title">
              <span className="inbox-fold-caret" aria-hidden>
                {collapsed.reminders ? "▸" : "▾"}
              </span>
              {t("inbox.reminders")}
              {dueReminders.length > 0 ? (
                <span className="inbox-count">{dueReminders.length}</span>
              ) : null}
            </span>
          </button>
          {!collapsed.reminders ? (
            <div className="inbox-fold-body">
              <div className="inbox-section-toolbar">
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    openNewReminder({
                      intervalValue: 1,
                      intervalUnit: "days"
                    })
                  }
                >
                  {t("inbox.reminder.everyDay")}
                </button>
                <button type="button" onClick={() => openNewReminder()}>
                  {t("inbox.addReminder")}
                </button>
              </div>

              <h4 className="inbox-subhead">{t("inbox.reminders.all")}</h4>
              {sortedReminders.length === 0 ? (
                <p className="inbox-empty">{t("inbox.emptyReminders")}</p>
              ) : (
                <ul className="inbox-simple-list">
                  {sortedReminders.map((reminder) =>
                    renderReminderSummary(reminder)
                  )}
                </ul>
              )}
            </div>
          ) : null}
        </section>

        {/* ── Notas ────────────────────────────────────────────── */}
        <section className="inbox-fold">
          <button
            type="button"
            className="inbox-fold-head"
            onClick={() => toggleSection("notes")}
          >
            <span className="inbox-fold-title">
              <span className="inbox-fold-caret" aria-hidden>
                {collapsed.notes ? "▸" : "▾"}
              </span>
              {t("inbox.notes")}
            </span>
          </button>
          {!collapsed.notes ? (
            <div className="inbox-fold-body">
              <div className="inbox-section-toolbar">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setNoteFindOpen(true)}
                >
                  {t("inbox.notes.find")}
                </button>
                <button type="button" onClick={openNewNote}>
                  {t("inbox.addNote")}
                </button>
              </div>
              {visibleNotes.length === 0 ? (
                <p className="inbox-empty">
                  {notes.length === 0
                    ? t("inbox.emptyNotes")
                    : t("inbox.notes.noMatch")}
                </p>
              ) : (
                <ul className="inbox-note-list">
                  {visibleNotes.map((note) => (
                    <li key={note.id} className="inbox-note-row">
                      <button
                        type="button"
                        className="inbox-note-preview"
                        onClick={() => openEditNote(note)}
                        title={t("inbox.notes.clickToEdit")}
                      >
                        <span className="inbox-note-preview-text">
                          {stripNoteHtml(note.body) || t("inbox.notes.emptyBody")}
                        </span>
                        <span className="muted small-note">
                          {shortDate(note.createdAt, lang)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="ghost danger small"
                        onClick={() => removeNote(note.id)}
                      >
                        {t("common.erase")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      </div>

      {noteFindOpen ? (
        <div className="modal-backdrop" onClick={() => setNoteFindOpen(false)}>
          <div
            className="modal confirm-modal inbox-compose-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{t("inbox.notes.findTitle")}</h3>
              <button
                type="button"
                className="ghost small"
                onClick={() => setNoteFindOpen(false)}
              >
                {t("common.close")}
              </button>
            </div>
            <label className="field">
              {t("inbox.notes.search")}
              <input
                className="search-input"
                value={noteSearch}
                autoFocus
                placeholder={t("inbox.notes.search")}
                onChange={(event) => setNoteSearch(event.target.value)}
              />
            </label>
            <label className="field">
              {t("inbox.sort.label")}
              <select
                value={noteSort}
                onChange={(event) =>
                  setNoteSort(
                    event.target.value as
                      | "newest"
                      | "oldest"
                      | "longest"
                      | "shortest"
                      | "alpha"
                  )
                }
              >
                <option value="newest">{t("inbox.sort.newest")}</option>
                <option value="oldest">{t("inbox.sort.oldest")}</option>
                <option value="longest">{t("inbox.sort.longest")}</option>
                <option value="shortest">{t("inbox.sort.shortest")}</option>
                <option value="alpha">{t("inbox.sort.alpha")}</option>
              </select>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setNoteSearch("");
                  setNoteSort("newest");
                }}
              >
                {t("inbox.notes.clearFind")}
              </button>
              <button type="button" onClick={() => setNoteFindOpen(false)}>
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {noteDraft ? (
        <div
          className="modal-backdrop"
          onClick={() => setNoteDraft(null)}
        >
          <div
            className="modal confirm-modal inbox-compose-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>
                {noteDraft.id
                  ? t("inbox.notes.editTitle")
                  : t("inbox.notes.modalTitle")}
              </h3>
              <button
                type="button"
                className="ghost small"
                onClick={() => setNoteDraft(null)}
              >
                {t("common.close")}
              </button>
            </div>
            {noteDraft.createdAt ? (
              <p className="muted small-note">
                {shortDate(noteDraft.createdAt, lang)}
              </p>
            ) : null}
            <div className="field note-editor-field">
              <span className="sr-only">{t("inbox.notePlaceholder")}</span>
              <SimpleNoteEditor
                key={noteDraft.id ?? "new-note"}
                value={noteDraft.body}
                placeholder={t("inbox.notePlaceholder")}
                onChange={(html) =>
                  setNoteDraft((current) =>
                    current ? { ...current, body: html } : current
                  )
                }
              />
            </div>
            <div className="modal-actions">
              {noteDraft.id ? (
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => removeNote(noteDraft.id!)}
                >
                  {t("common.erase")}
                </button>
              ) : (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setNoteDraft(null)}
                >
                  {t("common.cancel")}
                </button>
              )}
              <button
                type="button"
                disabled={isNoteBodyEmpty(noteDraft.body)}
                onClick={saveNoteFromModal}
              >
                {noteDraft.id ? t("common.save") : t("common.add")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reminderDraft ? (
        <div
          className="modal-backdrop"
          onClick={() => setReminderDraft(null)}
        >
          <div
            className="modal confirm-modal inbox-compose-modal inbox-reminder-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>
                {reminderDraft.id
                  ? t("inbox.reminder.editTitle")
                  : t("inbox.reminder.newTitle")}
              </h3>
              <button
                type="button"
                className="ghost small"
                onClick={() => setReminderDraft(null)}
              >
                {t("common.close")}
              </button>
            </div>
            <p className="confirm-message">{t("inbox.reminder.formLead")}</p>
            <label className="field">
              {t("inbox.contact")}
              <select
                value={reminderDraft.contactId}
                onChange={(event) =>
                  setReminderDraft((current) =>
                    current
                      ? { ...current, contactId: event.target.value }
                      : current
                  )
                }
              >
                <option value="">{t("inbox.pickContact")}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <LookupSelect
              inventory={inventory}
              setInventory={setInventory}
              category="contactMethod"
              label={t("inbox.how")}
              value={reminderDraft.channel}
              onChange={(value) =>
                setReminderDraft((current) =>
                  current ? { ...current, channel: value } : current
                )
              }
            />
            <div className="inbox-interval-row">
              <label className="field">
                {t("inbox.intervalValue")}
                <input
                  type="number"
                  min={1}
                  max={reminderDraft.intervalUnit === "days" ? 365 : 60}
                  value={reminderDraft.intervalValue}
                  onChange={(event) =>
                    setReminderDraft((current) =>
                      current
                        ? {
                            ...current,
                            intervalValue: Math.max(
                              1,
                              Number(event.target.value) || 1
                            )
                          }
                        : current
                    )
                  }
                />
              </label>
              <label className="field">
                {t("inbox.intervalUnit")}
                <select
                  value={reminderDraft.intervalUnit}
                  onChange={(event) =>
                    setReminderDraft((current) =>
                      current
                        ? {
                            ...current,
                            intervalUnit: event.target.value as ReminderIntervalUnit
                          }
                        : current
                    )
                  }
                >
                  <option value="days">{t("inbox.unit.days")}</option>
                  <option value="months">{t("inbox.unit.months")}</option>
                </select>
              </label>
            </div>
            <div className="inbox-preset-row">
              <button
                type="button"
                className="ghost small"
                onClick={() =>
                  setReminderDraft((current) =>
                    current
                      ? { ...current, intervalValue: 1, intervalUnit: "days" }
                      : current
                  )
                }
              >
                {t("inbox.reminder.everyDay")}
              </button>
              <button
                type="button"
                className="ghost small"
                onClick={() =>
                  setReminderDraft((current) =>
                    current
                      ? { ...current, intervalValue: 1, intervalUnit: "months" }
                      : current
                  )
                }
              >
                {t("inbox.reminder.everyMonth")}
              </button>
              <button
                type="button"
                className="ghost small"
                onClick={() =>
                  setReminderDraft((current) =>
                    current
                      ? { ...current, intervalValue: 3, intervalUnit: "months" }
                      : current
                  )
                }
              >
                {t("inbox.reminder.every3Months")}
              </button>
            </div>
            <label className="field">
              {t("inbox.reminderNote")}
              <textarea
                rows={3}
                className="textgen-resizable"
                value={reminderDraft.note}
                onChange={(event) =>
                  setReminderDraft((current) =>
                    current
                      ? { ...current, note: event.target.value }
                      : current
                  )
                }
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setReminderDraft(null)}
              >
                {t("common.cancel")}
              </button>
              <button type="button" onClick={startReminder}>
                {reminderDraft.id
                  ? t("inbox.reminder.save")
                  : t("inbox.reminder.start")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="modal confirm-modal inbox-history-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{t("inbox.todo.historyTitle")}</h3>
              <button
                type="button"
                className="ghost small"
                onClick={() => setHistoryOpen(false)}
              >
                {t("common.close")}
              </button>
            </div>
            <input
              className="search-input"
              placeholder={t("inbox.todo.historySearch")}
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              autoFocus
            />
            {filteredArchived.length === 0 ? (
              <p className="inbox-empty">{t("inbox.todo.historyEmpty")}</p>
            ) : (
              <ul className="inbox-history-list">
                {filteredArchived.map((todo) => (
                  <li key={todo.id}>
                    <div>
                      <p>{todo.body}</p>
                      <span className="muted small-note">
                        {todo.doneAt ? shortDate(todo.doneAt, lang) : "—"}
                      </span>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => restoreTodo(todo.id)}
                      >
                        {t("inbox.todo.restore")}
                      </button>
                      <button
                        type="button"
                        className="ghost danger small"
                        onClick={() => removeTodo(todo.id)}
                      >
                        {t("common.erase")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TextgenToneScale({
  label,
  value,
  onChange,
  labels
}: {
  label: string;
  value: 1 | 2 | 3;
  onChange: (value: 1 | 2 | 3) => void;
  labels: [string, string, string];
}) {
  return (
    <div className="textgen-tone-row">
      <span className="textgen-tone-label">{label}</span>
      <div className="segmented small textgen-tone-seg" role="group" aria-label={label}>
        {([1, 2, 3] as const).map((level) => (
          <button
            key={level}
            type="button"
            className={`seg${value === level ? " active" : ""}`}
            onClick={() => onChange(level)}
            title={labels[level - 1]}
          >
            <span className="textgen-tone-num">{level}</span>
            <span className="textgen-tone-caption">{labels[level - 1]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TextGeneratorPage({
  inventory,
  setInventory,
  onError,
  onToast,
  onOpenExampleLibrary
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onOpenExampleLibrary: () => void;
}) {
  const { lang, t } = useLanguage();
  const initialDraft = useMemo(() => loadTextgenDraft(), []);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => initialDraft.selectedIds
  );
  const [showPicker, setShowPicker] = useState(false);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(
    () =>
      inventory.settings.textGeneratorSystemPrompt?.trim() ||
      DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT
  );
  const [systemPromptSaving, setSystemPromptSaving] = useState(false);
  const [instruction, setInstruction] = useState(
    () => initialDraft.instruction
  );
  const [freeText, setFreeText] = useState(() => initialDraft.freeText);
  const [emailHistory, setEmailHistory] = useState(
    () => initialDraft.emailHistory
  );
  const [emailHistoryOpen, setEmailHistoryOpen] = useState(
    () => initialDraft.emailHistoryOpen
  );
  const [toneFormality, setToneFormality] = useState<1 | 2 | 3>(
    () => initialDraft.toneFormality
  );
  const [toneFirmness, setToneFirmness] = useState<1 | 2 | 3>(
    () => initialDraft.toneFirmness
  );
  const [toneWarmth, setToneWarmth] = useState<1 | 2 | 3>(
    () => initialDraft.toneWarmth
  );
  const [responseLanguage, setResponseLanguage] = useState<"es" | "en" | "de">(
    () => initialDraft.responseLanguage
  );
  const [referenceLinks, setReferenceLinks] = useState<
    Array<{ id: string; url: string; note: string }>
  >(() => initialDraft.referenceLinks);
  const examples = useMemo(
    () => (inventory.textGeneratorExamples ?? []).map(normalizeTextExample),
    [inventory.textGeneratorExamples]
  );
  const [selectedExampleIds, setSelectedExampleIds] = useState<string[]>(
    () => initialDraft.selectedExampleIds
  );
  const [selectedSeriesTextKeys, setSelectedSeriesTextKeys] = useState<string[]>(
    () => initialDraft.selectedSeriesTextKeys
  );
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const [expandedTextKey, setExpandedTextKey] = useState<string | null>(null);
  const [seriesOpen, setSeriesOpen] = useState(() => initialDraft.seriesOpen);
  const [showOtherSeries, setShowOtherSeries] = useState(
    () => initialDraft.showOtherSeries
  );
  const [examplePickerOpen, setExamplePickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(() => initialDraft.moreOpen);
  const [copying, setCopying] = useState<null | "text" | "images" | "folder">(
    null
  );
  const [photos, setPhotos] = useState<
    Record<string, { dataUrl: string; sourcePath: string }>
  >({});
  const autoSeriesKeysRef = useRef<Set<string>>(
    new Set(initialDraft.autoSeriesTextKeys)
  );
  const manualOtherSeriesKeysRef = useRef<Set<string>>(
    new Set(initialDraft.manualOtherSeriesTextKeys)
  );

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => inventory.artworks.some((art) => art.id === id))
    );
  }, [inventory.artworks]);

  useEffect(() => {
    saveTextgenDraft({
      selectedIds,
      instruction,
      freeText,
      emailHistory,
      emailHistoryOpen,
      toneFormality,
      toneFirmness,
      toneWarmth,
      responseLanguage,
      referenceLinks,
      selectedExampleIds,
      selectedSeriesTextKeys,
      autoSeriesTextKeys: [...autoSeriesKeysRef.current],
      manualOtherSeriesTextKeys: [...manualOtherSeriesKeysRef.current],
      seriesOpen,
      showOtherSeries,
      moreOpen
    });
  }, [
    selectedIds,
    instruction,
    freeText,
    emailHistory,
    emailHistoryOpen,
    toneFormality,
    toneFirmness,
    toneWarmth,
    responseLanguage,
    referenceLinks,
    selectedExampleIds,
    selectedSeriesTextKeys,
    seriesOpen,
    showOtherSeries,
    moreOpen
  ]);

  function resetTextgenDraft() {
    const defaults = defaultTextgenDraft();
    setSelectedIds(defaults.selectedIds);
    setShowPicker(false);
    setSystemPromptOpen(false);
    setInstruction(defaults.instruction);
    setFreeText(defaults.freeText);
    setEmailHistory(defaults.emailHistory);
    setEmailHistoryOpen(defaults.emailHistoryOpen);
    setToneFormality(defaults.toneFormality);
    setToneFirmness(defaults.toneFirmness);
    setToneWarmth(defaults.toneWarmth);
    setResponseLanguage(defaults.responseLanguage);
    setReferenceLinks(defaults.referenceLinks);
    setSelectedExampleIds(defaults.selectedExampleIds);
    setSelectedSeriesTextKeys(defaults.selectedSeriesTextKeys);
    setExpandedSeriesId(null);
    setExpandedTextKey(null);
    setSeriesOpen(defaults.seriesOpen);
    setShowOtherSeries(defaults.showOtherSeries);
    setExamplePickerOpen(false);
    setMoreOpen(defaults.moreOpen);
    setCopying(null);
    setPhotos({});
    autoSeriesKeysRef.current = new Set();
    manualOtherSeriesKeysRef.current = new Set();
    saveTextgenDraft(defaults);
    onToast(t("textgen.toast.reset"));
  }

  // Drop picks that no longer exist in the library.
  useEffect(() => {
    setSelectedExampleIds((current) =>
      current.filter((id) => examples.some((example) => example.id === id))
    );
  }, [examples]);

  useEffect(() => {
    setSystemPrompt(
      inventory.settings.textGeneratorSystemPrompt?.trim() ||
        DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT
    );
  }, [inventory.settings.textGeneratorSystemPrompt]);

  const selectedArtworks = selectedIds
    .map((id) => inventory.artworks.find((artwork) => artwork.id === id))
    .filter((artwork): artwork is Artwork => Boolean(artwork));
  const selectedSeriesNames = uniqueValues(
    selectedArtworks.map((artwork) => artwork.series)
  ).filter((name) => name.trim() && !isNoSeries(name));
  const artworksWithPhoto = selectedArtworks.filter((art) =>
    Boolean(photos[art.id])
  );
  const missingPhotoCount = selectedArtworks.length - artworksWithPhoto.length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, { dataUrl: string; sourcePath: string }> = {};
      for (const art of selectedArtworks) {
        const image = mainImageFor(art, inventory);
        if (!image?.absolutePath) continue;
        try {
          next[art.id] = {
            dataUrl: await window.inventoryApi.imageToDataUrl(
              image.absolutePath
            ),
            sourcePath: image.absolutePath
          };
        } catch {
          /* skip unreadable photo */
        }
      }
      if (!cancelled) setPhotos(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedArtworks.map((a) => a.id).join("|"), inventory.images]);

  const pickedExamples = useMemo(
    () =>
      selectedExampleIds
        .map((id) => examples.find((example) => example.id === id))
        .filter((example): example is TextGeneratorExample => Boolean(example)),
    [selectedExampleIds, examples]
  );

  const seriesForPrompt = useMemo(() => {
    const fromWorks = selectedSeriesNames
      .map((name) =>
        inventory.seriesInfo.find(
          (series) => series.name.toLowerCase() === name.toLowerCase()
        )
      )
      .filter((series): series is SeriesInfo => Boolean(series));
    const ids = new Set(fromWorks.map((series) => series.id));
    const extras = inventory.seriesInfo.filter((series) => !ids.has(series.id));
    return { linked: fromWorks, other: extras };
  }, [inventory.seriesInfo, selectedSeriesNames]);

  // Auto-include newly linked series texts once; never re-force after the user unchecks.
  // When works are removed, drop those auto-linked texts — do not keep them just because
  // the series still exists under «otras series».
  useEffect(() => {
    const linkedKeys = seriesForPrompt.linked.flatMap((series) =>
      (series.texts ?? []).map((text) => seriesTextKey(series.id, text.id))
    );
    const linkedKeySet = new Set(linkedKeys);
    const otherKeySet = new Set(
      seriesForPrompt.other.flatMap((series) =>
        (series.texts ?? []).map((text) => seriesTextKey(series.id, text.id))
      )
    );
    const available = new Set([...linkedKeySet, ...otherKeySet]);
    const fresh = linkedKeys.filter((key) => !autoSeriesKeysRef.current.has(key));
    for (const key of [...autoSeriesKeysRef.current]) {
      if (!linkedKeySet.has(key)) autoSeriesKeysRef.current.delete(key);
    }
    for (const key of linkedKeys) autoSeriesKeysRef.current.add(key);
    for (const key of [...manualOtherSeriesKeysRef.current]) {
      if (!otherKeySet.has(key) || linkedKeySet.has(key)) {
        manualOtherSeriesKeysRef.current.delete(key);
      }
    }
    setSelectedSeriesTextKeys((current) => {
      const kept = current.filter((key) => {
        if (!available.has(key)) return false;
        if (linkedKeySet.has(key)) return true;
        return manualOtherSeriesKeysRef.current.has(key);
      });
      if (fresh.length === 0) return kept;
      return [...new Set([...kept, ...fresh])];
    });
  }, [seriesForPrompt.linked, seriesForPrompt.other]);

  const responseLanguageLine =
    responseLanguage === "en"
      ? "Write the entire draft in English."
      : responseLanguage === "de"
        ? "Schreibe den gesamten Entwurf auf Deutsch."
        : "Escribe el borrador íntegramente en español.";

  const toneBlock = useMemo(() => {
    const formalityLine =
      toneFormality === 1
        ? "1/3 informal y cercano (tú / lenguaje cotidiano)."
        : toneFormality === 3
          ? "3/3 formal y profesional (usted si encaja; sin coloquialismos)."
          : "2/3 equilibrado: correcto pero natural.";
    const firmnessLine =
      toneFirmness === 1
        ? "1/3 suave y conciliador; evita confrontación."
        : toneFirmness === 3
          ? "3/3 firme y directo; deja clara la postura sin insultar."
          : "2/3 claro y seguro, sin agredir.";
    const warmthLine =
      toneWarmth === 1
        ? "1/3 frío y sobrio; poco afecto."
        : toneWarmth === 3
          ? "3/3 cálido y humano; cercano sin ser empalagoso."
          : "2/3 cordial y educado.";
    return [
      "TONO DE LA RESPUESTA",
      `Formalidad: ${formalityLine}`,
      `Firmeza: ${firmnessLine}`,
      `Calidez: ${warmthLine}`,
      "Ajusta el borrador a estas tres escalas a la vez."
    ].join("\n");
  }, [toneFormality, toneFirmness, toneWarmth]);

  const generatedText = useMemo(() => {
    const blocks: string[] = [
      "SYSTEM",
      systemPrompt.trim() || DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT,
      "ENCARGO",
      instruction.trim() || "Redacta un primer borrador usando solo estos datos."
    ];

    if (emailHistory.trim()) {
      blocks.push(
        "HISTORIAL DEL CORREO",
        "La artista quiere responder a este hilo. Usa el historial solo como contexto: no inventes mensajes que no estén aquí, y redacta una respuesta que encaje en la conversación.",
        emailHistory.trim()
      );
    }

    if (freeText.trim()) {
      blocks.push("NOTAS LIBRES DE LA ARTISTA", freeText.trim());
    }

    blocks.push(toneBlock);

    if (selectedArtworks.length > 0) {
      blocks.push(
        "OBRAS SELECCIONADAS",
        "Las fotos de estas obras se adjuntan en el mismo chat, justo después de este texto. Úsalas como referencia visual.",
        selectedArtworks
          .map((artwork, index) => {
            const lines = [
              `${index + 1}. ${artwork.title}`,
              `Serie: ${seriesLabel(artwork.series, t)}`,
              `Técnica / tipo: ${labelFor(inventory, "artworkType", artwork.type, lang)}`,
              `Tamaño: ${formatSize(artwork) || "sin medidas"}`,
              `Año: ${artwork.yearMade || "sin año"}`
            ];
            if (artwork.notes?.trim()) {
              lines.push(`Notas de la obra: ${artwork.notes.trim()}`);
            }
            return lines.join("\n");
          })
          .join("\n\n")
      );
    }

    const selectedTexts = inventory.seriesInfo
      .map((series) => {
        const texts = (series.texts ?? []).filter((text) =>
          selectedSeriesTextKeys.includes(seriesTextKey(series.id, text.id))
        );
        if (texts.length === 0) return null;
        const lines = [`SERIE: ${series.name}`];
        for (const text of texts) {
          lines.push(
            [text.topic ? `Tema: ${text.topic}` : "", text.body]
              .filter(Boolean)
              .join("\n")
          );
        }
        return lines.join("\n\n");
      })
      .filter(Boolean);

    if (selectedTexts.length > 0) {
      blocks.push(
        "INFORMACIÓN / TEXTOS DE LAS SERIES",
        selectedTexts.join("\n\n---\n\n")
      );
    }

    const usableExamples = pickedExamples.filter(
      (example) => example.topic.trim() || example.body.trim()
    );
    if (usableExamples.length > 0) {
      blocks.push(
        "EJEMPLOS DE TEXTOS / REFERENCIAS DE ESTILO",
        usableExamples
          .map(
            (example, index) =>
              `EJEMPLO ${index + 1}${
                example.topic ? ` — ${example.topic}` : ""
              }\n${example.body}`
          )
          .join("\n\n---\n\n")
      );
    }

    const usableLinks = referenceLinks.filter((link) => link.url.trim());
    if (usableLinks.length > 0) {
      blocks.push(
        "ENLACES DE REFERENCIA",
        "Abre y consulta estas direcciones. Úsalas como contexto; no inventes lo que no aparezca ahí.",
        usableLinks
          .map((link, index) => {
            const note = link.note.trim();
            return `${index + 1}. ${link.url.trim()}${
              note ? `\n   Nota: ${note}` : ""
            }`;
          })
          .join("\n")
      );
    }

    blocks.push(
      "IDIOMA DE LA RESPUESTA",
      responseLanguageLine,
      "INDICACIÓN FINAL",
      "Devuelve un borrador listo para revisar. Si falta información importante, señálala entre corchetes en vez de inventarla."
    );
    return blocks.filter(Boolean).join("\n\n");
  }, [
    systemPrompt,
    instruction,
    emailHistory,
    freeText,
    toneBlock,
    selectedArtworks,
    selectedSeriesTextKeys,
    pickedExamples,
    referenceLinks,
    inventory,
    responseLanguageLine
  ]);

  function addReferenceLink() {
    setReferenceLinks((current) => [
      ...current,
      { id: `link-${Date.now()}`, url: "", note: "" }
    ]);
  }

  function toggleSeriesText(key: string, fromOther: boolean) {
    setSelectedSeriesTextKeys((current) => {
      if (current.includes(key)) {
        manualOtherSeriesKeysRef.current.delete(key);
        return current.filter((item) => item !== key);
      }
      if (fromOther) manualOtherSeriesKeysRef.current.add(key);
      else manualOtherSeriesKeysRef.current.delete(key);
      return [...current, key];
    });
  }

  async function saveSystemPrompt() {
    setSystemPromptSaving(true);
    try {
      const next =
        systemPrompt.trim() || DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT;
      const data = await requireApi("saveSettings", t)({
        ...inventory.settings,
        textGeneratorSystemPrompt: next
      });
      setInventory(data);
      setSystemPrompt(
        data.settings.textGeneratorSystemPrompt?.trim() ||
          DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT
      );
      onToast(t("textgen.toast.systemSaved"));
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : t("textgen.error.systemSave")
      );
    } finally {
      setSystemPromptSaving(false);
    }
  }

  async function copyText() {
    const hasSomething =
      selectedArtworks.length > 0 ||
      instruction.trim() ||
      emailHistory.trim() ||
      freeText.trim() ||
      selectedExampleIds.length > 0 ||
      selectedSeriesTextKeys.length > 0 ||
      referenceLinks.some((link) => link.url.trim());
    if (!hasSomething) {
      onError(t("textgen.error.needSomething"));
      return;
    }
    setCopying("text");
    try {
      await copyTextToClipboard(generatedText, t);
      onToast(t("textgen.toast.copiedPaste"));
    } catch (error) {
      onError(
        error instanceof Error ? error.message : t("textgen.error.copyManual")
      );
    } finally {
      setCopying(null);
    }
  }

  function photoFiles() {
    return artworksWithPhoto.map((art) => ({
      name: art.title,
      sourcePath: photos[art.id].sourcePath
    }));
  }

  function startPhotoDrag() {
    const api = window.inventoryApi?.startPhotoDrag;
    if (typeof api !== "function") {
      onError(t("textgen.error.restartDrag"));
      return;
    }
    api(photoFiles());
  }

  async function openPhotoFolder() {
    if (artworksWithPhoto.length === 0) {
      onError(t("textgen.error.noPhotos"));
      return;
    }
    setCopying("folder");
    try {
      const { count } = await requireApi("openPhotoFolder", t)(photoFiles());
      onToast(
        count === 1
          ? t("textgen.toast.photoFolderOne", { count })
          : t("textgen.toast.photoFolder", { count })
      );
    } catch (error) {
      onError(
        error instanceof Error ? error.message : t("textgen.error.openFolder")
      );
    } finally {
      setCopying(null);
    }
  }

  async function copyPhotos() {
    if (artworksWithPhoto.length === 0) {
      onError(t("textgen.error.noPhotos"));
      return;
    }
    setCopying("images");
    try {
      const { count } = await requireApi("writeClipboardImageFiles", t)(
        photoFiles()
      );
      if (count === 0) throw new Error(t("textgen.error.readPhotos"));
      onToast(
        count === 1
          ? t("textgen.toast.photoCopiedOne", { count })
          : t("textgen.toast.photosCopiedCount", { count })
      );
    } catch (error) {
      onError(
        error instanceof Error ? error.message : t("textgen.error.copyPhotos")
      );
    } finally {
      setCopying(null);
    }
  }

  function renderSeriesTextPicker(series: SeriesInfo, linked: boolean) {
    const texts = series.texts ?? [];
    const expanded = expandedSeriesId === series.id;
    const selectedCount = texts.filter((text) =>
      selectedSeriesTextKeys.includes(seriesTextKey(series.id, text.id))
    ).length;
    return (
      <div
        className={`textgen-series-block${expanded ? " open" : ""}`}
        key={series.id}
      >
        <button
          type="button"
          className="textgen-series-toggle"
          onClick={(event) => {
            const next = expanded ? null : series.id;
            expandDownFrom(event.currentTarget, () =>
              setExpandedSeriesId(next)
            );
          }}
        >
          <span className="textgen-series-toggle-main">
            <strong>{series.name}</strong>
            <span className="muted small-note">
              {linked
                ? t("textgen.series.fromWorks")
                : t("textgen.series.other")}
              {" · "}
              {texts.length === 0
                ? t("textgen.series.noTexts")
                : texts.length === 1
                  ? t("textgen.series.textCountOne", { n: texts.length })
                  : t("textgen.series.textCount", { n: texts.length })}
              {selectedCount > 0
                ? ` · ${
                    selectedCount === 1
                      ? t("textgen.series.checkedCountOne", { n: selectedCount })
                      : t("textgen.series.checkedCount", { n: selectedCount })
                  }`
                : ""}
            </span>
          </span>
          <span className="series-text-chevron" aria-hidden>
            {expanded ? "▾" : "▸"}
          </span>
        </button>
        {expanded && (
          <div className="textgen-series-body">
            {texts.length === 0 ? (
              <p className="muted small-note">
                {t("textgen.series.emptyHint")}
              </p>
            ) : (
              <div className="textgen-check-list">
                {texts.map((text) => {
                  const key = seriesTextKey(series.id, text.id);
                  const textOpen = expandedTextKey === key;
                  const checked = selectedSeriesTextKeys.includes(key);
                  return (
                    <div
                      className={`textgen-series-text${textOpen ? " open" : ""}`}
                      key={key}
                    >
                      <div className="textgen-series-text-row">
                        <label className="textgen-check textgen-check-inline">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSeriesText(key, !linked)}
                          />
                          <span>
                            <strong>{text.topic || t("common.noTopic")}</strong>
                          </span>
                        </label>
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() =>
                            setExpandedTextKey(textOpen ? null : key)
                          }
                        >
                          {textOpen
                            ? t("common.hide")
                            : t("textgen.series.viewText")}
                        </button>
                      </div>
                      {textOpen && (
                        <div className="textgen-series-text-full">
                          {text.body.trim() || (
                            <span className="muted">{t("common.noText")}</span>
                          )}
                        </div>
                      )}
                      {!textOpen && text.body.trim() && (
                        <p className="muted small-note textgen-series-text-preview">
                          {text.body.trim().slice(0, 120)}
                          {text.body.trim().length > 120 ? "…" : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="list-page text-generator-page textgen-simple">
      <div className="page-head">
        <div>
          <p className="eyebrow">{t("textgen.eyebrow")}</p>
          <h2>{t("textgen.title")}</h2>
          <p className="page-lead">{t("textgen.leadSimple")}</p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="ghost"
            onClick={resetTextgenDraft}
          >
            {t("textgen.reset")}
          </button>
        </div>
      </div>

      <div className="textgen-layout">
        <div className="textgen-config">
          <div className="pl-block textgen-step-block">
            <div className="pl-block-head">
              <div className="textgen-step-head-copy">
                <span className="pl-block-title">{t("textgen.simple.works")}</span>
                <p className="textgen-step-hint">{t("textgen.simple.worksHint")}</p>
              </div>
              <button type="button" onClick={() => setShowPicker(true)}>
                {t("textgen.pickWorks")}
              </button>
            </div>
            {selectedArtworks.length === 0 ? (
              <p className="muted small-note">{t("textgen.noWorksSelected")}</p>
            ) : (
              <div className="textgen-work-list">
                {selectedArtworks.map((artwork) => (
                  <div className="textgen-work" key={artwork.id}>
                    <div className="textgen-work-thumb">
                      {photos[artwork.id] ? (
                        <img src={photos[artwork.id].dataUrl} alt="" />
                      ) : (
                        <span className="muted">{t("common.noPhoto")}</span>
                      )}
                    </div>
                    <div>
                      <strong>{artwork.title}</strong>
                      <span className="muted">
                        {[
                          seriesLabel(artwork.series, t),
                          artwork.yearMade,
                          formatSize(artwork)
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ghost danger small"
                      onClick={() =>
                        setSelectedIds((current) =>
                          current.filter((id) => id !== artwork.id)
                        )
                      }
                    >
                      {t("common.remove")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pl-block textgen-step-block">
            <div className="pl-block-head">
              <span className="pl-block-title">{t("textgen.simple.brief")}</span>
            </div>
            <label className="field">
              <textarea
                rows={7}
                className="textgen-resizable textgen-brief-input"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={t("textgen.simple.briefPlaceholder")}
                aria-label={t("textgen.simple.brief")}
              />
            </label>
          </div>

          <div className="pl-block">
            <button
              type="button"
              className="textgen-more-toggle"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <span>{t("textgen.simple.more")}</span>
              <span className="muted">{moreOpen ? "▲" : "▼"}</span>
            </button>
            {moreOpen ? (
              <div className="textgen-more-body">
                <label className="field textgen-more-lang">
                  {t("textgen.field.responseLang")}
                  <select
                    value={responseLanguage}
                    onChange={(event) =>
                      setResponseLanguage(event.target.value as "es" | "en" | "de")
                    }
                  >
                    <option value="es">{t("cert.modal.spanish")}</option>
                    <option value="en">English</option>
                    <option value="de">Deutsch</option>
                  </select>
                </label>

                <div className="textgen-more-section">
                  <span className="textgen-more-section-title">
                    {t("textgen.tone.title")}
                  </span>
                  <p className="muted small-note">{t("textgen.tone.lead")}</p>
                  <div className="textgen-tone-list">
                    <TextgenToneScale
                      label={t("textgen.tone.formality")}
                      value={toneFormality}
                      onChange={setToneFormality}
                      labels={[
                        t("textgen.tone.formality.1"),
                        t("textgen.tone.formality.2"),
                        t("textgen.tone.formality.3")
                      ]}
                    />
                    <TextgenToneScale
                      label={t("textgen.tone.firmness")}
                      value={toneFirmness}
                      onChange={setToneFirmness}
                      labels={[
                        t("textgen.tone.firmness.1"),
                        t("textgen.tone.firmness.2"),
                        t("textgen.tone.firmness.3")
                      ]}
                    />
                    <TextgenToneScale
                      label={t("textgen.tone.warmth")}
                      value={toneWarmth}
                      onChange={setToneWarmth}
                      labels={[
                        t("textgen.tone.warmth.1"),
                        t("textgen.tone.warmth.2"),
                        t("textgen.tone.warmth.3")
                      ]}
                    />
                  </div>
                </div>

                <div className="textgen-more-section">
                  <div className="textgen-more-section-head">
                    <span className="textgen-more-section-title">
                      {t("textgen.email.title")}
                    </span>
                    {emailHistory.trim() || emailHistoryOpen ? (
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => {
                          setEmailHistory("");
                          setEmailHistoryOpen(false);
                        }}
                      >
                        {t("textgen.email.remove")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => setEmailHistoryOpen(true)}
                      >
                        {t("textgen.email.addShort")}
                      </button>
                    )}
                  </div>
                  {emailHistoryOpen || emailHistory.trim() ? (
                    <>
                      <p className="muted small-note">{t("textgen.email.lead")}</p>
                      <label className="field">
                        <textarea
                          rows={7}
                          className="textgen-resizable"
                          value={emailHistory}
                          placeholder={t("textgen.email.placeholder")}
                          onChange={(event) => setEmailHistory(event.target.value)}
                          aria-label={t("textgen.email.title")}
                        />
                      </label>
                    </>
                  ) : (
                    <p className="muted small-note">{t("textgen.email.closedHint")}</p>
                  )}
                </div>

                <div className="textgen-more-section">
                  <span className="textgen-more-section-title">
                    {t("textgen.field.notes")}
                  </span>
                  <label className="field">
                    <textarea
                      rows={3}
                      className="textgen-resizable"
                      value={freeText}
                      placeholder={t("textgen.field.notesPlaceholder")}
                      onChange={(event) => setFreeText(event.target.value)}
                    />
                  </label>
                </div>

                <div className="textgen-more-section textgen-more-section-examples">
                  <div className="textgen-more-section-head">
                    <div>
                      <span className="textgen-more-section-title">
                        {t("textgen.section.examples")}
                      </span>
                      <p className="muted small-note">
                        {t("textgen.section.examplesHint")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="small"
                      onClick={() => setExamplePickerOpen(true)}
                    >
                      {t("textgen.pickExamples")}
                    </button>
                  </div>
                  {pickedExamples.length === 0 ? (
                    <p className="muted small-note">{t("textgen.examples.nonePicked")}</p>
                  ) : (
                    <div className="textgen-example-list">
                      {pickedExamples.map((example) => (
                        <div className="textgen-example" key={example.id}>
                          <div className="textgen-example-head">
                            <strong>{example.topic || t("common.noTopic")}</strong>
                            <button
                              type="button"
                              className="ghost danger small"
                              onClick={() =>
                                setSelectedExampleIds((current) =>
                                  current.filter((id) => id !== example.id)
                                )
                              }
                            >
                              {t("common.remove")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="textgen-more-section textgen-more-section-series">
                  <div className="textgen-more-section-head">
                    <div>
                      <span className="textgen-more-section-title">
                        {t("textgen.section.seriesTexts")}
                      </span>
                      <p className="muted small-note">
                        {t("textgen.section.seriesTextsHint")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={(event) => {
                        expandDownFrom(event.currentTarget, () =>
                          setSeriesOpen((open) => !open)
                        );
                      }}
                    >
                      {seriesOpen ? t("common.close") : t("common.open")}
                    </button>
                  </div>
                  {seriesOpen ? (
                    seriesForPrompt.linked.length === 0 &&
                    seriesForPrompt.other.length === 0 ? (
                      <p className="muted small-note">{t("textgen.series.noneHint")}</p>
                    ) : (
                      <div className="textgen-series-list">
                        {seriesForPrompt.linked.map((series) =>
                          renderSeriesTextPicker(series, true)
                        )}
                        {seriesForPrompt.other.length > 0 ? (
                          <>
                            <button
                              type="button"
                              className="ghost small textgen-series-others-toggle"
                              onClick={(event) => {
                                expandDownFrom(event.currentTarget, () =>
                                  setShowOtherSeries((value) => !value)
                                );
                              }}
                            >
                              {showOtherSeries
                                ? t("textgen.series.hideOthers")
                                : t("textgen.series.showOthers", {
                                    n: seriesForPrompt.other.length
                                  })}
                            </button>
                            {showOtherSeries
                              ? seriesForPrompt.other.map((series) =>
                                  renderSeriesTextPicker(series, false)
                                )
                              : null}
                          </>
                        ) : null}
                      </div>
                    )
                  ) : (
                    <p className="muted small-note">
                      {selectedSeriesTextKeys.length > 0
                        ? t("textgen.series.selectedCount", {
                            n: selectedSeriesTextKeys.length
                          })
                        : t("textgen.series.openHint")}
                    </p>
                  )}
                </div>

                <div className="textgen-more-section">
                  <div className="textgen-more-section-head">
                    <span className="textgen-more-section-title">
                      {t("textgen.links.title")}
                    </span>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={addReferenceLink}
                    >
                      {t("textgen.links.add")}
                    </button>
                  </div>
                  {referenceLinks.length === 0 ? (
                    <p className="muted small-note">{t("textgen.links.empty")}</p>
                  ) : (
                    <div className="textgen-link-list">
                      {referenceLinks.map((link) => (
                        <div className="textgen-link-row" key={link.id}>
                          <input
                            value={link.url}
                            placeholder="https://…"
                            onChange={(event) =>
                              setReferenceLinks((current) =>
                                current.map((item) =>
                                  item.id === link.id
                                    ? { ...item, url: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                          <button
                            type="button"
                            className="ghost danger small"
                            onClick={() =>
                              setReferenceLinks((current) =>
                                current.filter((item) => item.id !== link.id)
                              )
                            }
                          >
                            {t("common.remove")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="textgen-more-section textgen-more-section-system">
                  <div className="textgen-more-section-head">
                    <div>
                      <span className="textgen-more-section-title">
                        {t("textgen.section.system")}
                      </span>
                      <p className="muted small-note">{t("textgen.system.hint")}</p>
                    </div>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => setSystemPromptOpen((open) => !open)}
                    >
                      {systemPromptOpen ? t("common.close") : t("common.edit")}
                    </button>
                  </div>
                  {systemPromptOpen ? (
                    <>
                      <label className="field">
                        <textarea
                          rows={6}
                          className="textgen-resizable"
                          value={systemPrompt}
                          onChange={(event) => setSystemPrompt(event.target.value)}
                          aria-label={t("textgen.section.system")}
                        />
                      </label>
                      <div className="row-actions" style={{ gap: "0.45rem" }}>
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() =>
                            setSystemPrompt(DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT)
                          }
                        >
                          {t("textgen.system.restore")}
                        </button>
                        <button
                          type="button"
                          className="small"
                          disabled={systemPromptSaving}
                          onClick={() => void saveSystemPrompt()}
                        >
                          {systemPromptSaving
                            ? t("common.saving")
                            : t("common.save")}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="textgen-preview-pane">
          <div className="textgen-simple-actions">
            <p className="textgen-simple-action-lead">{t("textgen.simple.exportLead")}</p>
            <button
              type="button"
              className="cuentas-primary textgen-big-btn"
              disabled={copying !== null}
              onClick={() => void copyText()}
            >
              {copying === "text" ? "…" : t("textgen.copy.text")}
            </button>
            <button
              type="button"
              className="textgen-big-btn"
              disabled={copying !== null || artworksWithPhoto.length === 0}
              onClick={() => void copyPhotos()}
            >
              {copying === "images" ? "…" : t("textgen.copy.photos")}
            </button>
            {artworksWithPhoto.length === 0 && selectedArtworks.length > 0 ? (
              <p className="muted small-note">{t("textgen.step2.noPhotos")}</p>
            ) : null}
            <p className="muted small-note">{t("textgen.simple.exportHint")}</p>
          </div>
          <details className="textgen-preview-details">
            <summary>{t("textgen.preview.title")}</summary>
            <textarea
              className="textgen-output"
              readOnly
              value={generatedText}
              aria-label={t("textgen.preview.aria")}
            />
          </details>
        </div>
      </div>

      {showPicker && (
        <ArtworkPickerModal
          inventory={inventory}
          initialIds={selectedIds}
          title={t("textgen.picker.works")}
          onConfirm={(ids) => {
            const kept = selectedIds.filter((id) => ids.includes(id));
            const added = ids.filter((id) => !selectedIds.includes(id));
            setSelectedIds([...kept, ...added]);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {examplePickerOpen && (
        <ExamplePickerModal
          examples={examples}
          initialIds={selectedExampleIds}
          onConfirm={(ids) => {
            setSelectedExampleIds(ids);
            setExamplePickerOpen(false);
          }}
          onOpenLibrary={() => {
            setExamplePickerOpen(false);
            onOpenExampleLibrary();
          }}
          onClose={() => setExamplePickerOpen(false)}
        />
      )}
    </section>
  );
}

function ExamplePickerModal({
  examples,
  initialIds,
  onConfirm,
  onOpenLibrary,
  onClose
}: {
  examples: TextGeneratorExample[];
  initialIds: string[];
  onConfirm: (ids: string[]) => void;
  onOpenLibrary: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [picked, setPicked] = useState<string[]>(initialIds);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [flatMode, setFlatMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const list = examples.filter((example) =>
    exampleMatchesSearch(example, search)
  );

  const categoryNames = useMemo(() => {
    const set = new Set(list.map((example) => (example.category ?? "").trim()));
    const named = [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
    const hasEmpty = set.has("");
    return hasEmpty ? ["", ...named] : named;
  }, [list]);

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function categoryLabel(cat: string) {
    return cat || t("examples.uncategorized");
  }

  function isSectionCollapsed(key: string) {
    if (collapsed[key] === false) return false;
    if (collapsed[key] === true) return true;
    // Default: collapsed, but open matching sections while searching.
    return !search.trim();
  }

  function renderExamplePick(example: TextGeneratorExample) {
    const open = openId === example.id;
    const body = example.body.trim();
    return (
      <div
        className={`example-pick${
          picked.includes(example.id) ? " is-picked" : ""
        }`}
        key={example.id}
      >
        <label className="example-pick-head">
          <input
            type="checkbox"
            className="picker-check"
            checked={picked.includes(example.id)}
            onChange={() => toggle(example.id)}
          />
          <span className="pick-title">
            {example.topic || t("common.noTopic")}
          </span>
          <span className="muted picker-meta">
            {t("examples.words", { n: countWords(body) })}
          </span>
        </label>
        <p className="muted small-note example-pick-preview">
          {open
            ? body
            : `${body.slice(0, 160)}${body.length > 160 ? "…" : ""}`}
        </p>
        {body.length > 160 && (
          <button
            type="button"
            className="ghost small"
            onClick={() => setOpenId(open ? null : example.id)}
          >
            {open ? t("common.hide") : t("examples.showAll")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{t("textgen.picker.examples")}</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-toolbar">
          <input
            className="search-input grow"
            placeholder={t("examples.searchLong")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
          <button
            type="button"
            className="ghost small"
            onClick={() => setFlatMode((value) => !value)}
          >
            {flatMode
              ? t("textgen.picker.showGrouped")
              : t("textgen.picker.showFlat")}
          </button>
          <button type="button" className="ghost small" onClick={onOpenLibrary}>
            {t("textgen.openLibrary")}
          </button>
        </div>
        <div className="modal-body modal-pick-list">
          {examples.length === 0 ? (
            <p className="muted">{t("examples.pickerEmpty")}</p>
          ) : list.length === 0 ? (
            <p className="muted">{t("examples.noMatch")}</p>
          ) : flatMode ? (
            list.map((example) => renderExamplePick(example))
          ) : (
            <div className="examples-categories example-picker-categories">
              {categoryNames.map((cat) => {
                const key = cat || "__none__";
                const items = list.filter(
                  (example) => (example.category ?? "").trim() === cat
                );
                if (items.length === 0) return null;
                const sectionCollapsed = isSectionCollapsed(key);
                const pickedInSection = items.filter((item) =>
                  picked.includes(item.id)
                ).length;
                return (
                  <section className="examples-category" key={key}>
                    <button
                      type="button"
                      className="examples-category-head"
                      onClick={() =>
                        setCollapsed((current) => ({
                          ...current,
                          [key]: !sectionCollapsed
                        }))
                      }
                    >
                      <span className="examples-category-caret" aria-hidden>
                        {sectionCollapsed ? "▸" : "▾"}
                      </span>
                      <span className="examples-category-name">
                        {categoryLabel(cat)}
                      </span>
                      <span className="count-pill">
                        {pickedInSection > 0
                          ? `${pickedInSection}/${items.length}`
                          : items.length}
                      </span>
                    </button>
                    {!sectionCollapsed ? (
                      <div className="examples-category-body">
                        {items.map((example) => renderExamplePick(example))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={() => onConfirm(picked)}>
            {t("textgen.picker.useExamples", { n: picked.length })}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplicationsPage({
  inventory,
  setInventory,
  onError,
  onToast,
  onDirtyChange,
  saveRef,
  guard,
  resetToken = 0
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: MutableRefObject<null | (() => Promise<boolean>)>;
  guard?: (action: () => void) => void;
  resetToken?: number;
}) {
  const t = useT();
  const [editing, setEditing] = useState<Application | null | "new">(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ApplicationKind>("all");
  const [yearFilter, setYearFilter] = useState<"all" | number>("all");
  const thisYear = new Date().getFullYear();
  const kindLabels: Record<ApplicationKind, string> = {
    concurso: t("applications.kind.contest"),
    beca: t("applications.kind.grant"),
    residencia: t("applications.kind.residency"),
    otro: t("applications.kind.other")
  };

  const lastResetToken = useRef(resetToken);
  useEffect(() => {
    if (resetToken === lastResetToken.current) return;
    lastResetToken.current = resetToken;
    setEditing(null);
    onDirtyChange?.(false);
  }, [resetToken, onDirtyChange]);

  const allApps = inventory.applications ?? [];
  const yearOptions = uniqueNumbers(
    allApps
      .map((app) => {
        const fromDeadline = yearFromDate(app.deadline);
        if (fromDeadline != null) return fromDeadline;
        const created = Date.parse(app.createdAt || "");
        return Number.isFinite(created) ? new Date(created).getFullYear() : null;
      })
      .filter((y): y is number => y != null)
  ).sort((a, b) => b - a);

  const list = useMemo(() => {
    const filtered = allApps.filter((app) => {
      const hay = [app.title, app.organization, app.documentTitle, app.headerCompetition]
        .join(" ")
        .toLowerCase();
      if (search && !hay.includes(search.toLowerCase())) return false;
      if (kindFilter !== "all" && app.kind !== kindFilter) return false;
      if (yearFilter !== "all") {
        const y =
          yearFromDate(app.deadline) ??
          (Number.isFinite(Date.parse(app.createdAt || ""))
            ? new Date(app.createdAt).getFullYear()
            : null);
        if (y !== yearFilter) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const aMs = Math.max(
        dateToMs(a.deadline) || 0,
        Date.parse(a.updatedAt || "") || 0,
        Date.parse(a.createdAt || "") || 0
      );
      const bMs = Math.max(
        dateToMs(b.deadline) || 0,
        Date.parse(b.updatedAt || "") || 0,
        Date.parse(b.createdAt || "") || 0
      );
      return bMs - aMs;
    });
  }, [allApps, search, kindFilter, yearFilter]);

  function leaveEditor() {
    (guard ?? ((action: () => void) => action()))(() => setEditing(null));
  }

  return (
    <section className="list-page applications-page">
      {editing !== null ? (
        <ApplicationEditor
          inventory={inventory}
          setInventory={setInventory}
          application={editing === "new" ? null : editing}
          onBack={leaveEditor}
          onError={onError}
          onToast={onToast}
          onDirtyChange={onDirtyChange}
          saveRef={saveRef}
        />
      ) : (
        <>
          <div className="page-head">
            <div>
              <p className="eyebrow">{t("applications.eyebrow")}</p>
              <h2>{t("applications.title")}</h2>
              <p className="page-lead">{t("applications.leadRecent")}</p>
            </div>
            <button
              type="button"
              className="cuentas-primary"
              onClick={() => setEditing("new")}
            >
              {t("applications.add")}
            </button>
          </div>

          <div className="list-toolbar">
            <input
              className="search-input grow"
              placeholder={t("applications.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="segmented small">
              {(
                [
                  ["all", t("applications.filter.all")],
                  ["concurso", t("applications.filter.contests")],
                  ["beca", t("applications.filter.grants")],
                  ["residencia", t("applications.filter.residencies")],
                  ["otro", t("applications.filter.other")]
                ] as Array<["all" | ApplicationKind, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`seg${kindFilter === value ? " active" : ""}`}
                  onClick={() => setKindFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="sort-control">
              {t("library.filter.year")}
              <select
                value={yearFilter === "all" ? "all" : String(yearFilter)}
                onChange={(event) => {
                  const value = event.target.value;
                  setYearFilter(value === "all" ? "all" : Number(value));
                }}
              >
                <option value="all">{t("common.all")}</option>
                <option value={String(thisYear)}>
                  {t("common.thisYearWith", { year: thisYear })}
                </option>
                {yearOptions
                  .filter((y) => y !== thisYear)
                  .map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
              </select>
            </label>
            {(search || kindFilter !== "all" || yearFilter !== "all") && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setSearch("");
                  setKindFilter("all");
                  setYearFilter("all");
                }}
              >
                {t("common.clear")}
              </button>
            )}
            <span className="count-pill">{list.length}</span>
          </div>

          {allApps.length === 0 ? (
            <div className="empty-friendly">
              <p>{t("applications.empty")}</p>
              <button type="button" onClick={() => setEditing("new")}>
                {t("applications.createFirst")}
              </button>
            </div>
          ) : list.length === 0 ? (
            <p className="muted">{t("applications.noMatch")}</p>
          ) : (
            <div className="app-line-list">
              <div className="app-line-head">
                <span>{t("applications.col.kind")}</span>
                <span>{t("applications.col.application")}</span>
                <span>{t("applications.col.organization")}</span>
                <span>{t("applications.col.date")}</span>
                <span>{t("applications.col.works")}</span>
                <span />
              </div>
              {list.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="app-line-row"
                  onClick={() => setEditing(app)}
                >
                  <span className="app-line-row-grid">
                    <span className="expense-cat-pill">
                      {kindLabels[app.kind]}
                    </span>
                    <strong>{app.title}</strong>
                    <span>{app.organization || "—"}</span>
                    <span>
                      {app.deadline ||
                        (app.createdAt
                          ? app.createdAt
                              .slice(0, 10)
                              .split("-")
                              .reverse()
                              .join("-")
                          : "—")}
                    </span>
                    <span className="pricing-line-value">
                      {app.artworkIds.length}
                    </span>
                    <span className="pricing-line-chevron" aria-hidden>
                      ›
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ApplicationEditor({
  inventory,
  setInventory,
  application,
  onBack,
  onError,
  onToast,
  onDirtyChange,
  saveRef
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  application: Application | null;
  onBack: () => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: MutableRefObject<null | (() => Promise<boolean>)>;
}) {
  const t = useT();
  const { lang } = useLanguage();
  const initialLang: PriceLang =
    application?.language === "en" || application?.language === "de"
      ? application.language
      : "es";
  const defaults = headingDefaults(initialLang);

  const [form, setForm] = useState<ApplicationInput>(() =>
    application
      ? {
          id: application.id,
          title: application.title,
          kind: application.kind,
          organization: application.organization ?? "",
          deadline: application.deadline ?? "",
          documentTitle: application.documentTitle || application.title,
          coverSubtitle: application.coverSubtitle ?? "",
          coverDate: application.coverDate ?? "",
          coverNote: application.coverNote ?? "",
          coverStyles: application.coverStyles ?? {},
          sectionHeadingStyle: application.sectionHeadingStyle ?? {
            font: "Georgia",
            sizePt: 18,
            bold: true,
            italic: false
          },
          sectionBodyStyle: application.sectionBodyStyle ?? {
            font: "Georgia",
            sizePt: 12,
            bold: false,
            italic: false
          },
          sections: sectionsFromApplication(application, initialLang),
          headingWorks: application.headingWorks || defaults.works,
          language: initialLang,
          tocWorksMode: application.tocWorksMode || "list",
          showToc: application.showToc !== false,
          headerArtistName:
            application.headerArtistName ||
            (() => {
              try {
                return localStorage.getItem("solicitud-artist-name") || "";
              } catch {
                return "";
              }
            })(),
          headerCompetition:
            application.headerCompetition ||
            applicationKindLabel(application.kind),
          artworkIds: [...application.artworkIds]
        }
      : {
          title: "",
          kind: "concurso",
          organization: "",
          deadline: "",
          documentTitle: "",
          coverSubtitle: "",
          coverDate: "",
          coverNote: "",
          coverStyles: {},
          sectionHeadingStyle: {
            font: "Georgia",
            sizePt: 18,
            bold: true,
            italic: false
          },
          sectionBodyStyle: {
            font: "Georgia",
            sizePt: 12,
            bold: false,
            italic: false
          },
          sections: [],
          headingWorks: defaults.works,
          language: "es",
          tocWorksMode: "list",
          showToc: true,
          headerArtistName: (() => {
            try {
              return localStorage.getItem("solicitud-artist-name") || "";
            } catch {
              return "";
            }
          })(),
          headerCompetition: t("applications.kind.contest"),
          artworkIds: []
        }
  );
  const [showPicker, setShowPicker] = useState(false);
  const [previewImages, setPreviewImages] = useState<Record<string, string>>({});
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewZoom, setPreviewZoom] = useState(1);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const previewScrollRef = useRef(0);
  const previewZoomRef = useRef(previewZoom);
  previewZoomRef.current = previewZoom;
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({});

  function toggleBlock(id: string) {
    setOpenBlocks((current) => ({ ...current, [id]: !current[id] }));
  }
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [fontTitle, setFontTitle] = useState("Georgia");
  const [fontBody, setFontBody] = useState("Georgia");
  const [frameBorderColor, setFrameBorderColor] = useState("#d0c9bb");
  const [frameBorderWidth, setFrameBorderWidth] = useState(3);
  const [framePadding, setFramePadding] = useState(12);
  const [hideFrame, setHideFrame] = useState(false);
  const [pdfMaxMb, setPdfMaxMb] = useState(readStoredPdfMaxMb);
  const [previewSplitPct, setPreviewSplitPct] = useState(() => {
    try {
      const raw = Number(localStorage.getItem("solicitud-preview-split"));
      if (Number.isFinite(raw) && raw >= 25 && raw <= 70) return raw;
    } catch {
      /* ignore */
    }
    return 40;
  });
  const splitDragging = useRef(false);

  const language = (form.language as PriceLang) || "es";
  const sections = form.sections ?? [];

  const selectedArts = (form.artworkIds ?? [])
    .map((id) => inventory.artworks.find((art) => art.id === id))
    .filter((art): art is Artwork => Boolean(art));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const art of selectedArts) {
        const image = mainImageFor(art, inventory);
        if (image?.absolutePath) {
          next[art.id] = await window.inventoryApi.imageToDataUrl(image.absolutePath);
        }
      }
      if (!cancelled) setPreviewImages(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedArts.map((a) => a.id).join("|"), inventory.images]);

  useEffect(() => {
    onDirtyChange?.(false);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markDirty() {
    onDirtyChange?.(true);
  }

  function set<K extends keyof ApplicationInput>(
    key: K,
    value: ApplicationInput[K],
    options?: { quiet?: boolean }
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    if (!options?.quiet) markDirty();
  }

  function setSections(next: ApplicationTextSection[], quiet = false) {
    set("sections", next, { quiet });
  }

  function setCoverLineStyle(
    key: keyof ApplicationCoverStyles,
    patch: Partial<CoverLineStyle>
  ) {
    setForm((current) => {
      const prev = current.coverStyles ?? {};
      const merged: CoverLineStyle = { ...(prev[key] ?? {}), ...patch };
      const cleaned: CoverLineStyle = {};
      if (merged.font?.trim()) cleaned.font = merged.font.trim();
      if (merged.sizePt != null && Number.isFinite(merged.sizePt)) {
        cleaned.sizePt = merged.sizePt;
      }
      if (merged.bold === true) cleaned.bold = true;
      if (merged.bold === false) cleaned.bold = false;
      if (merged.italic === true) cleaned.italic = true;
      if (merged.italic === false) cleaned.italic = false;
      const next: ApplicationCoverStyles = { ...prev };
      if (Object.keys(cleaned).length > 0) next[key] = cleaned;
      else delete next[key];
      return { ...current, coverStyles: next };
    });
    markDirty();
  }

  function setSectionHeadingStyle(patch: Partial<CoverLineStyle>) {
    setForm((current) => {
      const merged: CoverLineStyle = {
        ...(current.sectionHeadingStyle ?? {}),
        ...patch
      };
      const cleaned: CoverLineStyle = {};
      if (merged.font?.trim()) cleaned.font = merged.font.trim();
      if (merged.sizePt != null && Number.isFinite(merged.sizePt)) {
        cleaned.sizePt = merged.sizePt;
      }
      if (merged.bold === true) cleaned.bold = true;
      if (merged.bold === false) cleaned.bold = false;
      if (merged.italic === true) cleaned.italic = true;
      if (merged.italic === false) cleaned.italic = false;
      return {
        ...current,
        sectionHeadingStyle:
          Object.keys(cleaned).length > 0 ? cleaned : undefined
      };
    });
    markDirty();
  }

  function setSectionBodyStyle(patch: Partial<CoverLineStyle>) {
    setForm((current) => {
      const merged: CoverLineStyle = {
        ...(current.sectionBodyStyle ?? {}),
        ...patch
      };
      const cleaned: CoverLineStyle = {};
      if (merged.font?.trim()) cleaned.font = merged.font.trim();
      if (merged.sizePt != null && Number.isFinite(merged.sizePt)) {
        cleaned.sizePt = merged.sizePt;
      }
      if (merged.bold === true) cleaned.bold = true;
      if (merged.bold === false) cleaned.bold = false;
      if (merged.italic === true) cleaned.italic = true;
      if (merged.italic === false) cleaned.italic = false;
      return {
        ...current,
        sectionBodyStyle: Object.keys(cleaned).length > 0 ? cleaned : undefined
      };
    });
    markDirty();
  }

  function changeLanguage(next: PriceLang) {
    setForm((current) => {
      const patch: ApplicationInput = { ...current, language: next };
      const defs = headingDefaults(next);
      if (isDefaultAppHeading(current.headingWorks, "works")) {
        patch.headingWorks = defs.works;
      }
      return patch;
    });
    markDirty();
  }

  function addSection() {
    const id = `sec-${Date.now()}`;
    setSections([
      ...sections,
      {
        id,
        heading: headingDefaults(language).aboutWorks,
        bodyHtml: ""
      }
    ]);
    setOpenBlocks((current) => ({ ...current, textos: true }));
    setOpenSectionId(id);
  }

  function updateSection(id: string, patch: Partial<ApplicationTextSection>) {
    setSections(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeSection(id: string) {
    setSections(sections.filter((s) => s.id !== id));
    if (openSectionId === id) setOpenSectionId(null);
  }

  async function persist(): Promise<boolean> {
    if (!form.title.trim()) {
      onError(t("application.error.needName"));
      return false;
    }
    setBusy(true);
    try {
      const data = await requireApi("saveApplication", t)(form);
      setInventory(data);
      const saved =
        data.applications.find((a) => a.id === form.id) ||
        [...data.applications].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt)
        )[0] ||
        null;
      if (saved) {
        setForm((current) => ({
          ...current,
          id: saved.id,
          sections: sectionsFromApplication(saved, language)
        }));
      }
      onDirtyChange?.(false);
      onToast(t("application.toast.saved"));
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : t("common.error.save"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => persist();
    return () => {
      if (saveRef) saveRef.current = null;
    };
  });

  function buildPayload() {
    const rows = selectedArts.map((art) => ({
      title: art.title,
      series: art.series ?? "",
      material: artTypeLabel(inventory, art.type, language),
      size: formatSize(art),
      year: art.yearMade ?? "",
      imageDataUrl: previewImages[art.id] || undefined
    }));
    const defs = headingDefaults(language);
    return {
      title: (form.documentTitle || form.title || "").trim() || "Solicitud",
      coverSubtitle: form.coverSubtitle,
      coverDate: form.coverDate,
      coverNote: form.coverNote,
      organization: form.organization,
      coverStyles: form.coverStyles,
      sections: sections.map((s) => ({
        heading: s.heading,
        bodyHtml: s.bodyHtml
      })),
      headingWorks: form.headingWorks || defs.works,
      seriesPrefix: defs.seriesPrefix,
      noSeriesLabel: defs.noSeries,
      sizeLabel: defs.sizeLabel,
      yearLabel: defs.yearLabel,
      typeLabel: defs.typeLabel,
      tocLabel: defs.tocLabel,
      sectionsLabel: defs.sectionsLabel,
      emptyImageLabel: defs.emptyImage,
      tocWorksMode: form.tocWorksMode || "list",
      showToc: form.showToc !== false,
      workSingularLabel: defs.workSingular,
      workPluralLabel: defs.workPlural,
      headerArtistName: form.headerArtistName,
      headerCompetition: form.headerCompetition,
      style: {
        fontTitle,
        fontBody,
        titleColor: "#1a1a1a",
        titleBold: true,
        titleItalic: false,
        metaColor: "#7a7368",
        frameBorderColor,
        frameBorderWidth,
        framePadding,
        showFrame: !hideFrame,
        sectionHeading: form.sectionHeadingStyle,
        sectionBody: form.sectionBodyStyle
      },
      rows
    };
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setPreviewHtml(buildApplicationHtml(buildPayload()));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [
    form.title,
    form.documentTitle,
    form.coverSubtitle,
    form.coverDate,
    form.coverNote,
    form.organization,
    JSON.stringify(form.coverStyles ?? {}),
    JSON.stringify(form.sectionHeadingStyle ?? {}),
    JSON.stringify(form.sectionBodyStyle ?? {}),
    form.headingWorks,
    form.tocWorksMode,
    form.showToc,
    form.headerArtistName,
    form.headerCompetition,
    language,
    JSON.stringify(sections),
    selectedArts.map((a) => a.id).join("|"),
    JSON.stringify(previewImages),
    fontTitle,
    fontBody,
    frameBorderColor,
    frameBorderWidth,
    framePadding,
    hideFrame
  ]);

  useEffect(() => {
    const iframe = previewFrameRef.current;
    if (!iframe || !previewHtml) return;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!doc || !win) return;
    try {
      previewScrollRef.current =
        win.scrollY || doc.documentElement.scrollTop || doc.body?.scrollTop || 0;
    } catch {
      /* ignore */
    }
    doc.open();
    doc.write(previewHtml);
    doc.close();
    const y = previewScrollRef.current;
    const applyZoom = () => {
      try {
        const setZoom = (
          win as Window & { setPreviewZoom?: (z: number) => void }
        ).setPreviewZoom;
        if (typeof setZoom === "function") setZoom(previewZoomRef.current);
      } catch {
        /* ignore */
      }
    };
    const restore = () => {
      try {
        win.scrollTo(0, y);
        if (doc.documentElement) doc.documentElement.scrollTop = y;
        if (doc.body) doc.body.scrollTop = y;
      } catch {
        /* ignore */
      }
      applyZoom();
    };
    restore();
    requestAnimationFrame(restore);
    window.setTimeout(restore, 60);
    window.setTimeout(restore, 220);
  }, [previewHtml]);

  useEffect(() => {
    const win = previewFrameRef.current?.contentWindow as
      | (Window & { setPreviewZoom?: (z: number) => void })
      | null
      | undefined;
    if (!win || typeof win.setPreviewZoom !== "function") return;
    try {
      win.setPreviewZoom(previewZoom);
    } catch {
      /* ignore */
    }
  }, [previewZoom]);

  function nudgePreviewZoom(delta: number) {
    setPreviewZoom((current) =>
      Math.max(0.4, Math.min(2.5, Math.round((current + delta) * 10) / 10))
    );
  }

  function onSplitPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    const layout = handle.parentElement;
    if (!layout) return;
    splitDragging.current = true;
    handle.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent) => {
      if (!splitDragging.current) return;
      const rect = layout.getBoundingClientRect();
      if (rect.width < 80) return;
      const fromRight = rect.right - ev.clientX;
      const pct = Math.round((fromRight / rect.width) * 100);
      const next = Math.min(70, Math.max(25, pct));
      setPreviewSplitPct(next);
      try {
        localStorage.setItem("solicitud-preview-split", String(next));
      } catch {
        /* ignore */
      }
    };
    const onUp = () => {
      splitDragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function exportPdf() {
    await persist();
    setExportBusy(true);
    try {
      storePdfMaxMb(pdfMaxMb);
      const payload = buildPayload();
      payload.rows = selectedArts.map((art) => ({
        title: art.title,
        series: art.series ?? "",
        material: artTypeLabel(inventory, art.type, language),
        size: formatSize(art),
        year: art.yearMade ?? "",
        imagePath: mainImageFor(art, inventory)?.absolutePath,
        imageDataUrl: previewImages[art.id] || undefined
      }));
      const result = await requireApi("generateApplicationPdf", t)({
        ...payload,
        maxMb: parsePdfMaxMbInput(pdfMaxMb)
      });
      if (result) {
        const meta = pdfResultMeta(result);
        const size = formatPdfMb(meta?.bytes ?? 0, lang);
        const max = parsePdfMaxMbInput(pdfMaxMb);
        onToast(
          meta?.overLimit && max
            ? t("pdf.toast.over", { size: size || "PDF", max: String(max) })
            : size
              ? t("application.toast.pdfDone", { size })
              : t("application.toast.pdfDoneSimple")
        );
      }
    } catch (error) {
      onError(
        error instanceof Error ? error.message : t("application.error.pdf")
      );
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="application-editor">
      <div className="form-head">
        <div>
          <p className="eyebrow">{t("application.editor.eyebrow")}</p>
          <h2>{form.title || t("application.editor.newTitle")}</h2>
        </div>
        <div className="form-head-actions">
          <button type="button" className="ghost" onClick={onBack}>
            {t("common.back")}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={exportBusy}
            onClick={() => void exportPdf()}
          >
            {exportBusy ? "…" : t("application.editor.generatePdf")}
          </button>
          <button type="button" disabled={busy} onClick={() => void persist()}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>

      <div
        className="app-layout"
        style={{
          gridTemplateColumns: `minmax(260px, ${100 - previewSplitPct}fr) 8px minmax(200px, ${previewSplitPct}fr)`
        }}
      >
        <div className="app-config">
          <AppFormBlock
            title={t("application.block.details")}
            open={Boolean(openBlocks.ficha)}
            onToggle={() => toggleBlock("ficha")}
            summary={
              form.title.trim() || t("application.block.detailsSummary")
            }
          >
            <div className="form-grid two">
              <label>
                {t("application.field.listName")}
                <input
                  value={form.title}
                  placeholder={t("application.field.listNamePlaceholder")}
                  onChange={(event) => set("title", event.target.value)}
                />
              </label>
              <label>
                {t("applications.col.kind")}
                <select
                  value={form.kind}
                  onChange={(event) =>
                    set("kind", event.target.value as ApplicationKind)
                  }
                >
                  <option value="concurso">{t("applications.kind.contest")}</option>
                  <option value="beca">{t("applications.kind.grant")}</option>
                  <option value="residencia">{t("applications.kind.residency")}</option>
                  <option value="otro">{t("applications.kind.other")}</option>
                </select>
              </label>
              <label>
                {t("applications.col.deadline")}
                <DateField
                  value={form.deadline ?? ""}
                  onChange={(value) => set("deadline", value)}
                />
              </label>
              <label>
                {t("application.field.pdfLanguage")}
                <select
                  value={language}
                  onChange={(event) =>
                    changeLanguage(event.target.value as PriceLang)
                  }
                >
                  {PRICE_LANGS.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("pdf.maxMb.label")}
                <input
                  type="number"
                  min={1}
                  max={80}
                  step={1}
                  placeholder={t("pdf.maxMb.none")}
                  value={pdfMaxMb}
                  onChange={(event) => setPdfMaxMb(event.target.value)}
                />
              </label>
            </div>
            <p className="muted small-note">{t("pdf.maxMb.hint")}</p>
          </AppFormBlock>

          <AppFormBlock
            title={t("application.block.footer")}
            open={Boolean(openBlocks.pie)}
            onToggle={() => toggleBlock("pie")}
            summary={
              [form.headerArtistName, form.headerCompetition]
                .map((s) => s?.trim())
                .filter(Boolean)
                .join(" · ") || t("application.block.footerSummary")
            }
          >
            <p className="muted small-note">{t("application.footer.hint")}</p>
            <div className="form-grid two">
              <label>
                {t("application.field.artistName")}
                <input
                  value={form.headerArtistName ?? ""}
                  placeholder={t("application.field.artistNamePlaceholder")}
                  onChange={(event) => {
                    const value = event.target.value;
                    set("headerArtistName", value);
                    try {
                      localStorage.setItem("solicitud-artist-name", value);
                    } catch {
                      /* ignore */
                    }
                  }}
                />
              </label>
              <label>
                {t("application.field.competition")}
                <input
                  value={form.headerCompetition ?? ""}
                  placeholder={t("application.field.competitionPlaceholder")}
                  onChange={(event) => set("headerCompetition", event.target.value)}
                />
              </label>
            </div>
          </AppFormBlock>

          <AppFormBlock
            title={t("application.block.cover")}
            open={Boolean(openBlocks.portada)}
            onToggle={() => toggleBlock("portada")}
            summary={
              (form.documentTitle || "").trim() ||
              t("application.block.coverSummary")
            }
          >
            <p className="muted small-note">{t("application.cover.hint")}</p>
            <label className="checkbox-field application-toc-toggle">
              <input
                type="checkbox"
                checked={form.showToc !== false}
                onChange={(event) => set("showToc", event.target.checked)}
              />
              <span>{t("application.cover.showToc")}</span>
            </label>
            <div className="cover-portada-lines">
              <CoverLineEditor
                label={t("application.cover.above")}
                hint={t("application.cover.aboveHint")}
                value={form.coverSubtitle ?? ""}
                placeholder={t("application.cover.abovePlaceholder")}
                style={form.coverStyles?.above}
                defaultSize={10}
                defaultBold
                onValueChange={(value) => set("coverSubtitle", value)}
                onStyleChange={(patch) => setCoverLineStyle("above", patch)}
              />
              <CoverLineEditor
                label={t("application.cover.title")}
                hint={t("application.cover.titleHint")}
                value={form.documentTitle ?? ""}
                placeholder={t("application.cover.titlePlaceholder")}
                style={form.coverStyles?.title}
                defaultSize={28}
                defaultBold
                onValueChange={(value) => set("documentTitle", value)}
                onStyleChange={(patch) => setCoverLineStyle("title", patch)}
              />
              <CoverLineEditor
                label={t("application.cover.below")}
                hint={t("application.cover.belowHint")}
                value={form.organization ?? ""}
                placeholder={t("application.cover.belowPlaceholder")}
                style={form.coverStyles?.below}
                defaultSize={11.5}
                onValueChange={(value) => set("organization", value)}
                onStyleChange={(patch) => setCoverLineStyle("below", patch)}
              />
              <CoverLineEditor
                label={t("application.cover.second")}
                hint={t("application.cover.secondHint")}
                value={form.coverNote ?? ""}
                placeholder={t("application.cover.secondPlaceholder")}
                multiline
                style={form.coverStyles?.second}
                defaultSize={10.5}
                onValueChange={(value) => set("coverNote", value)}
                onStyleChange={(patch) => setCoverLineStyle("second", patch)}
              />
            </div>
          </AppFormBlock>

          <AppFormBlock
            title={t("application.block.works")}
            open={Boolean(openBlocks.obras)}
            onToggle={() => toggleBlock("obras")}
            summary={
              selectedArts.length
                ? `${selectedArts.length} ${
                    selectedArts.length === 1
                      ? t("common.workOne")
                      : t("common.workMany")
                  }`
                : t("application.block.worksSummary")
            }
            actions={
              <div className="row-actions">
                {(form.tocWorksMode || "list") === "bySeries" &&
                  selectedArts.length > 1 && (
                    <button
                      type="button"
                      className="ghost small"
                      title={t("application.works.sortSeriesTitle")}
                      onClick={() =>
                        set(
                          "artworkIds",
                          sortArtworkIdsBySeries(
                            form.artworkIds ?? [],
                            inventory,
                            headingDefaults(language).noSeries
                          )
                        )
                      }
                    >
                      {t("application.works.sortSeries")}
                    </button>
                  )}
                <button type="button" className="small" onClick={() => setShowPicker(true)}>
                  {t("textgen.pickWorks")}
                </button>
              </div>
            }
          >
            <label className="field">
              {t("application.field.worksHeading")}
              <input
                value={form.headingWorks ?? ""}
                placeholder={headingDefaults(language).works}
                onChange={(event) => set("headingWorks", event.target.value)}
              />
            </label>
            <label className="field">
              {t("application.field.tocMode")}
              <select
                value={form.tocWorksMode || "list"}
                onChange={(event) => {
                  const mode = event.target
                    .value as ApplicationInput["tocWorksMode"];
                  set("tocWorksMode", mode);
                  // Only when grouping by series: pull each series into one block.
                  if (mode === "bySeries") {
                    set(
                      "artworkIds",
                      flattenSeriesArtGroups(
                        groupArtworksBySeriesOrder(
                          form.artworkIds ?? [],
                          inventory,
                          headingDefaults(language).noSeries
                        )
                      )
                    );
                  }
                }}
              >
                <option value="list">{t("application.toc.list")}</option>
                <option value="bySeries">
                  {t("application.toc.bySeries")}
                </option>
                <option value="worksOnly">
                  {t("application.toc.worksOnly", {
                    label:
                      form.headingWorks ||
                      headingDefaults(language).works
                  })}
                </option>
              </select>
            </label>
            {(form.tocWorksMode || "list") === "bySeries" ? (
              <>
                <p className="muted small-note">
                  {t("application.works.orderSeriesHint")}
                </p>
                <ApplicationSeriesOrder
                  artworkIds={form.artworkIds ?? []}
                  inventory={inventory}
                  noSeriesLabel={headingDefaults(language).noSeries}
                  onChange={(ids, options) =>
                    set("artworkIds", ids, options)
                  }
                  onRemove={(id) =>
                    set(
                      "artworkIds",
                      (form.artworkIds ?? []).filter((item) => item !== id)
                    )
                  }
                />
              </>
            ) : (
              <>
                <p className="muted small-note">
                  {t("application.works.orderManualHint")}
                </p>
                {selectedArts.length === 0 ? (
                  <p className="muted small-note">
                    {t("application.works.noneChosen")}
                  </p>
                ) : (
                  <div className="expense-list">
                    {selectedArts.map((art, index) => (
                      <div className="expense-card" key={art.id}>
                        <OrderButtons
                          index={index}
                          total={selectedArts.length}
                          onMove={(dir) =>
                            set(
                              "artworkIds",
                              moveIdInListById(
                                form.artworkIds ?? [],
                                art.id,
                                dir
                              )
                            )
                          }
                        />
                        <div
                          className="expense-card-main"
                          style={{ cursor: "default" }}
                        >
                          <strong className="expense-note">{art.title}</strong>
                          <span className="muted expense-meta">
                            {art.series ||
                              headingDefaults(language).noSeries}
                            {art.yearMade ? ` · ${art.yearMade}` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="ghost danger small"
                          onClick={() =>
                            set(
                              "artworkIds",
                              (form.artworkIds ?? []).filter(
                                (id) => id !== art.id
                              )
                            )
                          }
                        >
                          {t("common.remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </AppFormBlock>

          <AppFormBlock
            title={t("application.editor.block5")}
            open={Boolean(openBlocks.textos)}
            onToggle={() => toggleBlock("textos")}
            summary={
              sections.length
                ? sections.length === 1
                  ? t("application.sections.countOne", { n: sections.length })
                  : t("application.sections.count", { n: sections.length })
                : t("application.block.textsSummary")
            }
            actions={
              <button type="button" className="ghost small" onClick={addSection}>
                {t("application.sections.add")}
              </button>
            }
          >
            {sections.length === 0 ? (
              <div className="empty-friendly">
                <p>{t("application.sections.emptyHint")}</p>
                <button type="button" onClick={addSection}>
                  {t("application.sections.addFirst")}
                </button>
              </div>
            ) : (
              <div className="app-section-list">
                <div className="app-section-heading-format">
                  <div className="app-section-heading-format-head">
                    <span className="cover-line-label">
                      {t("application.format.headings")}
                    </span>
                    <span className="cover-line-hint">
                      {t("application.format.headingsHint")}
                    </span>
                  </div>
                  <SharedTextFormatTools
                    ariaLabel={t("application.format.headingsAria")}
                    style={form.sectionHeadingStyle}
                    defaults={{ font: "Georgia", sizePt: 18, bold: true, italic: false }}
                    onChange={setSectionHeadingStyle}
                  />
                </div>
                <div className="app-section-heading-format">
                  <div className="app-section-heading-format-head">
                    <span className="cover-line-label">
                      {t("application.format.bodies")}
                    </span>
                    <span className="cover-line-hint">
                      {t("application.format.bodiesHint")}
                    </span>
                  </div>
                  <SharedTextFormatTools
                    ariaLabel={t("application.format.bodiesAria")}
                    style={form.sectionBodyStyle}
                    defaults={{
                      font: "Georgia",
                      sizePt: 12,
                      bold: false,
                      italic: false
                    }}
                    onChange={setSectionBodyStyle}
                  />
                </div>
                {sections.map((section, index) => {
                  const open = openSectionId === section.id;
                  const preview = (section.bodyHtml || "")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 80);
                  return (
                    <div
                      className={`app-section-card${open ? " open" : ""}`}
                      key={section.id}
                    >
                      <button
                        type="button"
                        className="app-section-summary"
                        onClick={() =>
                          setOpenSectionId(open ? null : section.id)
                        }
                      >
                        <strong>
                          {section.heading ||
                            t("application.sections.fallback", {
                              n: index + 1
                            })}
                        </strong>
                        {!open && preview && (
                          <span className="muted app-section-preview">
                            {preview}
                            {preview.length >= 80 ? "…" : ""}
                          </span>
                        )}
                        <span className="series-text-chevron">
                          {open ? "▾" : "▸"}
                        </span>
                      </button>
                      {open && (
                        <div className="app-section-body">
                          <label className="field">
                            {t("pricelist.field.header")}
                            <input
                              value={section.heading}
                              onChange={(event) =>
                                updateSection(section.id, {
                                  heading: event.target.value
                                })
                              }
                            />
                          </label>
                          <div className="field">
                            <span>{t("series.texts.body")}</span>
                            <RichTextField
                              key={section.id}
                              value={section.bodyHtml}
                              baseFont={form.sectionBodyStyle?.font ?? "Georgia"}
                              baseSizePt={form.sectionBodyStyle?.sizePt ?? 12}
                              baseBold={form.sectionBodyStyle?.bold ?? false}
                              baseItalic={form.sectionBodyStyle?.italic ?? false}
                              onChange={(html) =>
                                updateSection(section.id, { bodyHtml: html })
                              }
                            />
                          </div>
                          <button
                            type="button"
                            className="ghost danger small"
                            onClick={() => removeSection(section.id)}
                          >
                            {t("application.sections.remove")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </AppFormBlock>

          <AppFormBlock
            title={t("application.block.fonts")}
            open={Boolean(openBlocks.tipografia)}
            onToggle={() => toggleBlock("tipografia")}
            summary={`${fontTitle} · ${fontBody}`}
          >
            <div className="form-row">
              <label className="field">
                {t("application.field.fontWorks")}
                <select
                  value={fontTitle}
                  onChange={(event) => setFontTitle(event.target.value)}
                >
                  {PRICELIST_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t("application.field.fontBody")}
                <select
                  value={fontBody}
                  onChange={(event) => setFontBody(event.target.value)}
                >
                  {PRICELIST_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={hideFrame}
                  onChange={(event) => setHideFrame(event.target.checked)}
                />
                {t("application.field.noFrame")}
              </label>
            </div>
            {!hideFrame ? (
              <>
                <div className="form-row">
                  <label className="field">
                    {t("application.field.frameColor")}
                    <input
                      type="color"
                      className="color-chip"
                      value={frameBorderColor}
                      onChange={(event) => setFrameBorderColor(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    {t("application.field.frameWidth")}
                    <div className="range-inline">
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={1}
                        value={frameBorderWidth}
                        onChange={(event) =>
                          setFrameBorderWidth(Number(event.target.value))
                        }
                      />
                    </div>
                  </label>
                </div>
                <label className="field">
                  {t("application.field.framePadding")}
                  <div className="range-inline">
                    <input
                      type="range"
                      min={0}
                      max={40}
                      step={1}
                      value={framePadding}
                      onChange={(event) =>
                        setFramePadding(Number(event.target.value))
                      }
                    />
                  </div>
                </label>
              </>
            ) : (
              <label className="field">
                {t("application.field.imagePadding")}
                <div className="range-inline">
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={framePadding}
                    onChange={(event) =>
                      setFramePadding(Number(event.target.value))
                    }
                  />
                </div>
              </label>
            )}
            <p className="muted small-note">{t("application.frame.note")}</p>
          </AppFormBlock>
        </div>

        <div
          className="app-split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("application.preview.resizeAria")}
          title={t("application.preview.resizeTitle")}
          onPointerDown={onSplitPointerDown}
        />

        <div className="pl-preview-pane">
          <div className="app-preview-toolbar">
            <span className="pl-fp-label muted">
              {t("application.preview.label", { n: selectedArts.length })}
            </span>
            <div className="app-preview-zoom">
              <button
                type="button"
                className="ghost small app-zoom-btn"
                aria-label={t("common.zoomOut")}
                disabled={previewZoom <= 0.4}
                onClick={() => nudgePreviewZoom(-0.1)}
              >
                −
              </button>
              <button
                type="button"
                className="ghost small app-zoom-pct"
                title={t("common.zoomReset")}
                onClick={() => setPreviewZoom(1)}
              >
                {Math.round(previewZoom * 100)}%
              </button>
              <button
                type="button"
                className="ghost small app-zoom-btn"
                aria-label={t("common.zoomIn")}
                disabled={previewZoom >= 2.5}
                onClick={() => nudgePreviewZoom(0.1)}
              >
                +
              </button>
            </div>
          </div>
          <iframe
            ref={previewFrameRef}
            className="app-pdf-frame"
            title={t("application.preview.frameTitle")}
          />
        </div>
      </div>

      {showPicker && (
        <ArtworkPickerModal
          inventory={inventory}
          excludeIds={[]}
          initialIds={form.artworkIds ?? []}
          title={t("application.picker.works")}
          onConfirm={(ids) => {
            const current = form.artworkIds ?? [];
            const kept = current.filter((id) => ids.includes(id));
            const added = ids.filter((id) => !current.includes(id));
            const merged = [...kept, ...added];
            set(
              "artworkIds",
              (form.tocWorksMode || "list") === "bySeries"
                ? flattenSeriesArtGroups(
                    groupArtworksBySeriesOrder(
                      merged,
                      inventory,
                      headingDefaults(language).noSeries
                    )
                  )
                : merged
            );
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function PriceListPage({
  inventory,
  setInventory,
  preset,
  onPresetConsumed,
  onError,
  onToast,
  onDirtyChange,
  saveRef,
  guard,
  resetToken = 0
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  preset: PriceListPreset | null;
  onPresetConsumed?: () => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: MutableRefObject<null | (() => Promise<boolean>)>;
  guard?: (action: () => void) => void;
  resetToken?: number;
}) {
  const t = useT();
  const hasLaunchPreset = Boolean(
    preset?.exhibitionId || (preset?.artworkIds && preset.artworkIds.length > 0)
  );
  const [launchPreset, setLaunchPreset] = useState<PriceListPreset | null>(
    hasLaunchPreset ? preset : null
  );
  const [editing, setEditing] = useState<PriceListDoc | null | "new">(
    hasLaunchPreset ? "new" : null
  );
  const [search, setSearch] = useState("");

  const lastResetToken = useRef(resetToken);
  useEffect(() => {
    if (resetToken === lastResetToken.current) return;
    lastResetToken.current = resetToken;
    setEditing(null);
    setLaunchPreset(null);
    onDirtyChange?.(false);
  }, [resetToken, onDirtyChange]);

  // Opening from an exhibition (or with preselected works) jumps straight into a new draft.
  useEffect(() => {
    if (!preset?.exhibitionId && !(preset?.artworkIds && preset.artworkIds.length > 0)) {
      return;
    }
    setLaunchPreset(preset);
    setEditing("new");
    onPresetConsumed?.();
  }, [preset, onPresetConsumed]);

  const allDocs = inventory.priceLists ?? [];
  const list = useMemo(() => {
    const filtered = allDocs.filter((doc) => {
      const hay = [doc.title, doc.header, doc.subtitle, doc.leftHeader]
        .join(" ")
        .toLowerCase();
      if (search && !hay.includes(search.toLowerCase())) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const aMs = Date.parse(a.updatedAt || a.createdAt || "") || 0;
      const bMs = Date.parse(b.updatedAt || b.createdAt || "") || 0;
      return bMs - aMs;
    });
  }, [allDocs, search]);

  function leaveEditor() {
    (guard ?? ((action: () => void) => action()))(() => {
      setEditing(null);
      setLaunchPreset(null);
    });
  }

  function formatUpdated(iso: string | undefined): string {
    if (!iso) return "—";
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return "—";
    return new Date(ms).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  return (
    <section className="list-page pricelist-page">
      {editing !== null ? (
        <PriceListEditor
          inventory={inventory}
          setInventory={setInventory}
          document={editing === "new" ? null : editing}
          preset={editing === "new" ? launchPreset : null}
          onBack={leaveEditor}
          onError={onError}
          onToast={onToast}
          onDirtyChange={onDirtyChange}
          saveRef={saveRef}
        />
      ) : (
        <>
          <div className="page-head">
            <div>
              <p className="eyebrow">{t("pricelist.eyebrow")}</p>
              <h2>{t("pricelist.title")}</h2>
              <p className="page-lead">{t("pricelist.lead")}</p>
            </div>
            <button
              type="button"
              className="cuentas-primary"
              onClick={() => {
                setLaunchPreset(null);
                setEditing("new");
              }}
            >
              {t("pricelist.add")}
            </button>
          </div>

          <div className="list-toolbar">
            <input
              className="search-input grow"
              placeholder={t("pricelist.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button
                type="button"
                className="ghost"
                onClick={() => setSearch("")}
              >
                {t("common.clear")}
              </button>
            ) : null}
            <span className="count-pill">{list.length}</span>
          </div>

          {allDocs.length === 0 ? (
            <div className="empty-friendly">
              <p>{t("pricelist.empty")}</p>
              <button
                type="button"
                onClick={() => {
                  setLaunchPreset(null);
                  setEditing("new");
                }}
              >
                {t("pricelist.createFirst")}
              </button>
            </div>
          ) : list.length === 0 ? (
            <p className="muted">{t("pricelist.noMatch")}</p>
          ) : (
            <div className="app-line-list">
              <div className="app-line-head pl-line-head">
                <span>{t("pricelist.col.name")}</span>
                <span>{t("pricelist.col.mode")}</span>
                <span>{t("pricelist.col.works")}</span>
                <span>{t("pricelist.col.updated")}</span>
                <span />
              </div>
              {list.map((doc) => {
                const exh =
                  doc.mode === "exhibition" && doc.exhibitionId
                    ? inventory.exhibitions.find((e) => e.id === doc.exhibitionId)
                    : undefined;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    className="app-line-row pl-line-row"
                    onClick={() => setEditing(doc)}
                  >
                    <span className="app-line-row-grid pl-line-row-grid">
                      <strong>
                        {doc.title || doc.header || t("pricelist.untitled")}
                      </strong>
                      <span>
                        {doc.mode === "exhibition"
                          ? exh?.title || t("pricelist.mode.exhibition")
                          : doc.mode === "series"
                            ? doc.seriesName?.trim() ||
                              t("pricelist.mode.series")
                            : t("pricelist.mode.free")}
                      </span>
                      <span className="pricing-line-value">
                        {doc.artworkIds.length}
                      </span>
                      <span>{formatUpdated(doc.updatedAt || doc.createdAt)}</span>
                      <span className="pricing-line-chevron" aria-hidden>
                        ›
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function clampPricelistFontSize(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(36, Math.max(8, Math.round(n * 2) / 2));
}

function readStoredPdfMaxMb(): string {
  try {
    return localStorage.getItem("pdf-max-mb") ?? "";
  } catch {
    return "";
  }
}

function storePdfMaxMb(value: string) {
  try {
    localStorage.setItem("pdf-max-mb", value);
  } catch {
    /* ignore */
  }
}

function parsePdfMaxMbInput(raw: string): number | undefined {
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(80, Math.max(1, Math.round(n * 10) / 10));
}

function formatPdfMb(bytes: number, lang: string): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  const value = mb < 9.95 ? mb.toFixed(1) : String(Math.round(mb));
  const localized = lang === "en" ? value : value.replace(".", ",");
  return `${localized} MB`;
}

function pdfResultMeta(result: unknown): { bytes: number; overLimit: boolean } | null {
  if (!result) return null;
  if (typeof result === "string") return { bytes: 0, overLimit: false };
  if (typeof result === "object") {
    const bytes = Number((result as { bytes?: unknown }).bytes);
    const overLimit = (result as { overLimit?: unknown }).overLimit === true;
    return {
      bytes: Number.isFinite(bytes) ? bytes : 0,
      overLimit
    };
  }
  return null;
}

function initialPriceFontSize(document: PriceListDoc | null): number {
  if (document?.priceFontSize != null) {
    return clampPricelistFontSize(document.priceFontSize, 15);
  }
  if (document?.priceSize === "text") return 12.5;
  if (document?.priceSize === "large") return 18;
  return 15;
}

function PriceListEditor({
  inventory,
  setInventory,
  document,
  preset,
  onBack,
  onError,
  onToast,
  onDirtyChange,
  saveRef
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  document: PriceListDoc | null;
  preset: PriceListPreset | null;
  onBack: () => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: MutableRefObject<null | (() => Promise<boolean>)>;
}) {
  const t = useT();
  const { lang } = useLanguage();
  const [docId, setDocId] = useState(document?.id ?? "");
  const [mode, setMode] = useState<"free" | "exhibition" | "series">(
    document?.mode ?? (preset?.exhibitionId ? "exhibition" : "free")
  );
  const [exhibitionId, setExhibitionId] = useState(
    document?.exhibitionId ?? preset?.exhibitionId ?? ""
  );
  const [seriesName, setSeriesName] = useState(document?.seriesName ?? "");
  const [freeSelected, setFreeSelected] = useState<string[]>(
    document?.mode === "free"
      ? document.artworkIds
      : preset?.artworkIds ?? []
  );
  const [exhibitionOrder, setExhibitionOrder] = useState<string[]>(
    document?.mode === "exhibition" ? document.artworkIds : []
  );
  const [seriesOrder, setSeriesOrder] = useState<string[]>(
    document?.mode === "series" ? document.artworkIds : []
  );
  const [priceOverrides, setPriceOverrides] = useState<Record<string, string>>(
    () => ({ ...(document?.priceOverrides ?? {}) })
  );
  const [showPricesModal, setShowPricesModal] = useState(false);
  const [bulkPriceMode, setBulkPriceMode] = useState<"free" | "factors">(
    "factors"
  );
  const [factorDateIso, setFactorDateIso] = useState(() => todayIsoLocal());
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [fillAllDraft, setFillAllDraft] = useState("");
  const [header, setHeader] = useState(document?.header ?? "");
  const [subtitle, setSubtitle] = useState(document?.subtitle ?? "");
  const [leftHeader, setLeftHeader] = useState(document?.leftHeader ?? "");
  const [rightHeader, setRightHeader] = useState(document?.rightHeader ?? "");
  const [showPrice, setShowPrice] = useState(document?.showPrice !== false);
  const [imagesPerPage, setImagesPerPage] = useState(document?.imagesPerPage ?? 4);
  const [language, setLanguage] = useState<PriceLang>(document?.language ?? "es");
  const [fontHeader, setFontHeader] = useState(document?.fonts?.header ?? "Georgia");
  const [fontSubtitle, setFontSubtitle] = useState(
    document?.fonts?.subtitle ?? "Georgia"
  );
  const [fontBody, setFontBody] = useState(document?.fonts?.body ?? "Georgia");
  const [headerBold, setHeaderBold] = useState(document?.headerStyle?.bold !== false);
  const [headerItalic, setHeaderItalic] = useState(
    document?.headerStyle?.italic === true
  );
  const [headerColor, setHeaderColor] = useState(
    document?.headerStyle?.color ?? "#1c1c1c"
  );
  const [subtitleItalic, setSubtitleItalic] = useState(
    document?.subtitleStyle?.italic !== false
  );
  const [subtitleColor, setSubtitleColor] = useState(
    document?.subtitleStyle?.color ?? "#555555"
  );
  const [priceBold, setPriceBold] = useState(document?.priceBold !== false);
  const [textBold, setTextBold] = useState(document?.textBold === true);
  const [titleFontSize, setTitleFontSize] = useState(
    clampPricelistFontSize(document?.titleFontSize, 15)
  );
  const [textFontSize, setTextFontSize] = useState(
    clampPricelistFontSize(document?.textFontSize, 12.5)
  );
  const [priceFontSize, setPriceFontSize] = useState(() =>
    initialPriceFontSize(document)
  );
  const [imageGap, setImageGap] = useState(document?.imageGap ?? 16);
  const [frameBorderColor, setFrameBorderColor] = useState(
    document?.frameBorderColor ?? "#e4e4e4"
  );
  const [pdfMaxMb, setPdfMaxMb] = useState(readStoredPdfMaxMb);
  const [customImages, setCustomImages] = useState<Record<string, string>>({});
  const [previewImages, setPreviewImages] = useState<Record<string, string>>({});
  const [showFreePicker, setShowFreePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewSplitPct, setPreviewSplitPct] = useState(() => {
    try {
      const raw = Number(localStorage.getItem("pricelist-preview-split"));
      if (Number.isFinite(raw) && raw >= 28 && raw <= 70) return raw;
    } catch {
      /* ignore */
    }
    return 48;
  });
  const [previewZoom, setPreviewZoom] = useState(1);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const splitDragging = useRef(false);

  function markDirty() {
    onDirtyChange?.(true);
  }

  function nudgePreviewZoom(delta: number) {
    setPreviewZoom((current) =>
      Math.max(0.4, Math.min(2.5, Math.round((current + delta) * 10) / 10))
    );
  }

  function onSplitPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    const layout = handle.parentElement;
    if (!layout) return;
    splitDragging.current = true;
    handle.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent) => {
      if (!splitDragging.current) return;
      const rect = layout.getBoundingClientRect();
      if (rect.width < 80) return;
      const fromRight = rect.right - ev.clientX;
      const pct = Math.round((fromRight / rect.width) * 100);
      const next = Math.min(70, Math.max(28, pct));
      setPreviewSplitPct(next);
      try {
        localStorage.setItem("pricelist-preview-split", String(next));
      } catch {
        /* ignore */
      }
    };
    const onUp = () => {
      splitDragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const artworkById = useMemo(
    () => new Map(inventory.artworks.map((art) => [art.id, art])),
    [inventory.artworks]
  );

  const seriesOptions = useMemo(() => {
    const names = new Set<string>();
    for (const art of inventory.artworks) {
      const name = String(art.series ?? "").trim();
      if (!name || isNoSeries(name)) continue;
      names.add(name);
    }
    for (const info of inventory.seriesInfo ?? []) {
      const name = String(info.name ?? "").trim();
      if (!name || isNoSeries(name)) continue;
      names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [inventory.artworks, inventory.seriesInfo]);

  const exhibitionArtworkIds = useMemo(() => {
    if (!exhibitionId) return [];
    return inventory.movements
      .filter(
        (movement) =>
          movement.exhibitionId === exhibitionId &&
          movementKind(movement.type) === "exhibition"
      )
      .map((movement) => movement.artworkId);
  }, [exhibitionId, inventory.movements]);

  const seriesArtworkIds = useMemo(() => {
    const target = seriesName.trim().toLowerCase();
    if (!target) return [];
    return inventory.artworks
      .filter(
        (art) =>
          String(art.series ?? "").trim().toLowerCase() === target &&
          !isNoSeries(art.series)
      )
      .map((art) => art.id);
  }, [seriesName, inventory.artworks]);

  useEffect(() => {
    if (mode !== "exhibition") return;
    setExhibitionOrder((prev) => {
      const keep = prev.filter((id) => exhibitionArtworkIds.includes(id));
      const add = exhibitionArtworkIds.filter((id) => !keep.includes(id));
      return [...keep, ...add];
    });
  }, [mode, exhibitionArtworkIds.join(",")]);

  useEffect(() => {
    if (mode !== "series") return;
    setSeriesOrder((prev) => {
      const keep = prev.filter((id) => seriesArtworkIds.includes(id));
      const add = seriesArtworkIds.filter((id) => !keep.includes(id));
      return [...keep, ...add];
    });
  }, [mode, seriesArtworkIds.join(",")]);

  const selectedIds =
    mode === "exhibition"
      ? exhibitionOrder
      : mode === "series"
        ? seriesOrder
        : freeSelected;

  function setSelectedIds(next: string[]) {
    if (mode === "exhibition") setExhibitionOrder(next);
    else if (mode === "series") setSeriesOrder(next);
    else setFreeSelected(next);
    markDirty();
  }

  useEffect(() => {
    if (document) return;
    if (mode === "exhibition" && exhibitionId) {
      const exh = inventory.exhibitions.find((item) => item.id === exhibitionId);
      if (!exh) return;
      if (!header) setHeader(exh.title);
      if (!leftHeader) {
        setLeftHeader([exh.venue, exh.city].filter(Boolean).join(", "));
      }
      if (!rightHeader && (exh.startDate || exh.endDate)) {
        const from = toSlashDate(exh.startDate);
        const to = toSlashDate(exh.endDate);
        setRightHeader(from && to ? `del ${from} al ${to}` : from || to);
      }
    }
    if (mode === "series" && seriesName.trim() && !header) {
      setHeader(seriesName.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, exhibitionId, seriesName]);

  // Load main-image data URLs for the on-screen preview.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const id of selectedIds) {
        const art = artworkById.get(id);
        const image = art ? mainImageFor(art, inventory) : undefined;
        if (image?.absolutePath) {
          next[id] = await window.inventoryApi.imageToDataUrl(image.absolutePath);
        }
      }
      if (!cancelled) setPreviewImages(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(","), inventory.images]);

  function listedPriceFor(artworkId: string): string {
    const override = String(priceOverrides[artworkId] ?? "").trim();
    if (override) return override;
    if (mode === "exhibition") {
      const mov = inventory.movements.find(
        (movement) =>
          movement.exhibitionId === exhibitionId &&
          movement.artworkId === artworkId &&
          movementKind(movement.type) === "exhibition"
      );
      if (mov?.listedPrice) return mov.listedPrice;
    }
    return artworkById.get(artworkId)?.soldPrice ?? "";
  }

  const pricingSettings: AppSettings = useMemo(
    () => ({
      sizeTypes: inventory.settings.sizeTypes ?? [],
      taxRates: inventory.settings.taxRates ?? [],
      fixedTypePrices: inventory.settings.fixedTypePrices ?? []
    }),
    [
      inventory.settings.sizeTypes,
      inventory.settings.taxRates,
      inventory.settings.fixedTypePrices
    ]
  );

  function factorPriceText(artworkId: string, dateIso: string): string {
    const art = artworkById.get(artworkId);
    if (!art) return "";
    const price = basePriceAt(art, pricingSettings, isoDateToMs(dateIso));
    return price != null ? String(Math.round(price)) : "";
  }

  function openPricesModal() {
    const today = todayIsoLocal();
    setFactorDateIso(today);
    setBulkPriceMode("factors");
    setFillAllDraft("");
    const drafts: Record<string, string> = {};
    for (const id of selectedIds) {
      drafts[id] = factorPriceText(id, today);
    }
    setPriceDrafts(drafts);
    setShowPricesModal(true);
  }

  function closePricesModal() {
    setShowPricesModal(false);
    setFillAllDraft("");
  }

  function fillDraftsFromFactors(dateIso: string) {
    const next: Record<string, string> = {};
    for (const id of selectedIds) {
      next[id] = factorPriceText(id, dateIso);
    }
    setPriceDrafts(next);
  }

  function applyPriceOverride(artworkId: string, value: string) {
    const cleaned = value.trim();
    setPriceOverrides((current) => {
      const next = { ...current };
      if (!cleaned) delete next[artworkId];
      else next[artworkId] = cleaned;
      return next;
    });
    markDirty();
  }

  function applyBulkPrices() {
    setPriceOverrides((current) => {
      const next = { ...current };
      for (const id of selectedIds) {
        const cleaned = String(priceDrafts[id] ?? "").trim();
        if (!cleaned) delete next[id];
        else next[id] = cleaned;
      }
      return next;
    });
    markDirty();
    closePricesModal();
  }

  // Mirrors rowImageHeight() in the PDF generator so the preview shows the
  // exact frame size the PDF will use.
  function previewFrameSize(perPage: number): number {
    const per = (980 - 110) / Math.max(1, perPage);
    return Math.max(60, Math.min(340, Math.round(per - 30)));
  }

  async function pickImage(id: string) {
    const dataUrl = await window.inventoryApi.pickImageDataUrl();
    if (dataUrl) {
      setCustomImages((current) => ({ ...current, [id]: dataUrl }));
      markDirty();
    }
  }

  function buildInput(): PriceListDocInput {
    return {
      id: docId || undefined,
      title: header.trim() || t("pricelist.untitled"),
      mode,
      exhibitionId: mode === "exhibition" ? exhibitionId : "",
      seriesName: mode === "series" ? seriesName.trim() : "",
      artworkIds: selectedIds,
      priceOverrides,
      header: header.trim(),
      subtitle: subtitle.trim(),
      leftHeader: leftHeader.trim(),
      rightHeader: rightHeader.trim(),
      showPrice,
      priceBold,
      titleFontSize,
      textFontSize,
      priceFontSize,
      textBold,
      imagesPerPage,
      imageGap,
      frameBorderColor,
      language,
      fonts: { header: fontHeader, subtitle: fontSubtitle, body: fontBody },
      headerStyle: { bold: headerBold, italic: headerItalic, color: headerColor },
      subtitleStyle: { italic: subtitleItalic, color: subtitleColor }
    };
  }

  async function persist(options?: { quiet?: boolean }): Promise<boolean> {
    if (!header.trim() && selectedIds.length === 0) {
      onError(t("pricelist.error.needTitle"));
      return false;
    }
    if (!options?.quiet) setBusy(true);
    try {
      const data = await requireApi("savePriceList", t)(buildInput());
      setInventory(data);
      const saved =
        data.priceLists?.find((item) => item.id === docId) ||
        [...(data.priceLists ?? [])].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt)
        )[0] ||
        null;
      if (saved) setDocId(saved.id);
      onDirtyChange?.(false);
      if (!options?.quiet) onToast(t("pricelist.toast.saved"));
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : t("common.error.save"));
      return false;
    } finally {
      if (!options?.quiet) setBusy(false);
    }
  }

  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => persist();
    return () => {
      if (saveRef) saveRef.current = null;
    };
  });

  async function generate() {
    if (selectedIds.length === 0) {
      onError(t("pricelist.error.needWorks"));
      return;
    }
    setBusy(true);
    try {
      // Autosave before export so the draft isn't lost.
      await persist({ quiet: true });
      const rows = [];
      for (const id of selectedIds) {
        const art = artworkById.get(id);
        if (!art) continue;
        const image = mainImageFor(art, inventory);
        rows.push({
          title: art.title,
          series: art.series ?? "",
          material: artTypeLabel(inventory, art.type, language),
          size: formatSize(art),
          year: art.yearMade ?? "",
          price: formatEuro(listedPriceFor(id)),
          imageDataUrl: customImages[id] || previewImages[id] || undefined,
          imagePath: customImages[id] ? undefined : image?.absolutePath,
          widthCm: toCm(art.width, art.unit),
          heightCm: toCm(art.height, art.unit)
        });
      }
      const result = await window.inventoryApi.generatePriceList({
        header: header || "Folleto de obras",
        subtitle,
        leftHeader,
        rightHeader,
        showPrice,
        priceBold,
        titleFontSize,
        textFontSize,
        priceFontSize,
        textBold,
        imagesPerPage,
        imageGap,
        frameBorderColor,
        fonts: { header: fontHeader, subtitle: fontSubtitle, body: fontBody },
        headerStyle: { bold: headerBold, italic: headerItalic, color: headerColor },
        subtitleStyle: { italic: subtitleItalic, color: subtitleColor },
        rows,
        maxMb: parsePdfMaxMbInput(pdfMaxMb)
      });
      if (result) {
        onError("");
        storePdfMaxMb(pdfMaxMb);
        const meta = pdfResultMeta(result);
        const size = formatPdfMb(meta?.bytes ?? 0, lang);
        const max = parsePdfMaxMbInput(pdfMaxMb);
        onToast(
          meta?.overLimit && max
            ? t("pdf.toast.over", { size: size || "PDF", max: String(max) })
            : size
              ? t("pricelist.toast.done", { size })
              : t("pricelist.toast.doneSimple")
        );
      }
    } catch (caught) {
      onError(
        caught instanceof Error ? caught.message : t("pricelist.error.generate")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="list-page pricelist-page">
      <div className="page-head">
        <div>
          <button type="button" className="ghost small" onClick={onBack}>
            ← {t("pricelist.back")}
          </button>
          <p className="eyebrow">{t("pricelist.eyebrow")}</p>
          <h2>{header.trim() || t("pricelist.untitled")}</h2>
        </div>
        <div className="form-head-actions">
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => void persist()}
          >
            {t("common.save")}
          </button>
          <button disabled={busy} onClick={() => void generate()}>
            {t("pricelist.generatePdf")}
          </button>
        </div>
      </div>

      <div
        className="app-layout pl-editor-layout"
        style={{
          gridTemplateColumns: `minmax(260px, ${100 - previewSplitPct}fr) 8px minmax(220px, ${previewSplitPct}fr)`
        }}
      >
        <div className="app-config pl-config">
          <div className="segmented">
            <button
              className={`seg ${mode === "free" ? "active" : ""}`}
              onClick={() => {
                setMode("free");
                markDirty();
              }}
            >
              {t("pricelist.mode.free")}
            </button>
            <button
              className={`seg ${mode === "exhibition" ? "active" : ""}`}
              onClick={() => {
                setMode("exhibition");
                markDirty();
              }}
            >
              {t("pricelist.mode.exhibition")}
            </button>
            <button
              className={`seg ${mode === "series" ? "active" : ""}`}
              onClick={() => {
                setMode("series");
                markDirty();
              }}
            >
              {t("pricelist.mode.series")}
            </button>
          </div>

          {mode === "exhibition" && (
            <label className="field">
              {t("movement.exhibition.select")}
              <select
                value={exhibitionId}
                onChange={(event) => {
                  setExhibitionId(event.target.value);
                  markDirty();
                }}
              >
                <option value="">{t("common.selectPlaceholder")}</option>
                {inventory.exhibitions.map((exh) => (
                  <option key={exh.id} value={exh.id}>
                    {exh.title}
                    {exh.startDate ? ` · ${exh.startDate}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === "series" && (
            <label className="field">
              {t("pricelist.series.select")}
              <select
                value={seriesName}
                onChange={(event) => {
                  setSeriesName(event.target.value);
                  markDirty();
                }}
              >
                <option value="">{t("common.selectPlaceholder")}</option>
                {seriesOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {!seriesName ? (
                <p className="muted small-note">{t("pricelist.series.pickHint")}</p>
              ) : seriesArtworkIds.length === 0 ? (
                <p className="muted small-note">{t("pricelist.series.empty")}</p>
              ) : null}
            </label>
          )}

          {mode === "free" && (
            <div className="pl-block">
              <div className="pl-block-head">
                <span className="pl-block-title">
                  {t("pricelist.chosenWorks", { count: freeSelected.length })}
                </span>
                <button type="button" onClick={() => setShowFreePicker(true)}>
                  {t("pricelist.addWorks")}
                </button>
              </div>
              {freeSelected.length === 0 && (
                <p className="muted small-note">{t("pricelist.pickHint")}</p>
              )}
            </div>
          )}

          {selectedIds.length > 0 && (
            <div className="pl-block">
              <div className="pl-block-head">
                <span className="pl-block-title">{t("pricelist.rowsTitle")}</span>
                <button
                  type="button"
                  className="ghost small"
                  onClick={openPricesModal}
                >
                  {t("pricelist.price.setAll")}
                </button>
              </div>
              <p className="muted small-note">{t("pricelist.rowsHint")}</p>
              <div className="pl-row-list">
                {selectedIds.map((id) => {
                  const art = artworkById.get(id);
                  if (!art) return null;
                  const price = listedPriceFor(id);
                  return (
                    <div
                      className={`pl-row-item${mode === "free" ? " has-remove" : ""}${
                        draggingRowId === id ? " is-dragging" : ""
                      }${
                        dragOverRowId === id && draggingRowId !== id
                          ? " is-drop-target"
                          : ""
                      }`}
                      key={id}
                      onDragOver={(event) => {
                        if (!draggingRowId || draggingRowId === id) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        if (dragOverRowId !== id) setDragOverRowId(id);
                      }}
                      onDragLeave={(event) => {
                        if (
                          event.currentTarget.contains(
                            event.relatedTarget as Node | null
                          )
                        ) {
                          return;
                        }
                        if (dragOverRowId === id) setDragOverRowId(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const fromId =
                          draggingRowId ||
                          event.dataTransfer.getData("text/plain");
                        if (!fromId || fromId === id) {
                          setDraggingRowId(null);
                          setDragOverRowId(null);
                          return;
                        }
                        const from = selectedIds.indexOf(fromId);
                        const to = selectedIds.indexOf(id);
                        if (from >= 0 && to >= 0 && from !== to) {
                          setSelectedIds(
                            reorderIdInList(selectedIds, from, to)
                          );
                        }
                        setDraggingRowId(null);
                        setDragOverRowId(null);
                      }}
                    >
                      <span
                        className="pl-row-drag"
                        draggable
                        role="button"
                        tabIndex={0}
                        title={t("pricelist.dragHandle")}
                        aria-label={t("pricelist.dragHandle")}
                        onDragStart={(event) => {
                          setDraggingRowId(id);
                          setDragOverRowId(null);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", id);
                          const row = event.currentTarget.closest(
                            ".pl-row-item"
                          ) as HTMLElement | null;
                          if (row) {
                            event.dataTransfer.setDragImage(row, 12, 16);
                          }
                        }}
                        onDragEnd={() => {
                          setDraggingRowId(null);
                          setDragOverRowId(null);
                        }}
                      >
                        ⋮⋮
                      </span>
                      <div className="pl-row-main">
                        <span className="pl-row-title" title={art.title}>
                          <bdi>{art.title}</bdi>
                        </span>
                      </div>
                      <label className="pl-row-price-field">
                        <span className="sr-only">
                          {t("pricelist.price.set")}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="pl-row-price-input"
                          value={price.replace(/[^\d.,]/g, "")}
                          placeholder="—"
                          onChange={(event) =>
                            applyPriceOverride(
                              id,
                              event.target.value.replace(/[^\d.,]/g, "")
                            )
                          }
                        />
                        <span className="pl-row-eur" aria-hidden>
                          €
                        </span>
                      </label>
                      <button
                        type="button"
                        className="ghost small pl-row-img-btn"
                        title={
                          customImages[id]
                            ? t("pricelist.changeImage")
                            : t("pricelist.otherImage")
                        }
                        onClick={() => pickImage(id)}
                      >
                        {t("pricelist.imageShort")}
                      </button>
                      {mode === "free" ? (
                        <div className="pl-row-remove">
                          <button
                            type="button"
                            className="link-button remove-link"
                            onClick={() => {
                              setFreeSelected((current) =>
                                current.filter((item) => item !== id)
                              );
                              markDirty();
                            }}
                          >
                            {t("common.remove")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <label className="field">
            {t("pricelist.field.headerFull")}
            <input
              value={header}
              placeholder={t("pricelist.headerPlaceholder")}
              onChange={(event) => {
                setHeader(event.target.value);
                markDirty();
              }}
            />
          </label>
          <label className="field">
            {t("pricelist.field.subtitleOptional")}
            <input
              value={subtitle}
              placeholder={t("pricelist.subtitlePlaceholder")}
              onChange={(event) => {
                setSubtitle(event.target.value);
                markDirty();
              }}
            />
          </label>

          <div className="form-row">
            <label className="field">
              {t("pricelist.field.leftFull")}
              <input
                value={leftHeader}
                placeholder={t("pricelist.leftPlaceholder")}
                onChange={(event) => {
                  setLeftHeader(event.target.value);
                  markDirty();
                }}
              />
            </label>
            <label className="field">
              {t("pricelist.field.rightFull")}
              <input
                value={rightHeader}
                placeholder={t("pricelist.rightPlaceholder")}
                onChange={(event) => {
                  setRightHeader(event.target.value);
                  markDirty();
                }}
              />
            </label>
          </div>

          <div className="form-row">
            <label className="field">
              {t("pricelist.field.artTypeLang")}
              <select
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value as PriceLang);
                  markDirty();
                }}
              >
                {PRICE_LANGS.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t("pricelist.field.perPageLabel")}
              <select
                value={imagesPerPage}
                onChange={(event) => {
                  setImagesPerPage(Number(event.target.value));
                  markDirty();
                }}
              >
                {[2, 3, 4, 5, 6].map((value) => (
                  <option key={value} value={value}>
                    {t("pricelist.field.perPage", { n: value })}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="checkline">
            <input
              type="checkbox"
              checked={showPrice}
              onChange={(event) => {
                setShowPrice(event.target.checked);
                markDirty();
              }}
            />
            {t("pricelist.field.showPriceEuros")}
          </label>

          <div className="pl-style-block">
            <span className="pl-block-title">{t("pricelist.style.letterSizes")}</span>
            <div className="pl-size-row">
              <label className="field">
                {t("pricelist.field.titleSize")}
                <input
                  type="number"
                  min={8}
                  max={36}
                  step={0.5}
                  value={titleFontSize}
                  onChange={(event) => {
                    setTitleFontSize(
                      clampPricelistFontSize(event.target.value, 15)
                    );
                    markDirty();
                  }}
                />
              </label>
              <label className="field">
                {t("pricelist.field.textSize")}
                <input
                  type="number"
                  min={8}
                  max={36}
                  step={0.5}
                  value={textFontSize}
                  onChange={(event) => {
                    setTextFontSize(
                      clampPricelistFontSize(event.target.value, 12.5)
                    );
                    markDirty();
                  }}
                />
              </label>
              {showPrice ? (
                <label className="field">
                  {t("pricelist.field.priceSize")}
                  <input
                    type="number"
                    min={8}
                    max={36}
                    step={0.5}
                    value={priceFontSize}
                    onChange={(event) => {
                      setPriceFontSize(
                        clampPricelistFontSize(event.target.value, 15)
                      );
                      markDirty();
                    }}
                  />
                </label>
              ) : null}
            </div>
            <label className="checkline">
              <input
                type="checkbox"
                checked={textBold}
                onChange={(event) => {
                  setTextBold(event.target.checked);
                  markDirty();
                }}
              />
              {t("pricelist.field.boldText")}
            </label>
            {showPrice ? (
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={priceBold}
                  onChange={(event) => {
                    setPriceBold(event.target.checked);
                    markDirty();
                  }}
                />
                {t("pricelist.field.boldPrice")}
              </label>
            ) : null}
          </div>

          <div className="pl-style-block">
            <span className="pl-block-title">{t("pdf.maxMb.label")}</span>
            <p className="muted small-note">{t("pdf.maxMb.hint")}</p>
            <label className="field">
              {t("pdf.maxMb.label")}
              <input
                type="number"
                min={1}
                max={80}
                step={1}
                placeholder={t("pdf.maxMb.none")}
                value={pdfMaxMb}
                onChange={(event) => setPdfMaxMb(event.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label className="field">
              {t("pricelist.field.imageGap")}
              <div className="range-inline">
                <input
                  type="range"
                  min={0}
                  max={120}
                  value={imageGap}
                  onChange={(event) => {
                    setImageGap(Number(event.target.value));
                    markDirty();
                  }}
                />
                <span className="range-value">{imageGap}px</span>
              </div>
            </label>
            <label className="field">
              {t("pricelist.field.frameColor")}
              <input
                type="color"
                className="color-chip"
                value={frameBorderColor}
                onChange={(event) => {
                  setFrameBorderColor(event.target.value);
                  markDirty();
                }}
              />
            </label>
          </div>

          <div className="pl-style-block">
            <span className="pl-block-title">{t("pricelist.style.title")}</span>
            <div className="pl-style-row">
              <select
                value={fontHeader}
                onChange={(event) => {
                  setFontHeader(event.target.value);
                  markDirty();
                }}
              >
                {PRICELIST_FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`toggle-chip ${headerBold ? "on" : ""}`}
                onClick={() => {
                  setHeaderBold((value) => !value);
                  markDirty();
                }}
              >
                <strong>N</strong>
              </button>
              <button
                type="button"
                className={`toggle-chip ${headerItalic ? "on" : ""}`}
                onClick={() => {
                  setHeaderItalic((value) => !value);
                  markDirty();
                }}
              >
                <em>C</em>
              </button>
              <input
                type="color"
                className="color-chip"
                value={headerColor}
                onChange={(event) => {
                  setHeaderColor(event.target.value);
                  markDirty();
                }}
              />
            </div>
          </div>

          <div className="pl-style-block">
            <span className="pl-block-title">{t("pricelist.style.subtitle")}</span>
            <div className="pl-style-row">
              <select
                value={fontSubtitle}
                onChange={(event) => {
                  setFontSubtitle(event.target.value);
                  markDirty();
                }}
              >
                {PRICELIST_FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`toggle-chip ${subtitleItalic ? "on" : ""}`}
                onClick={() => {
                  setSubtitleItalic((value) => !value);
                  markDirty();
                }}
              >
                <em>C</em>
              </button>
              <input
                type="color"
                className="color-chip"
                value={subtitleColor}
                onChange={(event) => {
                  setSubtitleColor(event.target.value);
                  markDirty();
                }}
              />
            </div>
          </div>

          <label className="field">
            {t("pricelist.field.bodyFont")}
            <select
              value={fontBody}
              onChange={(event) => {
                setFontBody(event.target.value);
                markDirty();
              }}
            >
              {PRICELIST_FONTS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          className="app-split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("pricelist.preview.resizeAria")}
          title={t("pricelist.preview.resizeTitle")}
          onPointerDown={onSplitPointerDown}
        />

        <div className="pl-preview-pane">
          <div className="app-preview-toolbar">
            <span className="pl-fp-label muted">
              {t("pricelist.preview.label", { n: selectedIds.length })}
            </span>
            <div className="app-preview-zoom">
              <button
                type="button"
                className="ghost small app-zoom-btn"
                aria-label={t("common.zoomOut")}
                disabled={previewZoom <= 0.4}
                onClick={() => nudgePreviewZoom(-0.1)}
              >
                −
              </button>
              <button
                type="button"
                className="ghost small app-zoom-pct"
                title={t("common.zoomReset")}
                onClick={() => setPreviewZoom(1)}
              >
                {Math.round(previewZoom * 100)}%
              </button>
              <button
                type="button"
                className="ghost small app-zoom-btn"
                aria-label={t("common.zoomIn")}
                disabled={previewZoom >= 2.5}
                onClick={() => nudgePreviewZoom(0.1)}
              >
                +
              </button>
            </div>
          </div>
          <div className="pl-paper">
            <div
              className="pl-sheet"
              style={{
                fontFamily: fontBody,
                zoom: 0.66 * previewZoom
              }}
            >
              {(leftHeader || rightHeader) && (
                <div className="pl-sheet-subhead">
                  <span className="pl-sheet-subhead-left">{leftHeader}</span>
                  <span>{rightHeader}</span>
                </div>
              )}
              <div
                className="pl-sheet-title"
                style={{
                  fontFamily: fontHeader,
                  color: headerColor,
                  fontWeight: headerBold ? 700 : 400,
                  fontStyle: headerItalic ? "italic" : "normal"
                }}
              >
                {header || "Folleto de obras"}
              </div>
              {subtitle && (
                <div
                  className="pl-sheet-subtitle"
                  style={{
                    fontFamily: fontSubtitle,
                    color: subtitleColor,
                    fontStyle: subtitleItalic ? "italic" : "normal"
                  }}
                >
                  {subtitle}
                </div>
              )}
              <div className="pl-sheet-rule" />
              {selectedIds.length === 0 ? (
                <p className="muted">
                  {mode === "exhibition"
                    ? t("pricelist.preview.pickExhibition")
                    : mode === "series"
                      ? t("pricelist.preview.pickSeries")
                      : t("pricelist.preview.addWorks")}
                </p>
              ) : (
                selectedIds.map((id, index) => {
                  const art = artworkById.get(id);
                  if (!art) return null;
                  const url = customImages[id] || previewImages[id];
                  const frameSize = previewFrameSize(imagesPerPage);
                  // Inner area (leaves an 8px pad + 1px border) so the frame
                  // border is always visible around the image, matching the PDF.
                  const innerSize = Math.max(20, frameSize - 2 * 9);
                  const pageBreakHere =
                    index > 0 && index % imagesPerPage === 0;
                  const wCm = toCm(art.width, art.unit) ?? 0;
                  const hCm = toCm(art.height, art.unit) ?? 0;
                  let iw = innerSize;
                  let ih = innerSize;
                  if (wCm > 0 && hCm > 0) {
                    const aspect = wCm / hCm;
                    if (aspect >= 1) ih = Math.round(innerSize / aspect);
                    else iw = Math.round(innerSize * aspect);
                  }
                  return (
                    <Fragment key={id}>
                      {pageBreakHere ? (
                        <div className="pl-page-break">
                          <span>
                            {t("pricelist.preview.page", {
                              n: Math.floor(index / imagesPerPage) + 1
                            })}
                          </span>
                        </div>
                      ) : null}
                      <div
                        className="pl-sheet-row"
                        style={
                          index === 0 || pageBreakHere
                            ? { borderTop: "1px solid #d8d8d8" }
                            : undefined
                        }
                      >
                        <div className="pl-sheet-imgcell">
                          <div
                            className="pl-sheet-frame"
                            style={{
                              width: `${frameSize}px`,
                              height: `${frameSize}px`,
                              borderColor: frameBorderColor
                            }}
                          >
                            {url ? (
                              <img
                                src={url}
                                alt={art.title}
                                style={{
                                  width: `${iw}px`,
                                  height: `${ih}px`,
                                  objectFit: "fill"
                                }}
                              />
                            ) : (
                              <span className="pl-sheet-noimg">
                                {t("common.noImage")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          className="pl-sheet-info"
                          style={{ paddingLeft: `${imageGap}px` }}
                        >
                          <div
                            className="pl-sheet-info-title"
                            style={{ fontSize: `${titleFontSize}px` }}
                          >
                            {art.title}
                          </div>
                          {art.series && (
                            <div
                              className="pl-sheet-meta"
                              style={{
                                fontSize: `${textFontSize}px`,
                                fontWeight: textBold ? 700 : 400
                              }}
                            >
                              {art.series}
                            </div>
                          )}
                          <div
                            className="pl-sheet-meta"
                            style={{
                              fontSize: `${textFontSize}px`,
                              fontWeight: textBold ? 700 : 400
                            }}
                          >
                            {artTypeLabel(inventory, art.type, language)}
                          </div>
                          <div
                            className="pl-sheet-meta"
                            style={{
                              fontSize: `${textFontSize}px`,
                              fontWeight: textBold ? 700 : 400
                            }}
                          >
                            {formatSize(art)}
                          </div>
                          {art.yearMade && (
                            <div
                              className="pl-sheet-meta"
                              style={{
                                fontSize: `${textFontSize}px`,
                                fontWeight: textBold ? 700 : 400
                              }}
                            >
                              {art.yearMade}
                            </div>
                          )}
                          {showPrice && (
                            <div
                              className="pl-sheet-price"
                              style={{
                                fontWeight: priceBold ? 700 : 400,
                                fontSize: `${priceFontSize}px`
                              }}
                            >
                              {formatEuro(listedPriceFor(id)) || "—"}
                            </div>
                          )}
                        </div>
                      </div>
                    </Fragment>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {showFreePicker && (
        <ArtworkPickerModal
          inventory={inventory}
          excludeIds={freeSelected}
          title={t("pricelist.picker.title")}
          onConfirm={(ids) => {
            setFreeSelected((current) => [...current, ...ids]);
            setShowFreePicker(false);
            markDirty();
          }}
          onClose={() => setShowFreePicker(false)}
        />
      )}

      {showPricesModal && (
        <div className="modal-backdrop" onClick={closePricesModal}>
          <div
            className="modal modal-wide pl-prices-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{t("pricelist.price.bulkTitle")}</h3>
              <button
                type="button"
                className="icon-button ghost"
                onClick={closePricesModal}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="segmented pl-price-mode-seg">
                <button
                  type="button"
                  className={`seg ${bulkPriceMode === "free" ? "active" : ""}`}
                  onClick={() => setBulkPriceMode("free")}
                >
                  {t("pricelist.price.modeFreeLong")}
                </button>
                <button
                  type="button"
                  className={`seg ${
                    bulkPriceMode === "factors" ? "active" : ""
                  }`}
                  onClick={() => {
                    setBulkPriceMode("factors");
                    fillDraftsFromFactors(factorDateIso);
                  }}
                >
                  {t("pricelist.price.modeFactorsLong")}
                </button>
              </div>

              {bulkPriceMode === "free" ? (
                <div className="pl-bulk-free-bar">
                  <p className="muted small-note">
                    {t("pricelist.price.bulkFreeHint")}
                  </p>
                  <label className="field pl-bulk-fill-all">
                    {t("pricelist.price.fillAll")}
                    <div className="pl-price-input-row">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fillAllDraft}
                        placeholder={t("pricelist.price.freePlaceholder")}
                        onChange={(event) =>
                          setFillAllDraft(
                            event.target.value.replace(/[^\d.,]/g, "")
                          )
                        }
                      />
                      <span className="muted">€</span>
                      <button
                        type="button"
                        className="ghost small"
                        disabled={!fillAllDraft.trim()}
                        onClick={() => {
                          const value = fillAllDraft.trim();
                          if (!value) return;
                          const next: Record<string, string> = {};
                          for (const id of selectedIds) next[id] = value;
                          setPriceDrafts(next);
                        }}
                      >
                        {t("pricelist.price.fillAllApply")}
                      </button>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="pl-bulk-factors-bar">
                  <p className="muted small-note">
                    {t("pricelist.price.bulkFactorsHint")}
                  </p>
                  <label className="field">
                    {t("pricelist.price.factorDate")}
                    <input
                      type="date"
                      value={factorDateIso}
                      onChange={(event) => {
                        const next = event.target.value || todayIsoLocal();
                        setFactorDateIso(next);
                        fillDraftsFromFactors(next);
                      }}
                    />
                  </label>
                </div>
              )}

              <div className="pl-bulk-list">
                {selectedIds.map((id) => {
                  const art = artworkById.get(id);
                  if (!art) return null;
                  const draft = priceDrafts[id] ?? "";
                  const factorMissing =
                    bulkPriceMode === "factors" && !draft;
                  const calcHint = priceCalcHint(
                    art,
                    pricingSettings,
                    bulkPriceMode === "factors"
                      ? isoDateToMs(factorDateIso)
                      : Date.now()
                  );
                  return (
                    <div className="pl-bulk-row" key={id}>
                      <div className="pl-bulk-main">
                        <span className="pl-bulk-title" title={art.title}>
                          <bdi>{art.title}</bdi>
                        </span>
                        {calcHint ? (
                          <span className="pl-bulk-calc" title={calcHint}>
                            {calcHint}
                          </span>
                        ) : null}
                      </div>
                      <div className="pl-price-input-row">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft}
                          placeholder={
                            factorMissing
                              ? t("pricelist.price.factorsNoneShort")
                              : t("pricelist.price.freePlaceholder")
                          }
                          onChange={(event) => {
                            const value = event.target.value.replace(
                              /[^\d.,]/g,
                              ""
                            );
                            setPriceDrafts((current) => ({
                              ...current,
                              [id]: value
                            }));
                            if (bulkPriceMode === "factors") {
                              setBulkPriceMode("free");
                            }
                          }}
                        />
                        <span className="muted">€</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={closePricesModal}
              >
                {t("common.cancel")}
              </button>
              <button type="button" onClick={applyBulkPrices}>
                {t("pricelist.price.applyAll")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const PRICELIST_FONTS = [
  "Georgia",
  "Times New Roman",
  "Garamond",
  "Baskerville",
  "Palatino",
  "Helvetica",
  "Arial",
  "Verdana",
  "Futura",
  "Courier New"
];

/** Discrete point sizes for text / encabezado / portada controls. */
const FONT_SIZE_PT_OPTIONS = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48
];

/** Body text sizes in the rich editor (Tamaño). */
const RICH_TEXT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24];

function SharedTextFormatTools({
  ariaLabel,
  style,
  defaults,
  onChange
}: {
  ariaLabel: string;
  style?: CoverLineStyle;
  defaults: {
    font: string;
    sizePt: number;
    bold: boolean;
    italic: boolean;
  };
  onChange: (patch: Partial<CoverLineStyle>) => void;
}) {
  const t = useT();
  const font = style?.font ?? defaults.font;
  const sizePt =
    style?.sizePt != null && Number.isFinite(style.sizePt)
      ? style.sizePt
      : defaults.sizePt;
  const boldOn = style?.bold ?? defaults.bold;
  const italicOn = style?.italic ?? defaults.italic;
  return (
    <div className="cover-line-tools">
      <select
        className="cover-line-font"
        aria-label={t("format.fontOf", { label: ariaLabel })}
        value={font}
        onChange={(event) =>
          onChange({
            font: event.target.value || defaults.font,
            sizePt,
            bold: boldOn,
            italic: italicOn
          })
        }
      >
        {PRICELIST_FONTS.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <label className="cover-line-size">
        <select
          aria-label={t("format.sizeOf", { label: ariaLabel })}
          value={String(sizePt)}
          onChange={(event) => {
            const n = Number(event.target.value);
            if (!Number.isFinite(n)) return;
            onChange({ sizePt: n });
          }}
        >
          {!FONT_SIZE_PT_OPTIONS.includes(sizePt) ? (
            <option value={sizePt}>{sizePt}</option>
          ) : null}
          {FONT_SIZE_PT_OPTIONS.map((pt) => (
            <option key={pt} value={pt}>
              {pt}
            </option>
          ))}
        </select>
        <span>pt</span>
      </label>
      <div
        className="cover-line-style-toggles"
        role="group"
        aria-label={t("format.styleOf", { label: ariaLabel })}
      >
        <button
          type="button"
          className={`toggle-chip${boldOn ? " on" : ""}`}
          title={t("format.boldBase")}
          onClick={() => onChange({ bold: !boldOn })}
        >
          N
        </button>
        <button
          type="button"
          className={`toggle-chip${italicOn ? " on" : ""}`}
          title={t("format.italicBase")}
          onClick={() => onChange({ italic: !italicOn })}
        >
          <em>I</em>
        </button>
      </div>
    </div>
  );
}

function AppFormBlock({
  title,
  summary,
  open,
  onToggle,
  actions,
  children
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`app-form-block${open ? " open" : ""}`}>
      <div className="app-form-block-head">
        <button
          type="button"
          className="app-form-block-summary"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className="app-form-block-title">{title}</span>
          {!open && summary ? (
            <span className="muted app-form-block-preview">{summary}</span>
          ) : null}
          <span className="series-text-chevron" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </button>
        {open && actions ? (
          <div className="app-form-block-actions">{actions}</div>
        ) : null}
      </div>
      {open ? <div className="app-form-block-body">{children}</div> : null}
    </div>
  );
}

function CoverLineEditor({
  label,
  hint,
  value,
  placeholder,
  multiline,
  style,
  defaultSize,
  defaultBold = false,
  defaultItalic = false,
  onValueChange,
  onStyleChange
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  style?: CoverLineStyle;
  defaultSize: number;
  defaultBold?: boolean;
  defaultItalic?: boolean;
  onValueChange: (value: string) => void;
  onStyleChange: (patch: Partial<CoverLineStyle>) => void;
}) {
  const t = useT();
  const sizeValue =
    style?.sizePt != null && Number.isFinite(style.sizePt)
      ? style.sizePt
      : defaultSize;
  const boldOn = style?.bold ?? defaultBold;
  const italicOn = style?.italic ?? defaultItalic;
  return (
    <div className="cover-line-card">
      <div className="cover-line-card-head">
        <span className="cover-line-label">{label}</span>
        {hint ? <span className="cover-line-hint">{hint}</span> : null}
      </div>
      {multiline ? (
        <textarea
          className="cover-line-input"
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onValueChange(event.target.value)}
        />
      ) : (
        <input
          className="cover-line-input"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onValueChange(event.target.value)}
        />
      )}
      <div className="cover-line-tools">
        <select
          className="cover-line-font"
          aria-label={t("format.fontFor", { label })}
          value={style?.font ?? ""}
          onChange={(event) =>
            onStyleChange({
              font: event.target.value || undefined,
              sizePt: style?.sizePt ?? defaultSize
            })
          }
        >
          <option value="">{t("format.fontDefault")}</option>
          {PRICELIST_FONTS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
        <label className="cover-line-size">
          <select
            aria-label={t("format.sizeFor", { label })}
            value={String(sizeValue)}
            onChange={(event) => {
              const n = Number(event.target.value);
              if (!Number.isFinite(n)) return;
              onStyleChange({ sizePt: n });
            }}
          >
            {!FONT_SIZE_PT_OPTIONS.includes(sizeValue) ? (
              <option value={sizeValue}>{sizeValue}</option>
            ) : null}
            {FONT_SIZE_PT_OPTIONS.map((pt) => (
              <option key={pt} value={pt}>
                {pt}
              </option>
            ))}
          </select>
          <span>pt</span>
        </label>
        <div
          className="cover-line-style-toggles"
          role="group"
          aria-label={t("format.style")}
        >
          <button
            type="button"
            className={`toggle-chip${boldOn ? " on" : ""}`}
            title={t("format.bold")}
            onClick={() => onStyleChange({ bold: !boldOn })}
          >
            N
          </button>
          <button
            type="button"
            className={`toggle-chip${italicOn ? " on" : ""}`}
            title={t("format.italic")}
            onClick={() => onStyleChange({ italic: !italicOn })}
          >
            <em>I</em>
          </button>
        </div>
      </div>
    </div>
  );
}

function SubTab({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const classes = ["subtab"];
  if (active) classes.push("active");
  return (
    <button type="button" className={classes.join(" ")} onClick={onClick}>
      {children}
    </button>
  );
}

function NavButton({
  active,
  onClick,
  children,
  className = ""
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      className={`nav-button${active ? " active" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function toInput(artwork: Artwork, inventory: InventoryData): ArtworkInput {
  return {
    id: artwork.id,
    title: artwork.title,
    series: artwork.series ?? "",
    type: artwork.type,
    yearMade: artwork.yearMade ?? "",
    height: artwork.height ?? "",
    width: artwork.width ?? "",
    depth: artwork.depth ?? "",
    unit: artwork.unit ?? "cm",
    status: artwork.status,
    galleryContactId: artwork.galleryContactId ?? "",
    editionMode: artwork.editionMode ?? "unique",
    editionPersonalCopies: artwork.editionPersonalCopies ?? "0",
    editionSaleCopies: artwork.editionSaleCopies ?? "0",
    notes: artwork.notes ?? "",
    mainImageId: artwork.mainImageId ?? "",
    editions: inventory.editions
      .filter((item) => item.artworkId === artwork.id)
      .map((item) => ({
        id: item.id,
        label: item.label,
        kind: item.kind,
        status: item.status || "not_made",
        notes: item.notes ?? ""
      })),
    movements: inventory.movements
      .filter((item) => item.artworkId === artwork.id)
      .map((item) => ({
        id: item.id,
        editionId: item.editionId ?? "",
        type: item.type,
        recipientType: item.recipientType ?? "person",
        contactId: item.contactId ?? "",
        exhibitionId: item.exhibitionId ?? "",
        context: item.context ?? "",
        returned: item.returned ?? true,
        keptAtGallery: item.keptAtGallery ?? false,
        date: item.date ?? "",
        price: item.price ?? "",
        currency: item.currency ?? "EUR",
        notes: item.notes ?? ""
      }))
  };
}

function sortArtworks(
  artworks: Artwork[],
  sort: SortKey,
  inventory: InventoryData,
  lang: Lang = "es"
): Artwork[] {
  const copy = [...artworks];
  switch (sort) {
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "series":
      return copy.sort((a, b) => {
        const bySeries = (a.series || "\uffff").localeCompare(
          b.series || "\uffff",
          "es",
          { sensitivity: "base" }
        );
        if (bySeries !== 0) return bySeries;
        return a.title.localeCompare(b.title, "es", { sensitivity: "base" });
      });
    case "year_desc":
      return copy.sort((a, b) => parseNum(b.yearMade) - parseNum(a.yearMade) || 0);
    case "year_asc":
      return copy.sort((a, b) => parseNum(a.yearMade) - parseNum(b.yearMade) || 0);
    case "type":
      return copy.sort((a, b) =>
        labelFor(inventory, "artworkType", a.type, lang).localeCompare(
          labelFor(inventory, "artworkType", b.type, lang)
        )
      );
    case "price_desc":
      return copy.sort((a, b) => num(b.soldPrice) - num(a.soldPrice));
    case "price_asc":
      return copy.sort((a, b) => num(a.soldPrice) - num(b.soldPrice));
    case "recent":
    default:
      return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

function num(value?: string): number {
  const parsed = parseNum(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Same list as `lookupOptions`, with the built-in values shown in the current
 * language. Values the user added themselves keep the label they typed.
 */
function translatedLookupOptions(
  inventory: InventoryData,
  category: string,
  lang: Lang
): LookupOption[] {
  return lookupOptions(inventory, category).map((option) => ({
    ...option,
    label: lookupLabel(lang, category, option.value, option.label)
  }));
}

function lookupOptions(inventory: InventoryData, category: string) {
  const seen = new Set<string>();
  const out: LookupOption[] = [];
  // Always surface built-in defaults (e.g. Ipad Drawings) even if this library
  // was created before they existed or the in-memory list is stale.
  for (const lookup of [
    ...DEFAULT_LOOKUPS.filter((item) => item.category === category),
    ...inventory.lookups.filter((item) => item.category === category)
  ]) {
    const key = lookup.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lookup);
  }
  return out;
}

/** Stored series value meaning the work is not part of any series. */
const NO_SERIES_VALUE = "no_series";

function isNoSeries(value?: string): boolean {
  return (value ?? "").trim() === NO_SERIES_VALUE;
}

function seriesLabel(value: string | undefined, t: Translate): string {
  const s = (value ?? "").trim();
  if (!s) return "—";
  if (isNoSeries(s)) return t("series.field.none");
  return s;
}

function labelFor(
  inventory: InventoryData,
  category: string,
  value?: string,
  lang: Lang = "es"
) {
  if (!value) return "";
  const translated = lookupLabel(lang, category, value, "");
  if (translated) return translated;
  return (
    inventory.lookups.find(
      (lookup) => lookup.category === category && lookup.value === value
    )?.label ?? value
  );
}

function contactName(inventory: InventoryData, id?: string) {
  if (!id) return "";
  return inventory.contacts.find((contact) => contact.id === id)?.name ?? "";
}

function exhibitionTitle(inventory: InventoryData, id?: string) {
  if (!id) return "";
  return inventory.exhibitions.find((item) => item.id === id)?.title ?? "";
}

function movementDateValue(movement: { date?: string; createdAt?: string }): number {
  const date = movement.date ?? "";
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date);
  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
  }
  // Movements without a date sort to the bottom (treated as oldest).
  return -Infinity;
}

function sortMovementsDesc<T extends { date?: string; createdAt?: string }>(
  movements: T[]
): T[] {
  return [...movements].sort(
    (a, b) => movementDateValue(b) - movementDateValue(a)
  );
}

function movementSummary(
  movement: Movement,
  inventory: InventoryData,
  t: Translate,
  lang: Lang = "es"
): string {
  if (movementKind(movement.type) === "exhibition") {
    const title =
      movement.exhibitionTitle || exhibitionTitle(inventory, movement.exhibitionId);
    return title
      ? t("movement.summary.exhibition", { title })
      : lookupLabel(
          lang,
          "movementType",
          "exhibition",
          t("exhibitions.col.exhibition")
        );
  }
  return labelFor(inventory, "movementType", movement.type, lang);
}

function movementSubtitle(
  movement: Movement,
  inventory: InventoryData,
  t: Translate
): string {
  if (movementKind(movement.type) === "exhibition") {
    return movement.returned
      ? t("movement.summary.returned")
      : movement.keptAtGallery
        ? t("movement.summary.withGalleryAfter")
        : t("movement.summary.inExhibition");
  }
  const parts: string[] = [];
  const who = movement.contactName || contactName(inventory, movement.contactId);
  if (who) parts.push(who);
  if (movement.price) parts.push(movement.price);
  return parts.join(" · ");
}

const DEFAULT_LOOKUP_KEYS = new Set([
  "artworkType:oil_canvas",
  "artworkType:acrylic_canvas",
  "artworkType:painting",
  "artworkType:watercolor",
  "artworkType:sculpture",
  "artworkType:drawing",
  "artworkType:print",
  "artworkType:mixed_media",
  "artworkType:ipad_drawing",
  "artworkType:plexiglass",
  "artworkType:other",
  "contactMethod:call",
  "contactMethod:whatsapp",
  "contactMethod:text",
  "contactMethod:email",
  "contactMethod:letter",
  "contactMethod:visit",
  "contactMethod:other",
  "status:in_studio",
  "status:sold",
  "status:lost",
  "status:gifted",
  "status:loaned",
  "status:consigned",
  "status:in_exhibition",
  "status:post_show_gallery",
  "status:payment_gallery",
  "status:per_copy",
  "status:archived",
  "movementType:sale",
  "movementType:gift",
  "movementType:loan",
  "movementType:exhibition",
  "movementType:payment",
  "movementType:lost",
  "exhibitionType:single",
  "exhibitionType:group",
  "country:spain",
  "country:france",
  "country:germany"
]);

function isDefaultLookup(category: string, value: string) {
  return DEFAULT_LOOKUP_KEYS.has(`${category}:${value}`);
}

function mainImageFor(artwork: Pick<Artwork, "id" | "mainImageId">, inventory: InventoryData) {
  return (
    inventory.images.find((image) => image.id === artwork.mainImageId) ??
    inventory.images.find(
      (image) =>
        image.targetType === "artwork" &&
        image.targetId === artwork.id &&
        image.category === "main"
    )
  );
}

function useImageDataUrl(filePath?: string) {
  const [imageUrl, setImageUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!filePath || !canInlineImagePreview(filePath)) {
      setImageUrl("");
      return;
    }
    void window.inventoryApi
      .imageToDataUrl(filePath)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImageUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);
  return imageUrl;
}

type MovementKind =
  | "sale"
  | "gift"
  | "loan"
  | "exhibition"
  | "payment"
  | "lost"
  | "other";

function movementKind(type: string): MovementKind {
  switch (slugify(type)) {
    case "sale":
    case "venta":
      return "sale";
    case "gift":
    case "regalo":
      return "gift";
    case "loan":
    case "prestamo":
      return "loan";
    case "exhibition":
    case "exposicion":
      return "exhibition";
    case "payment":
    case "pago":
      return "payment";
    case "lost":
    case "perdido":
    case "perdida":
      return "lost";
    default:
      return "other";
  }
}

function isTerminalMovementType(type: string): boolean {
  const kind = movementKind(type);
  return kind === "sale" || kind === "payment" || kind === "lost";
}

function movementColorClass(type: string): string {
  return `mv-${movementKind(type)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateToMs(value?: string): number {
  if (!value || !/^\d{2}-\d{2}-\d{4}$/.test(value)) return NaN;
  const [day, month, year] = value.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
}

// Red "to retrieve" mark: only the LATEST meaningful movimiento matters.
// Earlier exhibitions/loans are assumed superseded when a newer one is added.
function overdueMovement(
  artwork: Artwork,
  inventory: InventoryData
): Movement | null {
  if (artwork.editionMode !== "unique") return null;
  const movements = inventory.movements.filter((m) => m.artworkId === artwork.id);
  if (movements.length === 0) return null;
  const today = Date.now();
  const sorted = sortMovementsDesc(movements);
  const latest =
    sorted.find((m) => movementKind(m.type) !== "other") ?? sorted[0] ?? null;
  if (!latest) return null;

  const kind = movementKind(latest.type);
  if (kind === "sale" || kind === "gift" || kind === "payment" || kind === "lost")
    return null;

  if (kind === "loan") {
    if (latest.returned) return null;
    if (latest.indefinite) return null;
    const end = dateToMs(latest.endDate);
    if (!Number.isFinite(end)) return latest;
    return today > (end as number) + DAY_MS ? latest : null;
  }

  if (kind === "exhibition") {
    if (latest.returned) return null;
    const exh = inventory.exhibitions.find((e) => e.id === latest.exhibitionId);
    const start = dateToMs(exh?.startDate);
    const end = dateToMs(exh?.endDate || exh?.startDate);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const live =
        today >= (start as number) && today <= (end as number) + DAY_MS;
      if (live) return null;
      if (today > (end as number) + DAY_MS) return latest;
      return null;
    }
    return latest;
  }

  return null;
}

function formatEuro(value: string): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (/[€$£]/.test(text)) return text;
  if (/^[\d.,\s]+$/.test(text)) return `${text} €`;
  return text;
}

function statusFromMovement(movement: MovementInput): string {
  switch (movementKind(movement.type)) {
    case "sale":
      return "sold";
    case "payment":
      return "payment_gallery";
    case "gift":
      return "gifted";
    case "lost":
      return "lost";
    case "loan":
      return movement.returned ? "in_studio" : "loaned";
    case "exhibition":
      return (movement.returned ?? true)
        ? "in_studio"
        : movement.keptAtGallery
          ? "post_show_gallery"
          : "in_exhibition";
    default:
      return "";
  }
}

// Mirrors the backend's effectiveStatus so the form can show the live status.
function displayStatusFromMovements(
  movements: MovementInput[],
  inventory: InventoryData
): string {
  const sorted = sortMovementsDesc(movements as Movement[]);
  const today = Date.now();
  for (const movement of sorted) {
    const kind = movementKind(movement.type);
    if (kind === "other") continue;
    if (kind === "exhibition") {
      const exhibition = inventory.exhibitions.find(
        (item) => item.id === movement.exhibitionId
      );
      const start = dateToMs(exhibition?.startDate);
      const end = dateToMs(exhibition?.endDate || exhibition?.startDate);
      if (Number.isFinite(start)) {
        if (today < (start as number)) continue;
        if (today <= (end as number) + DAY_MS) return "in_exhibition";
        return movement.returned
          ? "in_studio"
          : movement.keptAtGallery
            ? "post_show_gallery"
            : "in_exhibition";
      }
    }
    return statusFromMovement(movement);
  }
  return "in_studio";
}

function year(date?: string): number {
  const match = /(\d{4})/.exec(date ?? "");
  return match ? Number(match[1]) : 0;
}

function parseNum(value?: string): number {
  if (!value) return NaN;
  const cleaned = String(value).replace(/[^0-9.,-]/g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function bounds(values: number[]): [number, number] | null {
  const nums = values.filter((value) => Number.isFinite(value));
  if (nums.length === 0) return null;
  return [Math.floor(Math.min(...nums)), Math.ceil(Math.max(...nums))];
}

function inRange(value: number, range: Range): boolean {
  if (!range) return true;
  if (!Number.isFinite(value)) return true;
  return value >= range[0] && value <= range[1];
}

function uniqueValues(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function toIsoDate(ddmmyyyy: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy || "");
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function fromIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

/** Local calendar date as YYYY-MM-DD for `<input type="date">`. */
function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDateToMs(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return Date.now();
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0
  ).getTime();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isThreeDimensional(type: string) {
  return ["sculpture", "escultura", "object", "objeto", "installation"].includes(
    slugify(type)
  );
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
