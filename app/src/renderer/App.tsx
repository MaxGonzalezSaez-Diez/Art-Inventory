import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction
} from "react";
import { ImageEditModal } from "./ImageEditModal";
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
  SeriesText,
  Application,
  ApplicationInput,
  ApplicationKind,
  ApplicationCoverStyles,
  ApplicationTextSection,
  CoverLineStyle,
  TextGeneratorExample
} from "../main/types/inventory";
import { DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT } from "../main/types/inventory";
import { buildApplicationHtml } from "../main/applicationDocumentHtml";

/** Import an edited JPEG/PNG data-URL as an artwork main photo. */
async function importEditedArtworkImage(dataUrl: string, artworkId: string) {
  const api = window.inventoryApi as typeof window.inventoryApi & {
    importImageFromDataUrl?: (
      dataUrl: string,
      targetType: "artwork",
      targetId: string,
      category: string,
      originalName?: string
    ) => Promise<{ image: unknown; inventory: InventoryData } | null>;
    dataUrlToTempPath?: (dataUrl: string) => Promise<string>;
  };
  if (typeof api.importImageFromDataUrl === "function") {
    return api.importImageFromDataUrl(
      dataUrl,
      "artwork",
      artworkId,
      "main",
      "foto.jpg"
    );
  }
  // Stale preload (app not fully restarted): write temp + import by path.
  if (typeof api.dataUrlToTempPath === "function") {
    const tempPath = await api.dataUrlToTempPath(dataUrl);
    return api.importImageFromPath(tempPath, "artwork", artworkId, "main");
  }
  throw new Error(
    "Reinicia completamente la aplicación para guardar fotos editadas."
  );
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
  | "examples";

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
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [page, setPage] = useState<Page>("library");
  const [selectedArtworkId, setSelectedArtworkId] = useState("");
  const [editingArtwork, setEditingArtwork] = useState<ArtworkInput>(emptyArtwork);
  const [formKey, setFormKey] = useState("new");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [exhibitionToOpen, setExhibitionToOpen] = useState<string | null>(null);
  const [pricelistPreset, setPricelistPreset] = useState<PriceListPreset | null>(null);
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
    void refresh();
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
      setMessage(error instanceof Error ? error.message : "No se pudo cargar.");
    }
  }

  async function chooseLibrary() {
    await window.inventoryApi.chooseLibrary();
    await refresh();
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="eyebrow">Inventario</p>
          <h1>Obras de arte</h1>
        </div>
        <nav>
          <NavButton active={page === "library" || page === "form" || page === "detail"} onClick={() => guarded(() => goTo("library"))}>
            <span className="nav-dot dot-obras" /> Lista de obras
          </NavButton>
          <NavButton active={page === "series"} onClick={() => guarded(() => goTo("series"))}>
            <span className="nav-dot dot-series" /> Series (metadatos)
          </NavButton>
          <NavButton active={page === "contacts"} onClick={() => guarded(() => goTo("contacts"))}>
            <span className="nav-dot dot-people" /> Personas y galerías
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
            <span className="nav-dot dot-exh" /> Exposiciones
          </NavButton>
          <NavButton active={page === "pricelist"} onClick={() => guarded(() => openPriceList(null))}>
            <span className="nav-dot dot-price" /> Folleto de obras
          </NavButton>
          <NavButton active={page === "pricing"} onClick={() => guarded(() => goTo("pricing"))}>
            <span className="nav-dot dot-factor" /> Factores y precios
          </NavButton>
          <NavButton
            active={page === "financials"}
            onClick={() => guarded(() => goTo("financials"))}
          >
            <span className="nav-dot dot-money" /> Cuentas
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
            <span className="nav-dot dot-app" /> Solicitudes
          </NavButton>
          <NavButton
            active={page === "textGenerator"}
            onClick={() => guarded(() => goTo("textGenerator"))}
          >
            <span className="nav-dot dot-textgen" /> Generador de texto
          </NavButton>
          <NavButton
            active={page === "examples"}
            onClick={() => guarded(() => goTo("examples"))}
          >
            <span className="nav-dot dot-examples" /> Biblioteca de ejemplos
          </NavButton>
        </nav>
        <div className="library-path">
          <span>Carpeta local</span>
          <strong>{inventory?.libraryPath ?? "..."}</strong>
          <button className="ghost small" onClick={chooseLibrary}>
            Cambiar carpeta
          </button>
        </div>
      </aside>

      <main className="main-panel">
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
              aria-label="Cerrar"
              onClick={() => setMessage("")}
            >
              ✕
            </button>
          </div>
        )}
        {!inventory ? (
          <div className="empty-state">Preparando el archivo Excel...</div>
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
              setToast("Guardado correctamente.");
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
            preset={pricelistPreset}
            onError={setMessage}
            onToast={setToast}
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
            onOpenGenerator={() => guarded(() => goTo("textGenerator"))}
          />
        ) : (
          <div className="empty-state">Selecciona una obra.</div>
        )}
      </main>

      {pendingNav && (
        <div className="modal-backdrop" onClick={() => setPendingNav(null)}>
          <div className="modal confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Tienes cambios sin guardar</h3>
            </div>
            <p className="confirm-message">¿Qué quieres hacer con los cambios?</p>
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
                <strong>{saving ? "Guardando…" : "Guardar y salir"}</strong>
                <span>Guarda los cambios y continúa.</span>
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
                <strong>Salir sin guardar</strong>
                <span>Los cambios recientes se perderán.</span>
              </button>
              <button
                className="leave-choice ghost-choice"
                disabled={saving}
                onClick={() => setPendingNav(null)}
              >
                <strong>Seguir editando</strong>
                <span>Vuelve al formulario sin salir.</span>
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [showFilters, setShowFilters] = useState(true);
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

  const yearBounds = bounds(inventory.artworks.map((a) => parseNum(a.yearMade)));
  const heightBounds = bounds(inventory.artworks.map((a) => parseNum(a.height)));
  const widthBounds = bounds(inventory.artworks.map((a) => parseNum(a.width)));
  const priceBounds = bounds(inventory.artworks.map((a) => parseNum(a.soldPrice)));

  const seriesOptions = uniqueValues(inventory.artworks.map((a) => a.series)).map(
    (value) => ({ category: "series", value, label: value })
  );

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
      const haystack = [artwork.title, artwork.series, artwork.notes, artwork.id]
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
    types,
    widthRange,
    yearRange
  ]);

  return (
    <section className={showFilters ? "library-layout" : "library-layout collapsed"}>
      {showFilters && (
        <aside className="filter-rail">
          <div className="filter-rail-head">
            <h3>Filtros</h3>
            <button className="link-button" onClick={clearAll}>
              Limpiar todo
            </button>
          </div>
          <input
            className="search-input"
            placeholder="Buscar..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <CheckboxFilter
            title="Tipo"
            options={lookupOptions(inventory, "artworkType")}
            selected={types}
            onChange={setTypes}
          />
          <CheckboxFilter
            title="Estado"
            options={lookupOptions(inventory, "status")}
            selected={statuses}
            onChange={setStatuses}
          />
          <CheckboxFilter
            title="Edición"
            options={[
              { category: "editionMode", value: "unique", label: "Única" },
              { category: "editionMode", value: "multiple", label: "Serie / ediciones" }
            ]}
            selected={editionModes}
            onChange={setEditionModes}
          />
          <CheckboxFilter
            title="Serie"
            options={seriesOptions}
            selected={seriesSel}
            onChange={setSeriesSel}
          />
          <RangeFilter
            title="Año"
            bounds={yearBounds}
            value={yearRange}
            onChange={setYearRange}
            format={(value) => String(Math.round(value))}
          />
          <RangeFilter
            title="Alto (cm)"
            bounds={heightBounds}
            value={heightRange}
            onChange={setHeightRange}
            format={(value) => String(Math.round(value))}
          />
          <RangeFilter
            title="Ancho (cm)"
            bounds={widthBounds}
            value={widthRange}
            onChange={setWidthRange}
            format={(value) => String(Math.round(value))}
          />
          <RangeFilter
            title="Precio vendido"
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
            {showFilters ? "◀ Ocultar filtros" : "▶ Filtros"}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <div className="toolbar-right">
            <label className="sort-control">
              Ordenar
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                <option value="recent">Añadidas recientemente</option>
                <option value="title">Título (A→Z)</option>
                <option value="series">Serie (A→Z)</option>
                <option value="year_desc">Año (nuevo→viejo)</option>
                <option value="year_asc">Año (viejo→nuevo)</option>
                <option value="type">Tipo</option>
                <option value="price_desc">Precio (alto→bajo)</option>
                <option value="price_asc">Precio (bajo→alto)</option>
              </select>
            </label>
            <span className="count-pill">{artworks.length} obras</span>
            <button onClick={onAdd}>+ Añadir obra</button>
          </div>
        </div>
        <div className="library-table-wrap">
          <div className="art-table">
            <div className="art-row art-row-header">
              <span>Foto</span>
              <span>Obra</span>
              <span>Serie</span>
              <span>Tipo</span>
              <span>Año</span>
              <span>Estado</span>
            </div>
            {artworks.length === 0 ? (
              <div className="table-empty">No hay obras que coincidan.</div>
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
  const image = mainImageFor(artwork, inventory);
  const imageUrl = useImageDataUrl(image?.absolutePath);
  const overdue = overdueMovement(artwork, inventory);
  const statusLabel = labelFor(inventory, "status", artwork.status);

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
        {imageUrl ? <img src={imageUrl} alt="" /> : <span>Sin foto</span>}
      </div>
      <div className="title-cell">
        <strong>{artwork.title}</strong>
      </div>
      <span className="art-cell-text" title={artwork.series || undefined}>
        {artwork.series || "—"}
      </span>
      <span className="art-cell-text">
        {labelFor(inventory, "artworkType", artwork.type)}
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
  const [confirming, setConfirming] = useState(false);
  const where =
    movementKind(movement.type) === "exhibition"
      ? movement.exhibitionTitle ||
        exhibitionTitle(inventory, movement.exhibitionId) ||
        "la exposición"
      : movement.contactName || contactName(inventory, movement.contactId) || "el préstamo";

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
        title="Pendiente de recuperar — clic para confirmar"
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
              <h3>¿Ha vuelto al estudio?</h3>
            </div>
            <p className="confirm-message">
              «{artwork.title}» figura todavía en {where} y la fecha ya pasó. ¿Confirmas
              que la obra ya volvió al estudio?
            </p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setConfirming(false)}>
                Todavía no
              </button>
              <button onClick={markBack}>Sí, está en el estudio</button>
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
  } | null>(null);
  const [imageEditorSrc, setImageEditorSrc] = useState<string | null>(null);

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

  const is3D = isThreeDimensional(form.type);
  const isSeries = form.editionMode === "multiple";

  function update<K extends keyof ArtworkInput>(key: K, value: ArtworkInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    onDirtyChange?.(true);
  }

  function setMovements(movements: MovementInput[]) {
    setForm((current) => ({ ...current, movements }));
    onDirtyChange?.(true);
  }

  async function persistCurrent(): Promise<InventoryData | null> {
    if (!form.title.trim()) {
      setError("Escribe un título antes de guardar la obra.");
      setTab("info");
      return null;
    }
    setError("");
    let data = await window.inventoryApi.saveArtwork(form);
    let saved =
      (form.id && data.artworks.find((item) => item.id === form.id)) ||
      [...data.artworks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (saved && pendingImage) {
      const result = await importEditedArtworkImage(
        pendingImage.dataUrl,
        saved.id
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
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
    }
  }

  async function addImage() {
    try {
      const picked = await window.inventoryApi.pickImagePath();
      if (!picked) return;
      setImageEditorSrc(picked.dataUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo añadir la foto.");
    }
  }

  function saveEditedImage(dataUrl: string) {
    setPendingImage({ dataUrl });
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
          <p className="eyebrow">{form.id ? "Editar obra" : "Nueva obra"}</p>
          <h2>{form.title.trim() || "Añadir obra"}</h2>
        </div>
        <div className="form-head-actions">
          {locked ? (
            <>
              <span className="saved-badge">Guardado</span>
              <button type="button" onClick={() => setLocked(false)}>
                Editar
              </button>
              <button type="button" className="ghost" onClick={onNew}>
                Nueva obra
              </button>
              <button type="button" className="ghost" onClick={onBackToList}>
                Volver
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void save()}>
                Guardar
              </button>
              <button type="button" className="ghost" onClick={onNew}>
                Nueva obra
              </button>
              <button type="button" className="ghost" onClick={onBackToList}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      <div className="artwork-form-layout">
        <aside className="artwork-form-photo">
          <button
            type="button"
            className={`artwork-photo-frame${
              pendingImage || imageUrl ? " has-image" : ""
            }`}
            onClick={() => {
              if (!locked) void addImage();
            }}
            disabled={locked}
            title={pendingImage || imageUrl ? "Cambiar foto" : "Añadir foto"}
          >
            {pendingImage ? (
              <img src={pendingImage.dataUrl} alt="" />
            ) : imageUrl ? (
              <img src={imageUrl} alt="" />
            ) : (
              <span className="artwork-photo-empty">
                <span className="artwork-photo-plus">+</span>
                <span>Añadir foto</span>
              </span>
            )}
          </button>
          <p className="muted small-note artwork-photo-hint">
            {pendingImage
              ? "Listo — se guarda con la obra."
              : locked
                ? "Pulsa «Editar» para cambiar la foto."
                : "Clic para elegir y recortar."}
          </p>
        </aside>

        <div className="artwork-form-main">
          <div className="subtabs artwork-form-tabs">
            <SubTab active={tab === "info"} onClick={() => setTab("info")}>
              Información
            </SubTab>
            <SubTab
              active={tab === "movimientos"}
              onClick={() => setTab("movimientos")}
            >
              Movimientos
              {(form.movements?.length ?? 0) > 0
                ? ` · ${form.movements!.length}`
                : ""}
            </SubTab>
          </div>

          <fieldset className="tab-fieldset" disabled={locked}>
            {tab === "info" && (
              <div className="form-section artwork-form-section">
                <div className="form-group">
                  <p className="form-group-label">Identidad</p>
                  <label className="field">
                    Nombre / título
                    <input
                      value={form.title}
                      placeholder="Título de la obra"
                      onChange={(event) => update("title", event.target.value)}
                    />
                  </label>

                  <div className="form-row">
                    <LookupSelect
                      inventory={inventory}
                      setInventory={setInventory}
                      category="artworkType"
                      label="Tipo de arte"
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
                      Año
                      <input
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="YYYY"
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
                      Estado
                      <input
                        className="artwork-status-readonly"
                        value={
                          isSeries
                            ? "Ver cada copia"
                            : labelFor(
                                inventory,
                                "status",
                                displayStatusFromMovements(
                                  form.movements ?? [],
                                  inventory
                                )
                              )
                        }
                        disabled
                        readOnly
                      />
                    </label>
                  </div>
                  <p className="muted small-note">
                    El estado se calcula solo a partir de los movimientos.
                  </p>
                </div>

                <div className="form-group">
                  <p className="form-group-label">Medidas</p>
                  <div className="dimensions-row">
                    <label className="field">
                      Alto
                      <input
                        inputMode="decimal"
                        value={form.height ?? ""}
                        onChange={(event) => update("height", event.target.value)}
                      />
                    </label>
                    <label className="field">
                      Ancho
                      <input
                        inputMode="decimal"
                        value={form.width ?? ""}
                        onChange={(event) => update("width", event.target.value)}
                      />
                    </label>
                    <label className={is3D ? "field" : "field disabled-field"}>
                      Profundidad
                      <input
                        inputMode="decimal"
                        disabled={!is3D}
                        value={is3D ? form.depth ?? "" : ""}
                        placeholder={is3D ? "" : "Solo 3D"}
                        onChange={(event) => update("depth", event.target.value)}
                      />
                    </label>
                    <label className="field unit-field">
                      Unidad
                      <select
                        value={form.unit}
                        onChange={(event) =>
                          update("unit", event.target.value as "cm" | "in")
                        }
                      >
                        <option value="cm">cm</option>
                        <option value="in">pulgadas</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <p className="form-group-label">Edición</p>
                  <EditionBlock
                    inventory={inventory}
                    setInventory={setInventory}
                    form={form}
                    update={update}
                    setForm={setForm}
                  />
                </div>

                <div className="form-group">
                  <p className="form-group-label">Notas</p>
                  <label className="field">
                    <span className="sr-only">Notas</span>
                    <textarea
                      className="notes-area"
                      placeholder="Observaciones internas…"
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
        <ImageEditModal
          sourceDataUrl={imageEditorSrc}
          onCancel={() => setImageEditorSrc(null)}
          onSave={saveEditedImage}
        />
      ) : null}

      {error && <div className="error-banner">{error}</div>}

      {!locked && (
        <div className="form-actions artwork-form-actions">
          <button type="button" onClick={() => void save()}>
            Guardar
          </button>
          <button type="button" className="ghost" onClick={onBackToList}>
            Cancelar
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
        ¿Obra única o varias copias?
        <select
          value={form.editionMode ?? "unique"}
          onChange={(event) =>
            update("editionMode", event.target.value as ArtworkInput["editionMode"])
          }
        >
          <option value="unique">Única</option>
          <option value="multiple">Varias copias</option>
        </select>
      </label>

      {form.editionMode === "multiple" && (
        <div className="edition-detail">
          <div className="form-row">
            <label className="field">
              Copias personales / pruebas
              <input
                type="number"
                min="0"
                value={form.editionPersonalCopies ?? "0"}
                onChange={(event) => update("editionPersonalCopies", event.target.value)}
              />
            </label>
            <label className="field">
              Copias de la edición (para vender)
              <input
                type="number"
                min="0"
                value={form.editionSaleCopies ?? "0"}
                onChange={(event) => update("editionSaleCopies", event.target.value)}
              />
            </label>
          </div>
          <button type="button" className="ghost small" onClick={generate}>
            Generar lista de copias
          </button>
          {editions.length > 0 && (
            <div className="copy-list">
              <div className="copy-list-head">Estado de cada copia</div>
              {editions.map((edition) => (
                <div className="copy-row" key={edition.id ?? edition.label}>
                  <span className="copy-chip">{edition.label}</span>
                  <select
                    value={edition.status || "not_made"}
                    onChange={(event) =>
                      setEditionStatus(edition.id ?? edition.label, event.target.value)
                    }
                  >
                    {lookupOptions(inventory, "status")
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
          <p className="muted small-note">
            Cada copia tiene su propio estado. Registra ventas, regalos o
            exposiciones de una copia en Movimientos eligiendo «¿Qué copia?».
          </p>
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
        return "Esta obra ya tiene una venta. Solo puede haber una.";
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
        ? "Esta copia ya tiene una venta registrada."
        : "Ya hay una venta de «toda la obra». No se puede duplicar.";
    }
    return "";
  }

  function validateMovement(
    next: MovementInput,
    editIndex: number | null
  ): string {
    const date = (next.date ?? "").trim();
    if (!date) {
      return "Cada movimiento necesita una fecha.";
    }
    const saleError = validateSale(next, editIndex);
    if (saleError) return saleError;

    if (isSeries) return "";

    const others = movements.filter((_item, index) => index !== editIndex);
    const otherTerminal = others.find((item) => isTerminalMovementType(item.type));
    if (isTerminalMovementType(next.type) && otherTerminal) {
      return "Solo puede haber una salida definitiva (venta, pago a galerista o pérdida).";
    }
    const terminal = isTerminalMovementType(next.type) ? next : otherTerminal;
    if (!terminal) return "";
    const terminalMs = movementDateValue(terminal as Movement);
    if (isTerminalMovementType(next.type)) {
      const later = others.find(
        (item) => movementDateValue(item as Movement) > terminalMs
      );
      if (later) {
        return "No puede haber movimientos después de una venta, pago a galerista o pérdida.";
      }
      return "";
    }
    if (movementDateValue(next as Movement) > terminalMs) {
      return "No puede haber movimientos después de una venta, pago a galerista o pérdida.";
    }
    return "";
  }

  const order = movements
    .map((movement, index) => ({ movement, index }))
    .sort((a, b) => movementDateValue(b.movement) - movementDateValue(a.movement));

  return (
    <div className="form-section movements-editor">
      <div className="movements-intro">
        <p>
          Historial de la obra: ventas, exposiciones, préstamos y regalos. Lo más
          reciente aparece arriba.
        </p>
      </div>
      <div className="movements-timeline">
        {order.length === 0 ? (
          <div className="movements-empty">
            <strong>Sin movimientos todavía</strong>
            <p className="muted">
              Cuando vendas, prestes o expongas la obra, regístralo aquí.
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
                    {labelFor(inventory, "movementType", movement.type) ||
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
                      {movementSummary(movement as Movement, inventory)}
                    </strong>
                    <span className="muted">
                      {[
                        movement.date || "Sin fecha",
                        movementSubtitle(movement as Movement, inventory)
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
                  Quitar
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
        + Añadir movimiento
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
    return galleryPaymentHalfInfo(artworkDraft, settings, at);
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
          <h3>{isNew ? "Añadir movimiento" : "Editar movimiento"}</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {blockTerminalTypes && isTerminalMovementType(m.type) && (
            <p className="error-inline">
              Ya hay una salida definitiva. Elige otro tipo o quita esa salida.
            </p>
          )}
          {isSeries && (
            <label className="field">
              ¿Qué copia?
              <select
                value={m.editionId ?? ""}
                onChange={(event) => set({ editionId: event.target.value })}
              >
                <option value="">Toda la obra</option>
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
              label="Tipo de movimiento"
              value={m.type}
              onChange={applyType}
              hideValues={hideTerminal}
            />
            {kind !== "exhibition" && kind !== "loan" && (
              <label className="field">
                Fecha
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
                  Desde (de cuándo)
                  <DateField value={m.date ?? ""} onChange={(value) => set({ date: value })} />
                </label>
                <label className="field">
                  Hasta (a cuándo)
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
                Sin fecha de devolución (indefinido)
              </label>
              <div className="form-row">
                <label className="field">
                  ¿A una persona o galería?
                  <select
                    value={m.recipientType ?? "person"}
                    onChange={(event) =>
                      set({
                        recipientType: event.target.value as ContactKind,
                        contactId: ""
                      })
                    }
                  >
                    <option value="person">Persona</option>
                    <option value="gallery">Galería</option>
                  </select>
                </label>
                <ContactSelect
                  inventory={inventory}
                  setInventory={setInventory}
                  label={isGallery ? "Galería" : "Persona"}
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
                Ya devuelta al estudio
              </label>
              <p className="muted small-note">
                El aviso rojo solo mira el último movimiento (préstamo o
                exposición).
              </p>
            </div>
          ) : kind === "payment" ? (
            <div className="context-box">
              <p className="muted small-note">
                La obra se entrega a una galería como forma de pago. El valor
                cuenta como gasto en Cuentas (mitad del valor de la obra).
              </p>
              <ContactSelect
                inventory={inventory}
                setInventory={setInventory}
                label="Galería que recibe la obra"
                kind="gallery"
                value={m.contactId ?? ""}
                onChange={(value) => set({ contactId: value, recipientType: "gallery" })}
              />
              <label className="field">
                Valor / coste (50% del precio de la obra)
                <div className="payment-value-row">
                  <input
                    inputMode="decimal"
                    placeholder="ej. 2000"
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
                    Calculado solo: mitad de {formatMoney(paymentInfo.half * 2)}{" "}
                    (factores × alto+ancho). Puedes corregirlo a mano.
                  </span>
                ) : (
                  <span className="muted small-note">
                    Se rellena solo con la mitad del valor según factores y fecha.
                  </span>
                )}
              </label>
            </div>
          ) : kind === "lost" ? (
            <div className="context-box">
              <p className="muted small-note">
                Marca la obra como perdida. Sale de tu dominio: no podrás añadir
                movimientos posteriores.
              </p>
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
                La fecha se toma de la exposición seleccionada.
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
                Ya devuelta al estudio
              </label>
              {!(m.returned ?? false) && (
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={m.keptAtGallery ?? false}
                    onChange={(event) => set({ keptAtGallery: event.target.checked })}
                  />
                  Se quedó con la galería tras la exposición
                </label>
              )}
              <p className="muted small-note">
                El aviso rojo solo mira el último movimiento. Si añades otra
                exposición después, no hace falta marcar «devuelta» en la
                anterior.
              </p>
              <label className="field">
                Precio de lista en la exposición (opcional)
                <input
                  inputMode="decimal"
                  placeholder="ej. 1.200 €"
                  value={m.listedPrice ?? ""}
                  onChange={(event) => set({ listedPrice: event.target.value })}
                />
              </label>
            </div>
          ) : kind === "sale" ? (
            <>
              <div className="form-row">
                <label className="field">
                  Precio
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={m.price ?? ""}
                    onChange={(event) => set({ price: event.target.value })}
                  />
                </label>
                <label className="field">
                  Contexto de la venta
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
                    <option value="">Directa (a una persona)</option>
                    <option value="gallery">A través de una galería</option>
                    <option value="exhibition">En una exposición</option>
                  </select>
                </label>
              </div>
              <label className="field">
                ¿Se cobró impuesto?
                <select
                  value={m.taxCharged === false ? "no" : "yes"}
                  onChange={(event) =>
                    set({ taxCharged: event.target.value !== "no" })
                  }
                >
                  <option value="yes">Sí</option>
                  <option value="no">No</option>
                </select>
                <span className="muted small-note">
                  Si eliges «No», esta venta solo entra en el resumen Excel si
                  marcas «Incluir ventas sin impuesto».
                </span>
              </label>
              <div className="context-box">
                {m.context === "gallery" ? (
                  <ContactSelect
                    inventory={inventory}
                    setInventory={setInventory}
                    label="¿Qué galería? (el comprador queda asociado a la galería)"
                    kind="gallery"
                    value={m.contactId ?? ""}
                    onChange={(value) => set({ contactId: value })}
                  />
                ) : (
                  <ContactSelect
                    inventory={inventory}
                    setInventory={setInventory}
                    label="Comprador/a (opcional)"
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
                    Recibido (parte para la artista, tras la comisión)
                    <input
                      inputMode="decimal"
                      placeholder="ej. 700 €"
                      value={m.received ?? ""}
                      onChange={(event) => set({ received: event.target.value })}
                    />
                    <span className="muted small-note">
                      La galería suele quedarse una comisión; aquí va lo que
                      realmente recibe la artista.
                    </span>
                  </label>
                )}
              </div>
            </>
          ) : (
            <div className="form-row">
              <label className="field">
                ¿A una persona o galería?
                <select
                  value={m.recipientType ?? "person"}
                  onChange={(event) =>
                    set({
                      recipientType: event.target.value as ContactKind,
                      contactId: ""
                    })
                  }
                >
                  <option value="person">Persona</option>
                  <option value="gallery">Galería</option>
                </select>
              </label>
              <ContactSelect
                inventory={inventory}
                setInventory={setInventory}
                label={isGallery ? "Galería" : "Persona"}
                kind={isGallery ? "gallery" : "person"}
                value={m.contactId ?? ""}
                onChange={(value) => set({ contactId: value })}
              />
            </div>
          )}

          <label className="field">
            Notas
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
              Quitar movimiento
            </button>
          )}
          <button
            type="button"
            disabled={blockTerminalTypes && isTerminalMovementType(m.type)}
            onClick={() => {
              if (dateMissing) {
                setLocalError("Cada movimiento necesita una fecha.");
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
            Salvar
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
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
  const [showModal, setShowModal] = useState(false);
  const exhibitions = [...inventory.exhibitions].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  return (
    <div className="field lookup-field">
      <span className="field-label">Exposición</span>
      <div className="lookup-row">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">— Seleccionar —</option>
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
          title="Crear una exposición nueva"
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
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
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
  onClick
}: {
  image: ArtworkImage;
  active: boolean;
  onClick: () => void;
}) {
  const url = useImageDataUrl(image.absolutePath);
  return (
    <button
      type="button"
      className={`export-thumb${active ? " active" : ""}`}
      onClick={onClick}
    >
      {url ? <img src={url} alt="" /> : <span className="muted">…</span>}
    </button>
  );
}

type ExportIntent = "metadata" | "print" | "simple";

const EXPORT_QUALITY_PRESETS = [
  { value: "150", label: "Básica", hint: "150" },
  { value: "300", label: "Buena", hint: "300 · lo habitual" },
  { value: "600", label: "Muy fina", hint: "600" }
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
  const main = mainImageFor(artwork, inventory);
  const all = inventory.images.filter(
    (image) => image.targetType === "artwork" && image.targetId === artwork.id
  );
  const ordered = [
    ...(main ? [main] : []),
    ...all.filter((image) => image.id !== main?.id)
  ].filter((image) => image.absolutePath);

  const artworkCmW = Number(artwork.width) || 0;
  const artworkCmH = Number(artwork.height) || 0;
  const canUseArtworkSize =
    (artwork.unit === "cm" || !artwork.unit) && artworkCmW > 0 && artworkCmH > 0;

  const [selectedId, setSelectedId] = useState(ordered[0]?.id ?? "");
  const [intent, setIntent] = useState<ExportIntent>("print");
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
  const printScale =
    sourceW > 0 && sourceH > 0 && needW > 0 && needH > 0
      ? Math.min(needW / sourceW, needH / sourceH)
      : 0;
  const outW = printScale > 0 ? Math.round(sourceW * printScale) : 0;
  const outH = printScale > 0 ? Math.round(sourceH * printScale) : 0;
  const wouldUpscale = printScale > 1.01;

  const sizeNum = parseFloat(sizeValue.replace(",", "."));
  const limitActive = intent === "simple" || wantsLimit;
  const targetKB =
    limitActive && Number.isFinite(sizeNum) && sizeNum > 0
      ? sizeUnit === "mb"
        ? sizeNum * 1024
        : sizeNum
      : undefined;

  function clearFeedback() {
    setError("");
    setDone(null);
  }

  function validate(): string | null {
    if (!selected?.absolutePath) return "Elige una foto primero.";
    if (intent === "metadata" || intent === "print") {
      if (!(dpiNum >= 36 && dpiNum <= 2400)) {
        return "Indica la calidad (por ejemplo 300). Si eliges «Otra», escribe un número.";
      }
    }
    if (intent === "print") {
      if (!(printWNum > 0) || !(printHNum > 0)) {
        return "Pon el ancho y el alto en centímetros (el tamaño del papel o del cartel).";
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
          "Reinicia la app (cierra la ventana y vuelve a abrirla) para guardar imágenes."
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
          res.dpi ? `calidad ${res.dpi}` : null
        ].filter(Boolean);
        setDone(`Guardada · ${parts.join(" · ")}`);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo guardar la imagen."
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
            <h3>Salvar imagen</h3>
            <p className="muted small-note export-modal-lead">
              Copia para enviar o imprimir. La foto de la ficha no se toca.
            </p>
          </div>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body export-modal-body">
          {ordered.length === 0 ? (
            <p className="muted">
              Esta obra todavía no tiene fotos. Añade una primero.
            </p>
          ) : (
            <>
              <div className="export-step">
                <p className="export-step-title">1 · Elige la foto</p>
                <div className="export-thumb-grid">
                  {ordered.map((image) => (
                    <ExportThumb
                      key={image.id}
                      image={image}
                      active={image.id === selectedId}
                      onClick={() => {
                        setSelectedId(image.id);
                        clearFeedback();
                      }}
                    />
                  ))}
                </div>
                {probe && (
                  <p className="muted small-note">
                    Foto: {sourceW}×{sourceH} píxeles.
                  </p>
                )}
              </div>

              <div className="export-step">
                <p className="export-step-title">2 · ¿Para qué?</p>
                <div className="export-intent-list">
                  <button
                    type="button"
                    className={`export-intent${intent === "print" ? " active" : ""}`}
                    onClick={() => {
                      setIntent("print");
                      clearFeedback();
                    }}
                  >
                    <strong>Imprimir</strong>
                    <span>Sabes el tamaño del papel (A4, 30×40 cm…).</span>
                  </button>
                  <button
                    type="button"
                    className={`export-intent${intent === "metadata" ? " active" : ""}`}
                    onClick={() => {
                      setIntent("metadata");
                      clearFeedback();
                    }}
                  >
                    <strong>Solo marcar DPI</strong>
                    <span>Te pidieron «300 DPI» sin tamaño de papel.</span>
                  </button>
                  <button
                    type="button"
                    className={`export-intent${intent === "simple" ? " active" : ""}`}
                    onClick={() => {
                      setIntent("simple");
                      clearFeedback();
                    }}
                  >
                    <strong>Email / web</strong>
                    <span>Cambiar formato o hacer el archivo más ligero.</span>
                  </button>
                </div>
              </div>

              {(intent === "print" || intent === "metadata") && (
                <div className="export-step">
                  <p className="export-step-title">3 · DPI (calidad)</p>
                  <p className="muted small-note">
                    Pon el número que te hayan dicho. Si no dijeron nada: 300.
                  </p>
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
                        <span>{preset.label}</span>
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
                      <strong>Otro</strong>
                      <span>número libre</span>
                    </button>
                  </div>
                  {dpiPreset === "custom" && (
                    <label className="field export-custom-dpi">
                      Escribe el número que te han pedido
                      <input
                        inputMode="numeric"
                        placeholder="ej. 240 o 350"
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
                  <p className="export-step-title">4 · Tamaño del papel (cm)</p>
                  <div className="export-size-row">
                    <label className="field">
                      Ancho
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
                      Alto
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
                        Medida de la obra
                      </button>
                    )}
                  </div>
                  {outW > 0 && outH > 0 && (
                    <div
                      className={`export-summary${wouldUpscale ? " warn" : ""}`}
                    >
                      {wouldUpscale ? (
                        <p>
                          Esta foto se queda corta para {formatCm(printWNum)}×
                          {formatCm(printHNum)} cm a {dpiNum} DPI. Se puede
                          imprimir, pero puede salir borrosa. Prueba un tamaño
                          menor o una foto con más píxeles.
                        </p>
                      ) : (
                        <p>
                          La foto da de sobra para{" "}
                          <strong>
                            {formatCm(printWNum)}×{formatCm(printHNum)} cm
                          </strong>{" "}
                          a <strong>{dpiNum} DPI</strong>. Saldrá nítida.
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
                      A <strong>{dpiNum} DPI</strong>, esta foto se puede imprimir
                      nítida hasta unos{" "}
                      <strong>
                        {formatCm(metadataPrintW)}×{formatCm(metadataPrintH)} cm
                      </strong>
                      .
                    </p>
                    <p className="muted">
                      Este ajuste no mejora la foto: solo apunta el número que te
                      pidieron. Para un tamaño concreto usa «Para imprimirla».
                    </p>
                  </div>
                )}

              <div className="export-step export-file-box">
                <p className="export-step-title">
                  {intent === "print" ? "5" : intent === "metadata" ? "4" : "3"} ·
                  El archivo
                </p>
                <label className="field">
                  Tipo de archivo
                  <select
                    value={format}
                    onChange={(event) =>
                      setFormat(event.target.value as "jpg" | "png" | "pdf")
                    }
                  >
                    <option value="jpg">JPG — lo normal para fotos</option>
                    <option value="png">PNG — pesa más</option>
                    <option value="pdf">PDF — una página</option>
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
                    También me han puesto un límite de peso (MB)
                  </label>
                )}

                {limitActive && (
                  <>
                    <label className="field">
                      Peso máximo del archivo
                      <div className="export-max-size">
                        <input
                          inputMode="decimal"
                          placeholder={intent === "simple" ? "ej. 5" : "ej. 8"}
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
                        ? "Comprimir el archivo baja la calidad de la foto. Solo úsalo si te exigen un máximo de MB."
                        : "Vacío = sin límite de peso."}
                    </p>
                  </>
                )}
              </div>

              <div className="export-summary soft">
                <p>
                  <strong>Resumen:</strong>{" "}
                  {intent === "print"
                    ? printWNum > 0 && printHNum > 0 && dpiNum > 0
                      ? `${formatCm(printWNum)}×${formatCm(printHNum)} cm · ${dpiNum} DPI · ${format.toUpperCase()}`
                      : "Falta tamaño o DPI"
                    : intent === "metadata"
                      ? dpiNum > 0
                        ? `Misma foto · ${dpiNum} DPI · ${format.toUpperCase()}`
                        : "Falta el DPI"
                      : `Misma foto · ${format.toUpperCase()}`}
                  {targetKB
                    ? ` · máx. ${sizeUnit === "mb" ? `${sizeNum} MB` : `${sizeNum} KB`}`
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
            {busy ? "Guardando…" : "Guardar copia…"}
          </button>
          <button className="ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
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
  const [tab, setTab] = useState<DetailTab>("info");
  const [openMovement, setOpenMovement] = useState<Movement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [certBusy, setCertBusy] = useState(false);
  const [certLangOpen, setCertLangOpen] = useState(false);
  const [certLang, setCertLang] = useState<"es" | "en" | "de">("es");
  const [certCopyId, setCertCopyId] = useState<string>("");
  const [imageEditorSrc, setImageEditorSrc] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
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
      setImageEditorSrc(picked.dataUrl);
    } catch {
      /* ignore */
    }
  }

  async function saveEditedImage(dataUrl: string) {
    setImageBusy(true);
    try {
      const result = await importEditedArtworkImage(dataUrl, artwork.id);
      if (result?.inventory) setInventory(result.inventory);
      setImageEditorSrc(null);
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
    const counted =
      Number(artwork.editionPersonalCopies || 0) +
      Number(artwork.editionSaleCopies || 0);
    const total =
      editions.length > 0 ? editions.length : Math.max(1, counted);
    if (isMultiple && total > 1 && !certCopyId && editions.length > 0) {
      onError("Elige qué ejemplar es este certificado.");
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
      const copyIndex = selectedEdition
        ? editions.findIndex((e) => e.id === certCopyId) + 1
        : Number(certCopyId) || 1;
      const path = await requireApi("generateCertificateOfAuthenticity")({
        title: artwork.title,
        year: String(artwork.yearMade ?? "").trim() || undefined,
        medium: artTypeLabel(inventory, artwork.type, certLang) || undefined,
        size: formatSize(artwork) || undefined,
        series: artwork.series?.trim() || undefined,
        editionMode: isMultiple ? "multiple" : "unique",
        editionCount: total,
        copyNumber: isMultiple ? Math.max(1, copyIndex) : undefined,
        copyLabel: selectedEdition?.label || undefined,
        artistName: artistName || undefined,
        language: certLang
      });
      setCertLangOpen(false);
      if (path) onToast("Certificado generado.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "No se pudo generar el certificado."
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

  return (
    <section className="detail-layout">
      <div className="detail-image-panel">
        {imageUrl ? <img src={imageUrl} alt={artwork.title} /> : <div>Sin foto</div>}
        <div className="image-panel-actions">
          <button className="ghost" onClick={() => void addImage()} disabled={imageBusy}>
            {imageUrl ? "Cambiar foto" : "Añadir foto"}
          </button>
          <button className="ghost" onClick={() => setExporting(true)}>
            Salvar imagen…
          </button>
        </div>
      </div>
      {imageEditorSrc ? (
        <ImageEditModal
          sourceDataUrl={imageEditorSrc}
          onCancel={() => setImageEditorSrc(null)}
          onSave={saveEditedImage}
        />
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
            <h3 id="cert-lang-title">Generar certificado</h3>
            <p className="muted">
              Elige el idioma. La técnica y las comillas se adaptan solas.
            </p>
            <div className="cert-lang-choices" role="radiogroup" aria-label="Idioma">
              {(
                [
                  ["es", "Español"],
                  ["en", "English"],
                  ["de", "Deutsch"]
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
                ¿Qué ejemplar es este certificado?
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
                Cancelar
              </button>
              <button
                type="button"
                disabled={certBusy}
                onClick={() => void generateCertificate()}
              >
                {certBusy ? "Generando…" : "Generar PDF"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="detail-panel">
        <div className="detail-header">
          <div>
            <p className="eyebrow">{artwork.id}</p>
            <h2>{artwork.title}</h2>
          </div>
          <div className="form-head-actions">
            <button
              type="button"
              className="ghost"
              disabled={certBusy}
              onClick={openCertificateModal}
            >
              {certBusy ? "…" : "Generar certificado"}
            </button>
            <button onClick={onEdit}>Editar</button>
            <button className="ghost" onClick={onBack}>
              Volver
            </button>
          </div>
        </div>

        <div className="subtabs">
          <SubTab active={tab === "info"} onClick={() => setTab("info")}>
            Información
          </SubTab>
          <SubTab
            active={tab === "movimientos"}
            onClick={() => setTab("movimientos")}
          >
            Movimientos ({movements.length})
          </SubTab>
          <SubTab active={tab === "precio"} onClick={() => setTab("precio")}>
            Precio histórico
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
          <dl className="metadata">
            <dt>Serie</dt>
            <dd>{artwork.series || "-"}</dd>
            <dt>Tipo</dt>
            <dd>{labelFor(inventory, "artworkType", artwork.type)}</dd>
            <dt>Año</dt>
            <dd>{artwork.yearMade || "-"}</dd>
            <dt>Medidas</dt>
            <dd>
              {[artwork.height, artwork.width, artwork.depth].filter(Boolean).join(" x ") ||
                "-"}{" "}
              {artwork.unit}
            </dd>
            <dt>Estado</dt>
            <dd>
              <span className={`status-pill st-${slugify(artwork.status)}`}>
                {labelFor(inventory, "status", artwork.status)}
              </span>{" "}
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
                <dt>Galería</dt>
                <dd>{artwork.galleryName || contactName(inventory, artwork.galleryContactId)}</dd>
              </>
            )}
            {artwork.soldPrice && (
              <>
                <dt>Vendida por</dt>
                <dd>
                  {artwork.soldPrice}
                  {artwork.soldToName ? ` · ${artwork.soldToName}` : ""}
                  {artwork.soldDate ? ` · ${artwork.soldDate}` : ""}
                </dd>
              </>
            )}
            <dt>Edición</dt>
            <dd>
              {artwork.editionMode === "multiple"
                ? `Varias copias (${editions.length})`
                : "Única"}
            </dd>
            <dt>Notas</dt>
            <dd className="notes-display">{artwork.notes || "-"}</dd>
          </dl>
        )}

        {tab === "info" && artwork.editionMode === "multiple" && editions.length > 0 && (
          <div className="related-block">
            <h3>Copias ({editions.length})</h3>
            <div className="mini-table">
              {editions.map((edition) => (
                <div className="mini-row" key={edition.id}>
                  <strong>{edition.label}</strong>
                  <span>{labelFor(inventory, "status", edition.status || "not_made")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "info" && (
          <ExtraImages
            inventory={inventory}
            setInventory={setInventory}
            targetType="artwork"
            targetId={artwork.id}
            label="Imágenes adicionales"
            hint="Capturas de prensa, montajes o fotos donde aparece la obra. Solo se muestran aquí."
          />
        )}

        {tab === "movimientos" && (
          <div className="movements-view">
            {movements.length === 0 ? (
              <div className="movements-empty">
                <strong>Sin movimientos</strong>
                <p className="muted">Edita la obra para registrar ventas o préstamos.</p>
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
                        {labelFor(inventory, "movementType", item.type) || item.type}
                      </span>
                      <span className="mv-card-copy">
                        <strong>
                          {movementSummary(item, inventory)}
                          {item.editionLabel ? ` · ${item.editionLabel}` : ""}
                        </strong>
                        <span className="muted">
                          {[
                            item.date || "Sin fecha",
                            movementSubtitle(item, inventory)
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
            <strong>Eliminar esta obra</strong>
            <p className="muted">
              Se borrará «{artwork.title}» y todos sus movimientos. No se puede
              deshacer.
            </p>
          </div>
          <button className="ghost danger" onClick={() => setConfirmDelete(true)}>
            Eliminar obra…
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
          title="Eliminar obra"
          message={`Estás a punto de eliminar la obra «${artwork.title}» y todos sus movimientos asociados.`}
          confirmLabel="Eliminar definitivamente"
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
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const options = lookupOptions(inventory, category).filter(
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
          {allowEmpty && <option value="">—</option>}
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
          title="Añadir una opción nueva"
          onClick={() => setAdding(true)}
        >
          +
        </button>
        <button
          type="button"
          className="icon-button remove"
          title={
            canDelete
              ? "Quitar esta opción de la lista"
              : "Solo se pueden quitar opciones añadidas por ti"
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
            Añadir
          </button>
          <button
            type="button"
            className="small ghost"
            onClick={() => {
              setAdding(false);
              setDraft("");
            }}
          >
            Cancelar
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
  const usage = lookupUsage(inventory, category, fromValue);
  const targets = lookupOptions(inventory, category).filter(
    (option) => option.value !== fromValue
  );
  const fromLabel = labelFor(inventory, category, fromValue);
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
          <h3>Cambiar «{fromLabel}» antes de borrar</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted">
          Hay {usage.length}{" "}
          {usage.length === 1 ? "registro que usa" : "registros que usan"} esta
          opción de «{label.toLowerCase()}». Elige un valor nuevo para cada uno.
          Cuando todos tengan un valor, se borrará «{fromLabel}».
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
                <option value="">Elegir nuevo valor…</option>
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
          <p className="danger-text">
            No hay otra opción disponible. Añade una opción nueva antes de borrar
            esta.
          </p>
        )}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="danger-solid"
            disabled={!allChosen || busy || targets.length === 0}
            onClick={confirm}
          >
            Actualizar y borrar
          </button>
        </div>
      </div>
    </div>
  );
}

const CONTACT_KINDS: Array<[ContactKind, string]> = [
  ["person", "Persona"],
  ["gallery", "Galería"],
  ["museum", "Museo"],
  ["collection", "Colección"]
];

function contactKindLabel(kind: ContactKind): string {
  return CONTACT_KINDS.find(([k]) => k === kind)?.[1] ?? kind;
}

function isInstitution(kind: ContactKind): boolean {
  return kind !== "person";
}

// Same pattern as Tipo: pick an existing series, or + to type a new name.
function SeriesField({
  inventory,
  value,
  onChange
}: {
  inventory: InventoryData;
  value: string;
  onChange: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const options = useMemo(() => {
    const counts = new Map<string, number>();
    for (const art of inventory.artworks) {
      const name = art.series?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    for (const info of inventory.seriesInfo ?? []) {
      const name = info.name?.trim();
      if (!name) continue;
      if (!counts.has(name)) counts.set(name, 0);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es", { sensitivity: "base" }))
      .map(([name, count]) => ({ name, count }));
  }, [inventory.artworks, inventory.seriesInfo]);

  function commitNew() {
    const next = draft.trim();
    if (!next) return;
    onChange(next);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="field lookup-field">
      <span className="field-label">Serie</span>
      {adding ? (
        <div className="inline-add">
          <input
            autoFocus
            placeholder="Nombre de la serie"
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
            Usar
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setAdding(false);
              setDraft("");
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="lookup-row">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">— Sin serie</option>
            {options.map((option) => (
              <option key={option.name} value={option.name}>
                {option.count > 0
                  ? `${option.name} (${option.count})`
                  : option.name}
              </option>
            ))}
            {value.trim() &&
              !options.some((option) => option.name === value.trim()) && (
                <option value={value}>{value}</option>
              )}
          </select>
          <button
            type="button"
            className="icon-button add wide"
            title="Crear una serie nueva"
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
  const [showModal, setShowModal] = useState(false);
  const contacts = inventory.contacts.filter((contact) => contact.kind === kind);

  return (
    <div className="field lookup-field">
      <span className="field-label">{label}</span>
      <div className="lookup-row">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">— Seleccionar —</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button add wide"
          title={kind === "gallery" ? "Añadir galería nueva" : "Añadir persona nueva"}
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
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
    }
  }

  const heading = `${initial ? "Editar" : "Nueva"} ${contactKindLabel(
    kind
  ).toLowerCase()}`;

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
              Nombre {kind === "gallery" ? "de la galería" : kind === "museum" ? "del museo" : "de la colección"}
              <input value={form.name ?? ""} onChange={(event) => set("name", event.target.value)} />
            </label>
            <div className="form-row">
              <label className="field">
                Ciudad
                <input
                  value={form.city ?? ""}
                  onChange={(event) => set("city", event.target.value)}
                />
              </label>
              <label className="field">
                País
                <input
                  value={form.country ?? ""}
                  onChange={(event) => set("country", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                Sitio web
                <input
                  value={form.website ?? ""}
                  onChange={(event) => set("website", event.target.value)}
                />
              </label>
              <label className="field">
                Año de primer contacto
                <input
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="YYYY"
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
                Teléfono
                <input
                  value={form.phone ?? ""}
                  onChange={(event) => set("phone", event.target.value)}
                />
              </label>
              <label className="field">
                Email
                <input
                  value={form.email ?? ""}
                  onChange={(event) => set("email", event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              Relación / contacto
              <input
                value={form.relationship ?? ""}
                onChange={(event) => set("relationship", event.target.value)}
              />
            </label>
            <ContactSelect
              inventory={inventory}
              setInventory={setInventory}
              label="Galerista (persona de referencia)"
              kind="person"
              value={form.galleristContactId ?? ""}
              onChange={(value) => set("galleristContactId", value)}
            />
            <label className="field">
              Comentarios
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
                Nombre
                <input
                  value={form.firstName ?? ""}
                  onChange={(event) => set("firstName", event.target.value)}
                />
              </label>
              <label className="field">
                Apellido
                <input
                  value={form.lastName ?? ""}
                  onChange={(event) => set("lastName", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                Cumpleaños
                <DateField
                  value={form.birthday ?? ""}
                  onChange={(value) => set("birthday", value)}
                />
              </label>
              <label className="field">
                Profesión
                <input
                  value={form.job ?? ""}
                  onChange={(event) => set("job", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                Ciudad
                <input
                  value={form.city ?? ""}
                  onChange={(event) => set("city", event.target.value)}
                />
              </label>
              <label className="field">
                País
                <input
                  value={form.country ?? ""}
                  onChange={(event) => set("country", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                Relación
                <input
                  value={form.relationship ?? ""}
                  onChange={(event) => set("relationship", event.target.value)}
                />
              </label>
              <label className="field">
                Teléfono
                <input
                  value={form.phone ?? ""}
                  onChange={(event) => set("phone", event.target.value)}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                Email
                <input
                  value={form.email ?? ""}
                  onChange={(event) => set("email", event.target.value)}
                />
              </label>
              <label className="field">
                Año de primer contacto
                <input
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="YYYY"
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
              Sitio web
              <input
                value={form.website ?? ""}
                onChange={(event) => set("website", event.target.value)}
              />
            </label>
            <label className="field">
              Vinculada a (galería / museo / colección)
              <select
                value={form.organizationId ?? ""}
                onChange={(event) => set("organizationId", event.target.value)}
              >
                <option value="">— Ninguna —</option>
                {institutions.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} · {contactKindLabel(org.kind)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Comentarios
              <textarea
                value={form.comments ?? ""}
                onChange={(event) => set("comments", event.target.value)}
              />
            </label>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button onClick={save}>Guardar</button>
          <button className="ghost" onClick={onClose}>
            Cancelar
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
            Todos
          </button>
          {CONTACT_KINDS.map(([value, label]) => (
            <button
              key={value}
              className={kindFilter === value ? "seg active" : "seg"}
              onClick={() => setKindFilter(value)}
            >
              {label === "Persona" ? "Personas" : label === "Galería" ? "Galerías" : `${label}s`}
            </button>
          ))}
        </div>
        <input
          className="search-input grow"
          placeholder="Buscar contacto..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {countries.length > 0 && (
          <label className="sort-control">
            Lugar
            <select
              value={countryFilter}
              onChange={(event) => setCountryFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="sort-control">
          Ordenar
          <select value={sort} onChange={(event) => setSort(event.target.value as "name" | "recent")}>
            <option value="name">Nombre (A→Z)</option>
            <option value="recent">Recientes</option>
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
            Limpiar
          </button>
        )}
        <span className="count-pill">{contacts.length}</span>
        <label className="sort-control">
          Añadir
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) setModal({ kind: event.target.value as ContactKind });
            }}
          >
            <option value="">+ Nuevo…</option>
            {CONTACT_KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="list-table-wrap">
        <div className="list-table">
          <div className="list-row list-row-header">
            <span>Tipo</span>
            <span>Nombre</span>
            <span>Lugar</span>
            <span>Relación</span>
            <span>Contacto</span>
            <span>Desde</span>
          </div>
          {contacts.length === 0 ? (
            <div className="table-empty">Aún no hay personas ni galerías.</div>
          ) : (
            contacts.map((contact) => (
              <button
                key={contact.id}
                className="list-row clickable"
                onClick={() => onOpen(contact.id)}
              >
                <span>
                  <span className={`tag tag-${contact.kind}`}>
                    {contactKindLabel(contact.kind)}
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
      {imageUrl ? <img src={imageUrl} alt={artwork.title} /> : <span>—</span>}
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
  noSeriesLabel = "sin serie"
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
    return <p className="muted small-note">Todavía no has elegido obras.</p>;
  }

  return (
    <div className="app-series-order">
      <p className="muted small-note">
        Primero el orden de las <strong>series</strong> (bloques). Dentro de cada
        bloque, el orden de las <strong>obras</strong>. Así salen en el PDF.
      </p>
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
                {group.arts.length === 1 ? "obra" : "obras"}
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
                  Quitar
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
  title = "Añadir obras",
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
          <h3>{title}</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-toolbar">
          <input
            className="search-input grow"
            placeholder="Buscar obra..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="sort-control">
            Ordenar
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ArtworkSort)}
            >
              <option value="title">Título (A→Z)</option>
              <option value="series">Serie (A→Z)</option>
              <option value="year">Año</option>
              <option value="size">Tamaño</option>
            </select>
          </label>
        </div>
        {notice && <p className="muted small-note picker-notice">{notice}</p>}
        <div className="modal-body modal-pick-list">
          {list.length === 0 ? (
            <p className="muted">No hay obras que coincidan.</p>
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
                  {artwork.series ? `${artwork.series} · ` : ""}
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
            Añadir {picked.length} obra{picked.length === 1 ? "" : "s"} seleccionada
            {picked.length === 1 ? "" : "s"}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtraImageThumb({
  image,
  onDelete
}: {
  image: ArtworkImage;
  onDelete: () => void;
}) {
  const url = useImageDataUrl(image.absolutePath);

  async function saveCopy() {
    if (!image.absolutePath) return;
    await window.inventoryApi.saveImageCopy(image.absolutePath, image.caption);
  }

  return (
    <div className="extra-image">
      {url ? <img src={url} alt={image.caption ?? ""} /> : <span className="muted">…</span>}
      <button type="button" className="extra-image-remove" onClick={onDelete}>
        ✕
      </button>
      <button
        type="button"
        className="extra-image-save"
        title="Guardar una copia en otra carpeta"
        onClick={saveCopy}
      >
        Salvar copia
      </button>
    </div>
  );
}

function ExtraImages({
  inventory,
  setInventory,
  targetType,
  targetId,
  label,
  hint
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  targetType: "artwork" | "exhibition";
  targetId: string;
  label: string;
  hint: string;
}) {
  const [busy, setBusy] = useState(false);
  const images = inventory.images.filter(
    (image) =>
      image.targetType === targetType &&
      image.targetId === targetId &&
      image.category === "extra"
  );

  async function add() {
    setBusy(true);
    try {
      const result = await window.inventoryApi.importImage(targetType, targetId, "extra");
      if (result) setInventory(result.inventory);
    } finally {
      setBusy(false);
    }
  }

  async function remove(imageId: string) {
    const data = await window.inventoryApi.deleteImage(imageId);
    setInventory(data);
  }

  return (
    <div className="form-section extra-images-section">
      <div className="related-head">
        <h3>{label}</h3>
        <button type="button" className="ghost" disabled={busy} onClick={add}>
          + Añadir imagen
        </button>
      </div>
      <p className="muted small-note">{hint}</p>
      {images.length === 0 ? (
        <p className="muted small-note">Aún no hay imágenes guardadas.</p>
      ) : (
        <div className="extra-image-grid">
          {images.map((image) => (
            <ExtraImageThumb
              key={image.id}
              image={image}
              onDelete={() => void remove(image.id)}
            />
          ))}
        </div>
      )}
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
  "heic"
];

function isImageFile(name?: string): boolean {
  if (!name) return false;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}

function DocumentRow({
  image,
  setInventory,
  onDelete
}: {
  image: ArtworkImage;
  setInventory: (data: InventoryData) => void;
  onDelete: () => void;
}) {
  const name = image.originalName || image.relativePath.split("/").pop() || "documento";
  const isImage = isImageFile(name);
  const url = useImageDataUrl(isImage ? image.absolutePath : undefined);
  const [caption, setCaption] = useState(image.caption ?? "");

  async function saveCaption() {
    if ((image.caption ?? "") === caption) return;
    const data = await window.inventoryApi.setDocumentCaption(image.id, caption);
    setInventory(data);
  }

  async function open() {
    if (image.absolutePath) await window.inventoryApi.openDocument(image.absolutePath);
  }

  return (
    <div className="doc-row">
      <button type="button" className="doc-preview" onClick={open} title="Abrir">
        {isImage && url ? (
          <img src={url} alt={name} />
        ) : (
          <span className="doc-icon">{name.split(".").pop()?.toUpperCase() || "DOC"}</span>
        )}
      </button>
      <div className="doc-body">
        <button type="button" className="doc-name" onClick={open} title="Abrir documento">
          {name}
        </button>
        <input
          className="doc-caption"
          placeholder="Descripción o comentario…"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          onBlur={saveCaption}
        />
      </div>
      <button type="button" className="ghost danger small" onClick={onDelete}>
        Quitar
      </button>
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
  const [busy, setBusy] = useState(false);
  const documents = inventory.images.filter(
    (image) =>
      image.targetType === "exhibition" &&
      image.targetId === exhibitionId &&
      (image.category === "document" || image.category === "extra")
  );

  async function add() {
    setBusy(true);
    try {
      const result = await window.inventoryApi.importDocument("exhibition", exhibitionId);
      if (result) setInventory(result.inventory);
    } finally {
      setBusy(false);
    }
  }

  async function remove(imageId: string) {
    const data = await window.inventoryApi.deleteImage(imageId);
    setInventory(data);
  }

  return (
    <div className="form-section extra-images-section">
      <div className="related-head">
        <h3>Documentos de la exposición</h3>
        <button type="button" className="ghost" disabled={busy} onClick={add}>
          + Añadir documento
        </button>
      </div>
      <p className="muted small-note">
        Fotos de la sala, catálogos, notas de prensa, PDF o Word. Cada archivo
        puede llevar una descripción.
      </p>
      {documents.length === 0 ? (
        <p className="muted small-note">Aún no hay documentos guardados.</p>
      ) : (
        <div className="doc-list">
          {documents.map((image) => (
            <DocumentRow
              key={image.id}
              image={image}
              setInventory={setInventory}
              onDelete={() => void remove(image.id)}
            />
          ))}
        </div>
      )}
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
        error instanceof Error ? error.message : "No se pudo registrar la venta."
      );
    }
  }

  return (
    <div className="form-section">
      <div className="related-head">
        <h3>Ventas en esta exposición ({sales.length})</h3>
        <button type="button" className="ghost" onClick={() => setAdding(true)}>
          + Añadir venta
        </button>
      </div>
      {sales.length === 0 ? (
        <p className="muted small-note">Todavía no hay ventas registradas aquí.</p>
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
                  {movement.contactName || "Comprador/a sin registrar"}
                </span>
                <span className="muted">{movement.date || "Sin fecha"}</span>
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
              <h3>Añadir venta en {exhibition.title}</h3>
              <button className="icon-button ghost" onClick={reset}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <label className="field">
                Obra
                <input
                  className="search-input"
                  placeholder="Buscar obra..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <select value={artworkId} onChange={(event) => setArtworkId(event.target.value)}>
                  <option value="">— Seleccionar obra —</option>
                  {candidates.map((artwork) => (
                    <option key={artwork.id} value={artwork.id}>
                      {artwork.title}
                      {artwork.series ? ` · ${artwork.series}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label className="field">
                  Precio
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </label>
                <label className="field">
                  Fecha
                  <DateField value={date} onChange={setDate} />
                </label>
              </div>
              <ContactSelect
                inventory={inventory}
                setInventory={setInventory}
                label="Comprador/a (opcional)"
                kind="person"
                value={contactId}
                onChange={setContactId}
              />
            </div>
            <div className="modal-actions">
              <button type="button" disabled={!artworkId} onClick={save}>
                Salvar venta
              </button>
              <button type="button" className="ghost" onClick={reset}>
                Cancelar
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
  return (
    <div className="segmented small">
      {(
        [
          ["none", "Sin agrupar"],
          ["exhibition", "Por exposición"],
          ["year", "Por año"]
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
  groupBy: GroupBy
): Array<{ key: string; label: string; items: Movement[] }> {
  if (groupBy === "none") {
    return [{ key: "all", label: "", items: records }];
  }

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
          "Exposición";
        const exh = inventory.exhibitions.find((e) => e.id === movement.exhibitionId);
        const yr = yearOf(exh?.startDate) || yearOf(movement.date);
        label = yr ? `${title} · ${yr}` : title;
        sortVal = exh?.startDate ? yearOf(exh.startDate) : yearOf(movement.date);
      } else {
        key = "__none";
        label = "Sin exposición";
        sortVal = "0000";
      }
    } else {
      const yr = yearOf(movement.date);
      key = yr || "__noyear";
      label = yr || "Sin fecha";
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
  function saleRow(movement: Movement) {
    const artwork = artworkById.get(movement.artworkId);
    const billed = parseMoney(movement.price);
    const received = parseMoney(movement.received);
    const showContext =
      movement.context === "exhibition" || Boolean(movement.exhibitionId);
    const contextLabel = showContext
      ? movement.exhibitionTitle ||
        exhibitionTitle(inventory, movement.exhibitionId) ||
        "Exposición"
      : movement.context === "gallery"
        ? "Venta en galería"
        : "";

    return (
      <button
        key={movement.id}
        type="button"
        className="gallery-sale-row"
        onClick={() => onOpenArtwork(movement.artworkId)}
      >
        <div className="gallery-sale-main">
          <strong>{artwork?.title || "Obra"}</strong>
          <span className="gallery-sale-meta">
            {[movement.date, contextLabel].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div className="gallery-sale-money">
          <span>
            <em>Facturado</em>
            {billed != null ? formatMoney(billed) : "—"}
          </span>
          <span>
            <em>Recibido</em>
            {received != null ? formatMoney(received) : "—"}
          </span>
        </div>
      </button>
    );
  }

  const ordered = groupMovements(inventory, sales, groupBy);
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
            <p className="eyebrow">{contactKindLabel(contact.kind)}</p>
            <h2>{contact.name}</h2>
          </div>
          <div className="form-head-actions">
            <button onClick={() => setEditing(true)}>Editar</button>
            <button className="ghost" onClick={onBack}>
              Volver
            </button>
          </div>
        </div>

        <div className="related-block contact-details-block">
          <h3>Datos de contacto</h3>
          <dl className="metadata compact-metadata">
            <dt>Lugar</dt>
            <dd>{placeLabel || "—"}</dd>
            {contact.relationship && (
              <>
                <dt>Relación</dt>
                <dd>{contact.relationship}</dd>
              </>
            )}
            {contact.job && (
              <>
                <dt>Profesión</dt>
                <dd>{contact.job}</dd>
              </>
            )}
            <dt>Contacto</dt>
            <dd>{contactLine || "—"}</dd>
            {contact.website && (
              <>
                <dt>Web</dt>
                <dd>{contact.website}</dd>
              </>
            )}
            {contact.firstContactYear && (
              <>
                <dt>Primer contacto</dt>
                <dd>{contact.firstContactYear}</dd>
              </>
            )}
            {institution && galerista && (
              <>
                <dt>Galerista</dt>
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
                <dt>Vinculada a</dt>
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
                <dt>Comentarios</dt>
                <dd className="notes-display">{contact.comments}</dd>
              </>
            )}
          </dl>
        </div>

        {institution && (
          <>
            <div className={`contact-stats${isGallery ? " contact-stats-gallery" : ""}`}>
              <div className="contact-stat">
                <span>Exposiciones</span>
                <strong>{filteredExhibitions.length}</strong>
              </div>
              <div className="contact-stat">
                <span>Cuadros expuestos</span>
                <strong>{exhibitedAppearances.length}</strong>
              </div>
              {isGallery && (
                <>
                  <div className="contact-stat">
                    <span>Vendidos vía galería</span>
                    <strong>{soldArtworkIds.size}</strong>
                  </div>
                  <div className="contact-stat money">
                    <span>Dinero facturado</span>
                    <strong>{formatMoney(billedTotal)}</strong>
                    <small>Total de ventas</small>
                  </div>
                  <div className="contact-stat money received">
                    <span>Dinero recibido</span>
                    <strong>{formatMoney(receivedTotal)}</strong>
                    <small>Tras comisión</small>
                  </div>
                </>
              )}
            </div>

            {exhibitions.length > 0 && (
              <label className="contact-exh-filter">
                Ver por exposición
                <select
                  value={exhibitionFilter}
                  onChange={(event) => setExhibitionFilter(event.target.value)}
                >
                  <option value="">Todas las exposiciones</option>
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
                <h3>Personas ({linkedPeople.length})</h3>
              </button>
              <button
                type="button"
                className="ghost small"
                onClick={() => setLinkingPerson(true)}
              >
                + Añadir persona
              </button>
            </div>
            {showPeople &&
              (linkedPeople.length === 0 ? (
                <p className="muted small-note">
                  Aún no hay personas vinculadas a {contact.name}.
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
                          "Persona"}
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
              <h3>Exposiciones ({filteredExhibitions.length})</h3>
            </button>
            {showExhibitions &&
              (filteredExhibitions.length === 0 ? (
                <p className="muted">Sin exposiciones asociadas.</p>
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
                            artCount ? `${artCount} obras` : "",
                            saleCount ? `${saleCount} ventas` : ""
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
              <h3>Cuadros expuestos ({exhibitedAppearances.length})</h3>
            </button>
            {showExhibited &&
              (exhibitedAppearances.length === 0 ? (
                <p className="muted">
                  {exhibitionFilter
                    ? "Sin cuadros en esta exposición."
                    : "Sin cuadros expuestos asociados."}
                </p>
              ) : (
                <div className="mini-table">
                  {exhibitedAppearances.map((movement) => {
                    const artwork = artworkById.get(movement.artworkId);
                    const exhTitle =
                      movement.exhibitionTitle ||
                      exhibitionTitle(inventory, movement.exhibitionId) ||
                      "Exposición";
                    const status = movement.returned
                      ? "Devuelta"
                      : movement.keptAtGallery
                        ? "Se quedó con la galería"
                        : "En exposición";
                    return (
                      <button
                        className="mini-row clickable"
                        key={movement.id}
                        onClick={() => onOpenArtwork(movement.artworkId)}
                      >
                        <strong>{artwork?.title || "Obra"}</strong>
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
                <h3>Ventas por la galería ({sales.length})</h3>
              </button>
              {showSales && sales.length > 0 && !exhibitionFilter && (
                <GroupControl value={salesGroup} onChange={setSalesGroup} />
              )}
            </div>
            {showSales &&
              (sales.length === 0 ? (
                <p className="muted">
                  {exhibitionFilter
                    ? "Sin ventas en esta exposición."
                    : "Sin ventas registradas."}
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
              <h3>Pago a galerista ({galleryPayments.length})</h3>
            </button>
            {showPayments &&
              (galleryPayments.length === 0 ? (
                <p className="muted small-note">
                  Aún no hay obras entregadas como pago a esta galería.
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
                        <strong>{artwork?.title || "Obra"}</strong>
                        <span>
                          {[
                            payment.date,
                            cost > 0 ? formatMoney(cost) : "",
                            "Entregada como pago"
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
            <strong>Eliminar {contactKindLabel(contact.kind).toLowerCase()}</strong>
            <p className="muted">
              Se borrará «{contact.name}» de la lista de contactos. No se puede
              deshacer.
            </p>
          </div>
          <button className="ghost danger" onClick={() => setConfirmDelete(true)}>
            Eliminar…
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
          title={`Eliminar ${contactKindLabel(contact.kind).toLowerCase()}`}
          message={`Estás a punto de eliminar «${contact.name}» de tus contactos.`}
          confirmLabel="Eliminar definitivamente"
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
          placeholder="Buscar exposición..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {countries.length > 0 && (
          <label className="sort-control">
            País
            <select
              value={countryFilter}
              onChange={(event) => setCountryFilter(event.target.value)}
            >
              <option value="">Todos</option>
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
            Año
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              <option value="">Todos</option>
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="sort-control">
          Ordenar
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as "recent" | "title" | "year")}
          >
            <option value="recent">Recientes</option>
            <option value="title">Título (A→Z)</option>
            <option value="year">Año</option>
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
            Limpiar
          </button>
        )}
        <span className="count-pill">{exhibitions.length}</span>
        <button onClick={() => setEditing("new")}>+ Añadir exposición</button>
      </div>

      <div className="list-table-wrap">
        <div className="list-table exhibitions">
          <div className="list-row list-row-header">
            <span>Exposición</span>
            <span>Lugar</span>
            <span>Galería</span>
            <span>Fechas</span>
            <span>Obras</span>
          </div>
          {exhibitions.length === 0 ? (
            <div className="table-empty">Aún no hay exposiciones.</div>
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
          {shown || "Sin precio"}
        </span>
        <button
          type="button"
          className="pick-price-edit"
          onClick={() => setEditing(true)}
        >
          {shown ? "Editar" : "Poner precio"}
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
        Guardar
      </button>
      <button type="button" className="pick-price-cancel" onClick={cancel}>
        Cancelar
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
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
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
    <div className="form-card">
      <div className="form-head">
        <div>
          <p className="eyebrow">{exhibition ? "Editar exposición" : "Nueva exposición"}</p>
          <h2>{form.title || "Exposición"}</h2>
        </div>
        <div className="form-head-actions">
          <button onClick={save}>Guardar</button>
          {exhibition && (
            <button className="ghost" onClick={() => onGeneratePriceList(exhibition.id)}>
              Generar folleto de obras
            </button>
          )}
          <button className="ghost" onClick={onCancel ?? onDone}>
            Cancelar
          </button>
        </div>
      </div>

      {confirmDelete && exhibition && (
        <ConfirmDialog
          title="Eliminar exposición"
          message={`Estás a punto de eliminar la exposición «${exhibition.title}» y los movimientos de exposición vinculados.`}
          confirmLabel="Eliminar definitivamente"
          onConfirm={() => {
            setConfirmDelete(false);
            void remove();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <div className="form-section">
        <label className="field">
          Título de la exposición
          <input value={form.title} onChange={(event) => set("title", event.target.value)} />
        </label>
        <div className="form-row">
          <label className="field">
            Lugar / sala
            <input value={form.venue ?? ""} onChange={(event) => set("venue", event.target.value)} />
          </label>
          <LookupSelect
            inventory={inventory}
            setInventory={setInventory}
            category="exhibitionType"
            label="Tipo"
            value={form.exhibitionType ?? "group"}
            onChange={(value) => set("exhibitionType", value)}
          />
        </div>
        <div className="form-row">
          <label className="field">
            Ciudad
            <input value={form.city ?? ""} onChange={(event) => set("city", event.target.value)} />
          </label>
          <label className="field">
            País
            <input
              value={form.country ?? ""}
              onChange={(event) => set("country", event.target.value)}
            />
          </label>
        </div>
        <div className="form-row">
          <label className="field">
            Desde
            <DateField value={form.startDate ?? ""} onChange={(value) => set("startDate", value)} />
          </label>
          <label className="field">
            Hasta
            <DateField value={form.endDate ?? ""} onChange={(value) => set("endDate", value)} />
          </label>
        </div>
        <div className="form-row">
          <ContactSelect
            inventory={inventory}
            setInventory={setInventory}
            label="Curador/a"
            kind="person"
            value={form.curatorContactId ?? ""}
            onChange={(value) => set("curatorContactId", value)}
          />
          <ContactSelect
            inventory={inventory}
            setInventory={setInventory}
            label="Galería organizadora (opcional)"
            kind="gallery"
            value={form.galleryContactId ?? ""}
            onChange={(value) => set("galleryContactId", value)}
          />
        </div>
        <label className="field">
          Comentarios
          <textarea
            className="notes-area"
            value={form.comments ?? ""}
            onChange={(event) => set("comments", event.target.value)}
          />
        </label>

        <div className="artwork-picker">
          <div className="artwork-picker-head">
            <h3>Obras en esta exposición ({selected.length})</h3>
            <label className="sort-control">
              Ordenar
              <select
                value={artworkSort}
                onChange={(event) => setArtworkSort(event.target.value as ArtworkSort)}
              >
                <option value="title">Título (A→Z)</option>
                <option value="year">Año</option>
                <option value="size">Tamaño</option>
              </select>
            </label>
            <button type="button" onClick={() => setShowPicker(true)}>
              + Añadir obra a la exposición
            </button>
          </div>
          <p className="muted small-note">
            Cada obra tendrá un movimiento de «Exposición» (vuelve al estudio por
            defecto). Puedes anotar el precio de lista de cada obra, aunque no se venda.
          </p>
          <div className="artwork-pick-list">
            {selectedArtworks.length === 0 ? (
              <p className="muted small-note">
                Aún no hay obras. Usa «Añadir obra a la exposición».
              </p>
            ) : (
              selectedArtworks.map((artwork) => (
                <div className="pick-row" key={artwork.id}>
                  <button
                    type="button"
                    className="pick-row-main pick-row-open"
                    title="Ver la obra"
                    onClick={() => onOpenArtwork?.(artwork.id)}
                  >
                    <PickThumb artwork={artwork} inventory={inventory} />
                    <span className="pick-title">{artwork.title}</span>
                    <span className="muted">
                      {artwork.series ? `${artwork.series} · ` : ""}
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
                    Quitar
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {exhibition && (
          <ExhibitionSalesSection
            inventory={inventory}
            setInventory={setInventory}
            exhibition={exhibition}
          />
        )}

        {exhibition ? (
          <ExhibitionDocuments
            inventory={inventory}
            setInventory={setInventory}
            exhibitionId={exhibition.id}
          />
        ) : (
          <p className="muted small-note">
            Guarda la exposición para poder añadir documentos y ventas.
          </p>
        )}

        {showPicker && (
          <ArtworkPickerModal
            inventory={inventory}
            excludeIds={[...selected, ...soldBlockedIds]}
            notice="No aparecen las obras vendidas antes de la fecha de inicio de esta exposición."
            title="Añadir obras a la exposición"
            onConfirm={(ids) => {
              markDirty();
              setSelected((current) => [...current, ...ids]);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}

        {error && <div className="error-banner">{error}</div>}
        <div className="form-actions">
          <button onClick={save}>Guardar</button>
          <button className="ghost" onClick={onDone}>
            Cancelar
          </button>
        </div>

        {exhibition && (
          <div className="danger-zone">
            <div>
              <strong>Eliminar esta exposición</strong>
              <p className="muted">
                Se borrará «{exhibition.title}» y los movimientos de exposición
                vinculados. No se puede deshacer.
              </p>
            </div>
            <button className="ghost danger" onClick={() => setConfirmDelete(true)}>
              Eliminar exposición…
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
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>Nueva exposición</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <label className="field">
            Título
            <input value={form.title} onChange={(event) => set("title", event.target.value)} />
          </label>
          <div className="form-row">
            <label className="field">
              Lugar / sala
              <input
                value={form.venue ?? ""}
                onChange={(event) => set("venue", event.target.value)}
              />
            </label>
            <label className="field">
              Ciudad
              <input value={form.city ?? ""} onChange={(event) => set("city", event.target.value)} />
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              Desde
              <DateField value={form.startDate ?? ""} onChange={(value) => set("startDate", value)} />
            </label>
            <label className="field">
              Hasta
              <DateField value={form.endDate ?? ""} onChange={(value) => set("endDate", value)} />
            </label>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button onClick={save}>Guardar</button>
          <button className="ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

const DELETE_PHRASE = "Quiero borrar esto";

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
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState("");
  const ready = checked && typed.trim() === DELETE_PHRASE;

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
          Sí, estoy segura de que quiero borrar esto.
        </label>
        <label className="field">
          Para confirmar, escribe: <strong>{DELETE_PHRASE}</strong>
          <input
            value={typed}
            placeholder={DELETE_PHRASE}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel}>
            Cancelar
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
  const kind = movementKind(movement.type);
  const rows: Array<[string, string]> = [
    ["Tipo", labelFor(inventory, "movementType", movement.type)],
    ["Fecha", movement.date || "Sin fecha"]
  ];
  if (movement.editionLabel) rows.push(["Copia", movement.editionLabel]);
  if (kind === "exhibition") {
    rows.push([
      "Exposición",
      movement.exhibitionTitle || exhibitionTitle(inventory, movement.exhibitionId) || "-"
    ]);
    rows.push([
      "Resultado",
      movement.returned
        ? "Devuelta al estudio"
        : movement.keptAtGallery
          ? "Con galería tras la exposición"
          : "En exposición"
    ]);
  } else {
    if (movement.price) rows.push(["Precio", formatEuro(movement.price)]);
    if (movement.received) rows.push(["Recibido (neto)", formatEuro(movement.received)]);
    if (movement.context === "gallery") rows.push(["Contexto", "A través de galería"]);
    if (movement.context === "exhibition")
      rows.push([
        "Contexto",
        `En exposición: ${
          movement.exhibitionTitle ||
          exhibitionTitle(inventory, movement.exhibitionId) ||
          "-"
        }`
      ]);
    const who = movement.contactName || contactName(inventory, movement.contactId);
    if (who) rows.push([kind === "sale" ? "Comprador/a" : "Contacto", who]);
  }
  if (movement.notes) rows.push(["Notas", movement.notes]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>{movementSummary(movement, inventory)}</h3>
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
            Cerrar
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
            Restablecer
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

function basePriceAt(
  artwork: Artwork,
  settings: AppSettings,
  dateMs: number
): number | null {
  const factor = factorForDate(settings, sizeSumCm(artwork), dateMs);
  if (factor == null) return null;
  return sizeSumCm(artwork) * factor;
}

/** Half of factor × (alto+ancho) for «pago a galerista», with a clear gap reason. */
function galleryPaymentHalfInfo(
  artwork: Artwork | ArtworkInput,
  settings: AppSettings,
  dateMs: number
): { half: number | null; problem: string | null } {
  const h = toCm(artwork.height, artwork.unit ?? "cm");
  const w = toCm(artwork.width, artwork.unit ?? "cm");
  if (h == null || h <= 0 || w == null || w <= 0) {
    return {
      half: null,
      problem:
        "Faltan alto y ancho de la obra. Complétalos en la ficha para calcular el valor."
    };
  }
  const sizeSum = h + w;
  const types = settings.sizeTypes ?? [];
  if (types.length === 0) {
    return {
      half: null,
      problem:
        "No hay factores definidos. Ve a «Factores y precios» y configura los tamaños."
    };
  }
  const type = sizeTypeForSum(types, sizeSum);
  if (!type) {
    return {
      half: null,
      problem: `Ningún tamaño cubre ${Math.round(sizeSum)} cm (alto+ancho). Ajusta los rangos en «Factores y precios».`
    };
  }
  const factor = factorAt(type, dateMs);
  if (factor == null || factor <= 0) {
    return {
      half: null,
      problem: `«${type.label || "Ese tamaño"}» no tiene factor. Añádelo en «Factores y precios».`
    };
  }
  return { half: Math.round(sizeSum * factor * 0.5), problem: null };
}

function galleryPaymentHalfValue(
  artwork: Artwork | ArtworkInput,
  settings: AppSettings,
  dateMs: number
): number | null {
  return galleryPaymentHalfInfo(artwork, settings, dateMs).half;
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
    return <p className="muted">No hay datos suficientes para dibujar la gráfica.</p>;
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
                    `${marker.label} (${marker.x}) · sin precio de lista`
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
                  `Venta: ${formatMoney(d.y)} (${d.x})${d.label ? ` · ${d.label}` : ""}`
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
            <span className="legend-swatch" style={{ background: "#c0392b" }} /> Precio en
            exposición
          </span>
        )}
        {markers.length > 0 && (
          <span className="legend-item">
            <span className="legend-dash" aria-hidden /> Exposición sin precio
          </span>
        )}
        {saleDots.length > 0 && (
          <span className="legend-item">
            <span className="legend-star" aria-hidden>
              ★
            </span>{" "}
            Precio de venta
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
  const settings: AppSettings = {
    sizeTypes: inventory.settings.sizeTypes ?? [],
    taxRates: inventory.settings.taxRates ?? []
  };
  const taxRates = settings.taxRates;
  const [country, setCountry] = useState(taxCountries(settings)[0] ?? "");
  const [showTax, setShowTax] = useState(false);
  const nowYear = new Date().getFullYear();
  const [yearFrom, setYearFrom] = useState(2010);
  const [yearTo, setYearTo] = useState(nowYear);

  const sizeSum = sizeSumCm(artwork);
  const sizeType = sizeTypeForSum(settings.sizeTypes, sizeSum);
  const nowMs = Date.now();

  const axisFrom = Math.max(1970, Math.min(yearFrom, yearTo));
  const axisTo = Math.min(nowYear, Math.max(yearFrom, yearTo, axisFrom));

  const changeYears = factorChangeYears(sizeType);
  const pointYears = uniqueNumbers([
    axisFrom,
    ...changeYears.filter((y) => y >= axisFrom && y <= axisTo),
    axisTo
  ]).sort((a, b) => a - b);

  const yearToMs = (y: number) => new Date(Math.floor(y), 0, 1).getTime();

  const baseSeries: ChartSeries = {
    label: "Precio por factor",
    color: "#2f6fed",
    points: pointYears
      .map((y) => {
        const base = basePriceAt(artwork, settings, yearToMs(y));
        return base == null ? null : { x: y, y: base };
      })
      .filter((p): p is { x: number; y: number } => p !== null)
  };
  const taxSeries: ChartSeries = {
    label: `Con impuesto (${country || "—"})`,
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
        label: exhibition?.title || "Exposición",
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
        label: exhibition?.title || "Exposición",
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
        label: m.contactName || contactName(inventory, m.contactId) || "Venta",
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
          <span className="eyebrow">Tamaño (alto + ancho)</span>
          <strong>{sizeSum > 0 ? `${Math.round(sizeSum)} cm` : "Sin medidas"}</strong>
        </div>
        <div>
          <span className="eyebrow">Precio base {currentYear}</span>
          <strong>{currentBase != null ? formatMoney(currentBase) : "—"}</strong>
        </div>
        <div>
          <span className="eyebrow">
            Con impuesto ({country || "—"} {currentTax}%)
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
          Desde
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
          Hasta
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
          Mostrar línea con impuesto
        </label>
        <label className="sort-control">
          País (impuesto)
          <select value={country} onChange={(event) => setCountry(event.target.value)}>
            {taxCountries(settings).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {settings.sizeTypes.length === 0 && (
        <p className="muted small-note">
          Todavía no hay factores definidos. Ve a «Factores y precios» para añadir los
          tipos de tamaño y sus factores.
        </p>
      )}
      {sizeSum > 0 && !sizeType && settings.sizeTypes.length > 0 && (
        <p className="muted small-note">
          El tamaño de esta obra ({Math.round(sizeSum)} cm) no encaja en ningún tipo.
          Revisa los rangos en «Factores y precios».
        </p>
      )}
      {sizeSum === 0 && (
        <p className="muted small-note">
          Añade el alto y el ancho de la obra para calcular el precio.
        </p>
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
        <p className="muted">Aún no hay datos para mostrar una gráfica.</p>
      )}
    </div>
  );
}

function sizeTypeTitle(type: SizeType): string {
  const range = `de ${type.fromSum || 0} a ${type.toSum ? `${type.toSum} cm` : "sin límite"}`;
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
      setError("Elige la fecha desde la que vale el nuevo factor.");
      return;
    }
    if (factor <= 0) {
      setError("Escribe el nuevo factor (un número mayor que 0).");
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
      setError("Pon un nombre al tamaño (por ejemplo Pequeño).");
      return;
    }
    const fromSum = Number(draft.fromSum) || 0;
    const toSum = Number(draft.toSum) || 0;
    if (toSum > 0 && toSum < fromSum) {
      setError("El «hasta» no puede ser menor que el «desde».");
      return;
    }
    const overlap = findOverlappingSize(
      { ...draft, fromSum, toSum },
      existingTypes
    );
    if (overlap) {
      const name = overlap.label?.trim() || "Sin nombre";
      const range = `${overlap.fromSum || 0} → ${
        overlap.toSum ? `${overlap.toSum} cm` : "∞"
      }`;
      setError(
        `No permitido: se solapa con «${name}» (${range}). Los rangos no pueden coincidir ni cruzarse.`
      );
      return;
    }
    if (draft.factors.length === 0) {
      setError("Añade al menos un factor.");
      return;
    }
    for (const period of draft.factors) {
      if (!period.from?.trim()) {
        setError("Cada factor necesita una fecha de inicio. No dejes fechas vacías.");
        return;
      }
      if (!(period.factor > 0)) {
        setError("Cada factor debe ser un número mayor que 0.");
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
          <h3>{type.id.startsWith("st-new") ? "Nuevo tamaño" : "Tamaño"}</h3>
          <button className="icon-button ghost" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="cuentas-step">
            <p className="cuentas-q">Nombre</p>
            <div className="choice-row">
              {["Pequeño", "Mediano", "Grande"].map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`choice-chip${draft.label === name ? " active" : ""}`}
                  onClick={() => setDraft((c) => ({ ...c, label: name }))}
                >
                  {name}
                </button>
              ))}
            </div>
            <label className="mt-soft">
              Otro nombre
              <input
                value={draft.label ?? ""}
                placeholder="Ej. Extra grande"
                onChange={(event) =>
                  setDraft((c) => ({ ...c, label: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="cuentas-step">
            <p className="cuentas-q">Rango en cm (alto + ancho)</p>
            <div className="size-range-big">
              <label>
                Desde
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
                Hasta
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
            <p className="cuentas-q">Factores en el tiempo</p>
            <p className="muted small-note">
              Cada tarjeta dice: «a partir de esta fecha, el factor es este». La más
              reciente es la que se usa hoy.
            </p>
            <div className="factor-card-list">
              {sorted.map((period) => {
                const isLatest = period.id === latestId;
                return (
                  <div
                    className={`factor-card${isLatest ? " is-latest" : ""}`}
                    key={period.id}
                  >
                    <div className="factor-card-main">
                      {isLatest && <span className="factor-card-badge">Se usa ahora</span>}
                      <label>
                        A partir de
                        <DateField
                          value={period.from ?? ""}
                          onChange={(value) => updateFactor(period.id, { from: value })}
                        />
                      </label>
                      <label>
                        Factor
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
                        title="Quitar"
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
                + Cambiar el factor (nueva fecha)
              </button>
            ) : (
              <div className="factor-add-box">
                <p className="cuentas-q">Nuevo factor</p>
                <div className="form-grid two">
                  <label>
                    ¿Desde qué fecha vale?
                    <DateField value={newFrom} onChange={setNewFrom} />
                  </label>
                  <label>
                    ¿Cuál es el factor?
                    <input
                      inputMode="decimal"
                      value={newFactor}
                      placeholder="Ej. 22"
                      onChange={(event) => setNewFactor(event.target.value)}
                    />
                  </label>
                </div>
                <div className="choice-row">
                  <button type="button" onClick={addChange}>
                    Añadir
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setAdding(false);
                      setError("");
                    }}
                  >
                    Cancelar
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
              Eliminar tamaño
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" onClick={save}>
            Guardar
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
      setError("Elige la fecha desde la que vale el nuevo impuesto.");
      return;
    }
    if (rate < 0) {
      setError("El porcentaje no puede ser negativo.");
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
      setError("Escribe el nombre del país.");
      return;
    }
    const clash = existingCountries.some(
      (c) =>
        c.trim().toLowerCase() === name.toLowerCase() &&
        c.trim().toLowerCase() !== draft.originalCountry.trim().toLowerCase()
    );
    if (clash) {
      setError("Ese país ya existe. Ábrelo para cambiar sus impuestos.");
      return;
    }
    if (rates.length === 0) {
      setError("Añade al menos un porcentaje.");
      return;
    }
    for (const period of rates) {
      if (period.rate < 0 || !Number.isFinite(period.rate)) {
        setError("Cada porcentaje debe ser un número válido (0 o más).");
        return;
      }
    }
    const withDates = rates.filter((p) => p.from?.trim());
    const withoutDates = rates.filter((p) => !p.from?.trim());
    if (withoutDates.length > 1) {
      setError(
        "Solo puede haber un impuesto «desde el principio». Los cambios necesitan fecha."
      );
      return;
    }
    const fromKeys = new Set(withDates.map((p) => p.from!.trim()));
    if (fromKeys.size !== withDates.length) {
      setError("No repitas la misma fecha de inicio en dos cambios.");
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
          <h3>{draft.originalCountry ? "Impuesto del país" : "Nuevo país"}</h3>
          <button className="icon-button ghost" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="cuentas-step">
            <p className="cuentas-q">País</p>
            <input
              autoFocus={!draft.originalCountry}
              value={country}
              placeholder="Ej. España"
              onChange={(event) => setCountry(event.target.value)}
            />
          </div>

          <div className="cuentas-step">
            <p className="cuentas-q">Impuestos en el tiempo</p>
            <p className="muted small-note">
              Cada tarjeta es un periodo: «a partir de esta fecha, el IVA es este
              %». Si el impuesto cambia, añade otro periodo; no hace falta otra
              fila de país. El más reciente es el que se usa hoy.
            </p>
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
                        <span className="factor-card-badge">Se usa ahora</span>
                      )}
                      <label>
                        A partir de
                        <DateField
                          value={period.from ?? ""}
                          onChange={(value) => updateRate(period.id, { from: value })}
                        />
                        <span className="muted small-note">
                          {period.from?.trim()
                            ? until
                              ? `Hasta ${until}`
                              : "Sigue vigente"
                            : "Vacío = desde el principio"}
                        </span>
                      </label>
                      <label>
                        Impuesto %
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
                        title="Quitar"
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
                + Cambió el impuesto (nueva fecha)
              </button>
            ) : (
              <div className="factor-add-box">
                <p className="cuentas-q">Nuevo porcentaje</p>
                <div className="form-grid two">
                  <label>
                    ¿Desde qué fecha vale?
                    <DateField value={newFrom} onChange={setNewFrom} />
                  </label>
                  <label>
                    ¿Cuál es el %?
                    <input
                      inputMode="decimal"
                      value={newRate}
                      placeholder="Ej. 21"
                      onChange={(event) => setNewRate(event.target.value)}
                    />
                  </label>
                </div>
                <div className="choice-row">
                  <button type="button" onClick={addChange}>
                    Añadir
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setAdding(false);
                      setError("");
                    }}
                  >
                    Cancelar
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
              Eliminar país
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" onClick={save}>
            Guardar
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
      onError("Elige al menos una obra.");
      return;
    }
    setBusy(true);
    try {
      const atMs = dateToMs(asOfDate);
      const dateMs = Number.isFinite(atMs) ? (atMs as number) : Date.now();
      const headers = [
        "Nombre",
        "Serie",
        "Año",
        "Ancho (cm)",
        "Alto (cm)",
        "Suma (cm)",
        "Factor",
        "Base (€)"
      ];
      if (includeTax && country) headers.push(`Con impuesto ${country} (€)`);

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
        sheetName: "Precios",
        headers,
        rows
      });
      if (path) {
        onToast("Hoja de cálculo guardada.");
        onClose();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo exportar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>Generar hoja de precios</h3>
          <button className="icon-button ghost" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body export-wizard">
          <div className="export-step">
            <h4>1. ¿Incluir impuesto?</h4>
            <div className="choice-row">
              <button
                type="button"
                className={`choice-chip${includeTax ? " active" : ""}`}
                onClick={() => setIncludeTax(true)}
              >
                Sí, con impuesto
              </button>
              <button
                type="button"
                className={`choice-chip${!includeTax ? " active" : ""}`}
                onClick={() => setIncludeTax(false)}
              >
                No, solo precio base
              </button>
            </div>
          </div>

          {includeTax && (
            <div className="export-step">
              <h4>2. País del impuesto</h4>
              {countries.length === 0 ? (
                <p className="muted small-note">
                  Aún no hay países. Añádelos abajo en Impuestos.
                </p>
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
            <h4>{includeTax ? "3" : "2"}. ¿Qué obras?</h4>
            <div className="choice-row">
              <button
                type="button"
                className="choice-chip"
                onClick={() => setSelected(inventory.artworks.map((a) => a.id))}
              >
                Todas ({inventory.artworks.length})
              </button>
              <button type="button" className="ghost" onClick={() => setShowPicker(true)}>
                Elegir… ({selected.length} seleccionadas)
              </button>
            </div>
          </div>

          <div className="export-step">
            <h4>{includeTax ? "4" : "3"}. ¿Con el factor de qué fecha?</h4>
            <DateField value={asOfDate} onChange={setAsOfDate} />
            <p className="muted small-note">
              Se usa el factor vigente en esa fecha (sirve si cambió a mitad de año).
            </p>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" disabled={busy} onClick={generate}>
            {busy ? "Generando…" : "Generar Excel"}
          </button>
        </div>
        {showPicker && (
          <ArtworkPickerModal
            inventory={inventory}
            excludeIds={[]}
            initialIds={selected}
            title="Elegir obras para la hoja"
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
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>(
    inventory.settings.sizeTypes ?? []
  );
  const [taxRates, setTaxRates] = useState<TaxRate[]>(
    inventory.settings.taxRates ?? []
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<SizeType | null>(null);
  const [editingTax, setEditingTax] = useState<TaxCountryDraft | null>(null);
  const [showExport, setShowExport] = useState(false);

  const dirty =
    JSON.stringify(sizeTypes) !==
      JSON.stringify(inventory.settings.sizeTypes ?? []) ||
    JSON.stringify(taxRates) !== JSON.stringify(inventory.settings.taxRates ?? []);

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
      label: "Pequeño",
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
        const a = type.label?.trim() || "Sin nombre";
        const b = overlap.label?.trim() || "Sin nombre";
        onError(
          `No se puede guardar: «${a}» se solapa con «${b}». Corrige los rangos antes.`
        );
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
        taxRates: taxRates.filter((t) => t.country.trim())
      });
      setInventory(data);
      setSizeTypes(data.settings.sizeTypes);
      setTaxRates(data.settings.taxRates);
      setSaved(true);
      onToast("Factores y precios guardados.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const orderedTypes = sortSizeTypes(sizeTypes);

  return (
    <section className="list-page pricing-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Precios</p>
          <h2>Factores y precios</h2>
          <p className="page-lead">
            Precio = (alto + ancho) × factor. Los tamaños van de pequeño a grande y
            no pueden solaparse.
          </p>
        </div>
        <div className="form-head-actions">
          <button type="button" className="ghost" onClick={() => setShowExport(true)}>
            Generar hoja
          </button>
          <button disabled={saving || !dirty} onClick={save}>
            {saved && !dirty ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="pricing-block">
        <div className="related-head">
          <h3>Tamaños</h3>
          <button type="button" onClick={addType}>
            + Nuevo tamaño
          </button>
        </div>
        {orderedTypes.length === 0 ? (
          <div className="empty-friendly">
            <p>Todavía no hay tamaños. Empieza con uno, por ejemplo «Pequeño».</p>
            <button type="button" onClick={addType}>
              Crear el primero
            </button>
          </div>
        ) : (
          <div className="pricing-line-list">
            <div className="pricing-line-head">
              <span>Nombre</span>
              <span>Rango (alto + ancho)</span>
              <span>Factor</span>
              <span />
            </div>
            {orderedTypes.map((type) => {
              const factor = currentFactorForType(type);
              const name = type.label?.trim() || "Sin nombre";
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
          <h3>Impuestos</h3>
          <button type="button" className="ghost" onClick={addTaxCountry}>
            + País
          </button>
        </div>
        {taxCountriesList.length === 0 ? (
          <div className="empty-friendly">
            <p>Aún no hay países. Añade uno para poner su IVA.</p>
            <button type="button" onClick={addTaxCountry}>
              Añadir el primero
            </button>
          </div>
        ) : (
          <div className="pricing-line-list">
            <div className="pricing-line-head">
              <span>País</span>
              <span>Periodos</span>
              <span>Ahora</span>
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
                    {changes === 1 ? "1 porcentaje" : `${changes} periodos`}
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
        <p className="muted small-note">
          Entra en un país para ver o cambiar el impuesto. Si el IVA sube o baja,
          añade un periodo con la fecha del cambio — no hace falta otro país.
        </p>
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

function requireApi<K extends keyof typeof window.inventoryApi>(
  name: K
): (typeof window.inventoryApi)[K] {
  const fn = window.inventoryApi?.[name];
  if (typeof fn !== "function") {
    throw new Error(
      "La app necesita reiniciarse para usar esta función. Cierra la ventana y vuelve a abrir «npm run dev»."
    );
  }
  return fn;
}

async function copyTextToClipboard(text: string): Promise<void> {
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
  if (!ok) throw new Error("No se pudo copiar al portapapeles.");
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
  const haystack = searchKey(`${example.topic} ${example.body}`);
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
    body: String(example.body ?? example.text ?? "")
  };
}

function seriesTextKey(seriesId: string, textId: string): string {
  return `${seriesId}::${textId}`;
}

function expenseCategoryLabel(category: ExpenseCategory): string {
  switch (category) {
    case "material":
      return "Materiales";
    case "exhibition":
      return "Exposición";
    default:
      return "Varios";
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
      onError("Escribe cuánto se gastó (el importe).");
      return;
    }
    setSaving(true);
    try {
      const data = await requireApi("saveExpense")(form);
      setInventory(data);
      onToast("Gasto guardado.");
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function attachReceipt() {
    try {
      let expenseId = form.id;
      if (!expenseId) {
        if (!form.amount.trim()) {
          onError("Antes de adjuntar el ticket, escribe el importe.");
          return;
        }
        const data = await requireApi("saveExpense")(form);
        setInventory(data);
        const created = [...data.expenses].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt)
        )[0];
        expenseId = created?.id;
        if (!expenseId) {
          onError("No se pudo crear el gasto.");
          return;
        }
        setForm((current) => ({ ...current, id: expenseId }));
      }
      const result = await requireApi("importImage")("expense", expenseId, "receipt");
      if (!result) return;
      setInventory(result.inventory);
      const image = result.image as { id?: string };
      if (image?.id) set("receiptImageId", image.id);
      onToast("Ticket guardado.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo adjuntar.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide cuentas-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{expense ? "Editar gasto" : "Añadir un gasto"}</h3>
          <button type="button" className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="cuentas-step">
            <p className="cuentas-q">¿De qué tipo es?</p>
            <div className="cuentas-type-grid">
              {(
                [
                  ["material", "Materiales", "Lienzos, pintura, marcos…"],
                  ["exhibition", "Exposición", "Transporte, montaje, catálogo…"],
                  ["misc", "Otros", "Cualquier otro gasto"]
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
            <p className="cuentas-q">¿Cuánto y cuándo?</p>
            <div className="form-grid two">
              <label>
                Importe en euros
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
                Fecha
                <DateField
                  value={form.date ?? ""}
                  onChange={(value) => set("date", value)}
                />
              </label>
            </div>
          </div>

          <div className="cuentas-step">
            <p className="cuentas-q">¿En qué se gastó?</p>
            <label>
              Nota breve
              <input
                value={form.note}
                placeholder="Ej. tubos de óleo, transporte a Madrid…"
                onChange={(event) => set("note", event.target.value)}
              />
            </label>
          </div>

          {form.category === "exhibition" && (
            <div className="cuentas-step">
              <p className="cuentas-q">¿Con qué exposición? (opcional)</p>
              <div className="form-grid two">
                <label>
                  Exposición
                  <select
                    value={form.exhibitionId ?? ""}
                    onChange={(event) => set("exhibitionId", event.target.value)}
                  >
                    <option value="">Ninguna</option>
                    {inventory.exhibitions.map((exhibition) => (
                      <option key={exhibition.id} value={exhibition.id}>
                        {exhibition.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Galería o persona
                  <select
                    value={form.contactId ?? ""}
                    onChange={(event) => set("contactId", event.target.value)}
                  >
                    <option value="">Ninguna</option>
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
            <p className="cuentas-q">Ticket o factura (opcional)</p>
            <div className="receipt-box">
              {receiptUrl ? (
                <img className="receipt-thumb" src={receiptUrl} alt="Ticket" />
              ) : (
                <p className="muted">Todavía no hay foto del ticket.</p>
              )}
              <button type="button" className="ghost" onClick={attachReceipt}>
                {receiptUrl ? "Cambiar foto" : "Hacer foto / elegir imagen"}
              </button>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" disabled={saving} onClick={save}>
            {saving ? "Guardando…" : "Guardar gasto"}
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
          category: expenseCategoryLabel(expense.category),
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
            category: "Pago a galerista",
            date: payment.date || "",
            amount: galleryPaymentCost(payment, art, settings),
            note: art?.title ? `Obra: ${art.title}` : "Obra entregada como pago",
            where: contactName(payment.contactId) || payment.contactName || ""
          };
        })
      ];
      const incomeRows = sales.map((sale) => {
        const art = inventory.artworks.find((a) => a.id === sale.artworkId);
        const contextLabel =
          sale.context === "gallery"
            ? "Venta en galería"
            : sale.context === "exhibition"
              ? "Venta en exposición"
              : "Venta directa";
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

      const path = await requireApi("exportFinancialsSheet")({
        filename: "cuentas.xlsx",
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        exhibitionTitle: exhibitionTitle || undefined,
        expenseRows,
        incomeRows,
        totals: { spent, earned, net: earned - spent }
      });
      if (path) {
        onToast("Resumen guardado.");
        onClose();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo exportar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>Hacer un resumen en Excel</h3>
          <button type="button" className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body export-wizard">
          <p className="muted small-note">
            Elige qué incluir. Si no tocas nada, se incluyen todos los gastos y las
            ventas con impuesto.
          </p>
          <div className="export-step">
            <h4>1. ¿Qué periodo?</h4>
            <div className="form-grid two">
              <label>
                Desde
                <DateField value={fromDate} onChange={setFromDate} />
              </label>
              <label>
                Hasta
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
              Todo el tiempo
            </button>
          </div>
          <div className="export-step">
            <h4>2. ¿Solo una exposición?</h4>
            <select
              value={exhibitionId}
              onChange={(event) => setExhibitionId(event.target.value)}
            >
              <option value="">No, todas</option>
              {inventory.exhibitions.map((exhibition) => (
                <option key={exhibition.id} value={exhibition.id}>
                  {exhibition.title}
                </option>
              ))}
            </select>
          </div>
          <div className="export-step">
            <h4>3. Incluir también</h4>
            <label className="checkline">
              <input
                type="checkbox"
                checked={includeGalleryPayments}
                onChange={(event) =>
                  setIncludeGalleryPayments(event.target.checked)
                }
              />
              Incluir obras «pago a galerista» como gasto
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={includeSalesWithoutTax}
                onChange={(event) =>
                  setIncludeSalesWithoutTax(event.target.checked)
                }
              />
              Incluir ventas sin impuesto
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" disabled={busy} onClick={generate}>
            {busy ? "Creando…" : "Crear Excel"}
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
      const data = await requireApi("deleteExpense")(id);
      setInventory(data);
      setConfirmId(null);
      onToast("Gasto eliminado.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo eliminar.");
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
          <p className="eyebrow">Dinero</p>
          <h2>Cuentas</h2>
          <p className="page-lead">
            Anota gastos aquí. Las ventas cuentan lo que tú recibes (después de
            comisión de galería, si la hay). «Pago a galerista» cuenta como coste.
          </p>
        </div>
        <label className="checkline hide-money-toggle">
          <input type="checkbox" checked={hideMoney} onChange={toggleHideMoney} />
          Ocultar importes
        </label>
      </div>

      <div className="cuentas-toolbar">
        <label className="cuentas-select">
          Año
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
            <option value={String(thisYear)}>Este año ({thisYear})</option>
            {yearOptions
              .filter((y) => y !== thisYear)
              .map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            <option value="all">Todo el tiempo</option>
            <option value="range">Elegir fechas…</option>
          </select>
        </label>

        <label className="cuentas-select">
          Tipo de gasto
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as "all" | ExpenseCategory)
            }
          >
            <option value="all">Todos</option>
            <option value="material">Materiales</option>
            <option value="exhibition">Exposición</option>
            <option value="misc">Otros</option>
          </select>
        </label>

        <button
          type="button"
          className={`ghost${showMore ? " is-on" : ""}`}
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? "Menos filtros" : "Más filtros"}
        </button>
      </div>

      {periodMode === "range" && (
        <div className="cuentas-range-row">
          <label>
            Desde
            <DateField value={fromDate} onChange={setFromDate} />
          </label>
          <label>
            Hasta
            <DateField value={toDate} onChange={setToDate} />
          </label>
        </div>
      )}

      {showMore && (
        <div className="cuentas-more-filters">
          <label>
            Exposición
            <select
              value={exhibitionId}
              onChange={(event) => setExhibitionId(event.target.value)}
            >
              <option value="">Todas</option>
              {inventory.exhibitions.map((exhibition) => (
                <option key={exhibition.id} value={exhibition.id}>
                  {exhibition.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Persona / galería
            <select
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
            >
              <option value="">Todas</option>
              {inventory.contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>
          {(category !== "all" || exhibitionId || contactId) && (
            <button type="button" className="ghost small" onClick={clearExtra}>
              Limpiar
            </button>
          )}
        </div>
      )}

      <div className="money-totals money-totals-stack">
        <div className="money-card spent">
          <span>Gastado</span>
          <strong>{moneyLabel(spent)}</strong>
        </div>
        <div className="money-card earned">
          <span>Recibido</span>
          <strong>{moneyLabel(earned)}</strong>
        </div>
      </div>

      <div className="cuentas-actions">
        <button type="button" className="cuentas-primary" onClick={() => setEditing("new")}>
          + Añadir un gasto
        </button>
        <button type="button" className="ghost" onClick={() => setShowExport(true)}>
          Hacer resumen en Excel
        </button>
      </div>

      <div className="cuentas-links">
        <button
          type="button"
          className="cuentas-link-card"
          onClick={() => setShowExpenses(true)}
        >
          <span className="cuentas-link-label">Gastos del periodo</span>
          <strong>{expenses.length}</strong>
          <span className="muted">
            {expenses.length === 0
              ? allExpenses.length === 0
                ? "Todavía no hay gastos"
                : "Ninguno en este filtro"
              : "Ver detalle"}
          </span>
        </button>
        {galleryPayments.length > 0 && (
          <button
            type="button"
            className="cuentas-link-card"
            onClick={() => setShowPayments(true)}
          >
            <span className="cuentas-link-label">Pago a galerista</span>
            <strong>{galleryPayments.length}</strong>
            <span className="muted">Ver detalle</span>
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
              <h3>Gastos ({expenses.length})</h3>
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
                      ? "Todavía no hay gastos. Empieza con «Añadir un gasto»."
                      : "No hay gastos en este periodo."}
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
                            {expenseCategoryLabel(expense.category)}
                          </span>
                          <strong className="expense-note">
                            {expense.note || "Sin descripción"}
                          </strong>
                          <span className="muted expense-meta">
                            {expense.date || "Sin fecha"}
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
                          Borrar
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
                + Añadir un gasto
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowExpenses(false)}
              >
                Cerrar
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
              <h3>Pago a galerista ({galleryPayments.length})</h3>
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
                        <span className="expense-cat-pill">Pago a galerista</span>
                        <strong className="expense-note">
                          {art?.title || payment.artworkId}
                        </strong>
                        <span className="muted expense-meta">
                          {payment.date || "Sin fecha"}
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
                Cerrar
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
              <h3>¿Borrar este gasto?</h3>
            </div>
            <p className="confirm-message">Se quitará de las cuentas.</p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setConfirmId(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="ghost danger"
                onClick={() => remove(confirmId)}
              >
                Sí, borrar
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
  return labelFor(inventory, "artworkType", value);
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
  return (
    <span className="order-btns">
      <button
        type="button"
        className="ghost small order-btn"
        disabled={index === 0}
        title="Subir"
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="ghost small order-btn"
        disabled={index >= total - 1}
        title="Bajar"
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
      placeholder || "Escribe aquí…"
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
        <div className="rich-tool-group" role="group" aria-label="Estilo por letra">
          <button
            type="button"
            className="rich-tool"
            title="Negrita (selección)"
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
            title="Cursiva (selección)"
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
            title="Subrayado (selección)"
            onMouseDown={(e) => {
              e.preventDefault();
              run("underline");
            }}
          >
            <span className="rich-tool-u">U</span>
          </button>
        </div>
        <RichMenuSelect
          label="Fuente"
          value={pickedFont}
          className="rich-font"
          options={PRICELIST_FONTS.map((font) => ({
            value: font,
            label: font
          }))}
          onPick={(v) => applyFont(v)}
        />
        <RichMenuSelect
          label="Tamaño"
          value={pickedSize}
          className="rich-size"
          options={RICH_TEXT_SIZES.map((pt) => ({
            value: `${pt}pt`,
            label: String(pt)
          }))}
          onPick={(v) => applySize(v)}
        />
        <label className="rich-color" title="Color del texto">
          <input
            type="color"
            defaultValue="#2a2620"
            onMouseDown={(e) => e.preventDefault()}
            onChange={(event) => run("foreColor", event.target.value)}
          />
        </label>
      </div>
      <iframe className="rich-frame" title="Editor de texto" ref={iframeRef} />
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
      heading: application.headingAboutWorks || APP_HEADING_DEFAULTS[lang].aboutWorks,
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
        application.headingAboutProject || APP_HEADING_DEFAULTS[lang].aboutProject,
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
    beca: { es: "Beca / stipendio", en: "Grant / stipend", de: "Stipendium" },
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
  // Series come from paintings (plus any already saved metadata).
  const names = uniqueValues([
    ...inventory.artworks.map((a) => a.series),
    ...inventory.seriesInfo.map((s) => s.name)
  ]).sort((a, b) => a.localeCompare(b, "es"));
  const [selectedName, setSelectedName] = useState<string | null>(names[0] ?? null);

  const info =
    inventory.seriesInfo.find(
      (s) => s.name.toLowerCase() === (selectedName ?? "").toLowerCase()
    ) ?? null;
  const works = inventory.artworks.filter(
    (a) => (a.series ?? "").toLowerCase() === (selectedName ?? "").toLowerCase()
  );

  return (
    <section className="list-page series-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Colecciones</p>
          <h2>Series (metadatos)</h2>
          <p className="page-lead">
            Las series aparecen solas cuando las usas en una obra. Aquí añades textos y
            documentos compartidos.
          </p>
        </div>
      </div>

      <div className="series-layout">
        <aside className="series-sidebar">
          <div className="series-name-list">
            {names.length === 0 ? (
              <p className="muted small-note">
                Aún no hay series. Pon un nombre de serie al guardar una obra.
              </p>
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
                  {name}
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

        <div className="series-detail">
          {!selectedName ? (
            <div className="empty-friendly">
              <p>Elige una serie a la izquierda.</p>
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
  const [texts, setTexts] = useState<SeriesText[]>(info?.texts ?? []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTexts(info?.texts ?? []);
    setOpenId(null);
  }, [info?.id, name]);

  const docs = inventory.images.filter(
    (image) => image.targetType === "series" && image.targetId === info?.id
  );

  async function save(nextTexts = texts) {
    setSaving(true);
    try {
      const data = await requireApi("saveSeriesInfo")({
        id: info?.id,
        name,
        texts: nextTexts,
        notes: info?.notes ?? ""
      });
      setInventory(data);
      onToast("Serie guardada.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  function addText() {
    const id = `txt-${Date.now()}`;
    const next = [...texts, { id, topic: "Nuevo texto", body: "" }];
    setTexts(next);
    setOpenId(id);
  }

  function updateText(id: string, patch: Partial<SeriesText>) {
    setTexts((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeText(id: string) {
    const next = texts.filter((t) => t.id !== id);
    setTexts(next);
    if (openId === id) setOpenId(null);
  }

  async function addDocument() {
    let seriesId = info?.id;
    if (!seriesId) {
      const data = await requireApi("saveSeriesInfo")({
        name,
        texts,
        notes: info?.notes ?? ""
      });
      setInventory(data);
      seriesId = data.seriesInfo.find(
        (s) => s.name.toLowerCase() === name.toLowerCase()
      )?.id;
      if (!seriesId) {
        onError("No se pudo crear la serie.");
        return;
      }
    }
    const result = await requireApi("importImage")("series", seriesId, "document");
    if (!result) return;
    setInventory(result.inventory);
    onToast("Documento añadido.");
  }

  return (
    <div className="series-panel">
      <div className="related-head">
        <h3>{name}</h3>
        <button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <div className="series-texts-head">
        <h4>Textos</h4>
        <button type="button" className="ghost" onClick={addText}>
          + Añadir texto
        </button>
      </div>
      <p className="muted small-note">
        Cada texto tiene un tema. Solo ves el tema y el principio; ábrelo para editar.
      </p>

      {texts.length === 0 ? (
        <div className="empty-friendly">
          <p>Todavía no hay textos en esta serie.</p>
          <button type="button" onClick={addText}>
            Añadir el primero
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
                  <strong>{text.topic || "Sin tema"}</strong>
                  {!open && preview && (
                    <span className="muted series-text-preview">{preview}</span>
                  )}
                  <span className="series-text-chevron">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="series-text-body">
                    <label>
                      Tema
                      <input
                        value={text.topic}
                        placeholder="Ej. Idea principal, contexto histórico…"
                        onChange={(event) =>
                          updateText(text.id, { topic: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Texto
                      <textarea
                        rows={5}
                        value={text.body}
                        placeholder="Escribe aquí…"
                        onChange={(event) =>
                          updateText(text.id, { body: event.target.value })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost danger small"
                      onClick={() => removeText(text.id)}
                    >
                      Quitar este texto
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="series-docs">
        <div className="related-head">
          <h4>Documentos</h4>
          <button type="button" className="ghost" onClick={addDocument}>
            + Añadir documento
          </button>
        </div>
        {docs.length === 0 ? (
          <p className="muted small-note">Sin documentos todavía.</p>
        ) : (
          <ul className="doc-list">
            {docs.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    doc.absolutePath &&
                    void window.inventoryApi.openDocument(doc.absolutePath)
                  }
                >
                  {doc.originalName || doc.caption || "Documento"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="series-works">
        <h4>Obras en esta serie ({works.length})</h4>
        {works.length === 0 ? (
          <p className="muted small-note">Ninguna obra usa este nombre todavía.</p>
        ) : (
          <div className="expense-list">
            {works.map((art) => (
              <button
                key={art.id}
                type="button"
                className="series-work-row"
                onClick={() => onOpenArtwork(art.id)}
              >
                <strong>{art.title}</strong>
                <span className="muted">{art.yearMade || ""}</span>
              </button>
            ))}
          </div>
        )}
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
  saveRef,
  onOpenGenerator
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: MutableRefObject<null | (() => Promise<boolean>)>;
  onOpenGenerator: () => void;
}) {
  const stored = useMemo(
    () => (inventory.textGeneratorExamples ?? []).map(normalizeTextExample),
    [inventory.textGeneratorExamples]
  );
  const [examples, setExamples] = useState<TextGeneratorExample[]>(stored);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      const data = await requireApi("saveTextGeneratorExamples")(cleaned);
      setInventory(data);
      onDirtyChange?.(false);
      onToast("Biblioteca guardada.");
      return true;
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "No se pudo guardar la biblioteca."
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

  function addExample() {
    const id = `example-${Date.now()}`;
    setSearch("");
    setExamples((current) => [{ id, topic: "", body: "" }, ...current]);
    setEditingId(id);
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
    if (editingId === id) setEditingId(null);
  }

  const list = examples.filter((example) =>
    exampleMatchesSearch(example, search)
  );

  return (
    <section className="list-page examples-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Textos de referencia</p>
          <h2>Biblioteca de ejemplos</h2>
          <p className="page-lead">
            Guarda aquí textos que te gusten (tuyos o de otros). En el Generador
            de texto podrás elegir cuáles usar como referencia de tono.
          </p>
        </div>
        <div className="row-actions">
          <button type="button" className="ghost" onClick={onOpenGenerator}>
            Ir al generador
          </button>
          <button
            type="button"
            className="cuentas-primary"
            disabled={!dirty || saving}
            onClick={() => void persist()}
          >
            {saving ? "Guardando…" : dirty ? "Guardar cambios" : "Todo guardado"}
          </button>
        </div>
      </div>

      <div className="examples-toolbar">
        <input
          className="search-input grow"
          placeholder="Buscar por tema o por palabras del texto..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span className="count-pill">
          {search ? `${list.length} de ${examples.length}` : `${examples.length}`}{" "}
          ejemplo{examples.length === 1 ? "" : "s"}
        </span>
        <button type="button" onClick={addExample}>
          + Nuevo ejemplo
        </button>
      </div>

      {examples.length === 0 ? (
        <div className="empty-state">
          Todavía no hay ejemplos. Pulsa «+ Nuevo ejemplo» y pega un texto que
          te guste.
        </div>
      ) : list.length === 0 ? (
        <p className="muted">Ningún ejemplo coincide con esa búsqueda.</p>
      ) : (
        <div className="examples-grid">
          {list.map((example) => {
            const editing = editingId === example.id;
            const body = example.body.trim();
            const open = expandedId === example.id;
            return (
              <article
                className={`example-card${editing ? " is-editing" : ""}`}
                key={example.id}
              >
                {editing ? (
                  <>
                    <input
                      className="example-topic-input"
                      value={example.topic}
                      placeholder="Tema (ej. declaración de artista)"
                      autoFocus
                      onChange={(event) =>
                        update(example.id, { topic: event.target.value })
                      }
                    />
                    <textarea
                      rows={12}
                      value={example.body}
                      placeholder="Pega aquí el texto de ejemplo…"
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
                        Borrar
                      </button>
                      <button
                        type="button"
                        className="small"
                        onClick={() => setEditingId(null)}
                      >
                        Listo
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="example-card-head">
                      <strong>{example.topic || "Sin tema"}</strong>
                      <span className="muted small-note">
                        {countWords(body)} palabras
                      </span>
                    </div>
                    <p className={`example-card-body${open ? " is-open" : ""}`}>
                      {body || (
                        <span className="muted">Sin texto todavía.</span>
                      )}
                    </p>
                    <div className="example-card-actions">
                      {body.length > 260 && (
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() =>
                            setExpandedId(open ? null : example.id)
                          }
                        >
                          {open ? "Ver menos" : "Ver entero"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => setEditingId(example.id)}
                      >
                        Editar
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      {dirty && (
        <p className="muted small-note examples-dirty-note">
          Tienes cambios sin guardar.
        </p>
      )}
    </section>
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(
    () =>
      inventory.settings.textGeneratorSystemPrompt?.trim() ||
      DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT
  );
  const [systemPromptSaving, setSystemPromptSaving] = useState(false);
  const [instruction, setInstruction] = useState(
    "Escribe un primer borrador claro, profesional y personal (unas 180–250 palabras) para presentar estas obras. No inventes datos. Conserva la voz de la artista y usa los ejemplos solo como referencia de tono."
  );
  const [freeText, setFreeText] = useState("");
  const [responseLanguage, setResponseLanguage] = useState<"es" | "en" | "de">(
    "es"
  );
  const [referenceLinks, setReferenceLinks] = useState<
    Array<{ id: string; url: string; note: string }>
  >([]);
  const [dictationHelpOpen, setDictationHelpOpen] = useState(false);
  const examples = useMemo(
    () => (inventory.textGeneratorExamples ?? []).map(normalizeTextExample),
    [inventory.textGeneratorExamples]
  );
  const [selectedExampleIds, setSelectedExampleIds] = useState<string[]>([]);
  const [selectedSeriesTextKeys, setSelectedSeriesTextKeys] = useState<string[]>(
    []
  );
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const [expandedTextKey, setExpandedTextKey] = useState<string | null>(null);
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [showOtherSeries, setShowOtherSeries] = useState(false);
  const [examplePickerOpen, setExamplePickerOpen] = useState(false);
  const [copying, setCopying] = useState<null | "text" | "images" | "folder">(
    null
  );
  const [photos, setPhotos] = useState<
    Record<string, { dataUrl: string; sourcePath: string }>
  >({});
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const autoSeriesKeysRef = useRef<Set<string>>(new Set());

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
  );
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
  useEffect(() => {
    const linkedKeys = seriesForPrompt.linked.flatMap((series) =>
      (series.texts ?? []).map((text) => seriesTextKey(series.id, text.id))
    );
    const available = new Set(
      [...seriesForPrompt.linked, ...seriesForPrompt.other].flatMap((series) =>
        (series.texts ?? []).map((text) => seriesTextKey(series.id, text.id))
      )
    );
    const fresh = linkedKeys.filter((key) => !autoSeriesKeysRef.current.has(key));
    for (const key of linkedKeys) autoSeriesKeysRef.current.add(key);
    setSelectedSeriesTextKeys((current) => {
      const kept = current.filter((key) => available.has(key));
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

  const generatedText = useMemo(() => {
    const blocks: string[] = [
      "SYSTEM",
      systemPrompt.trim() || DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT,
      "ENCARGO",
      instruction.trim() || "Redacta un primer borrador usando solo estos datos."
    ];

    if (freeText.trim()) {
      blocks.push("NOTAS LIBRES DE LA ARTISTA", freeText.trim());
    }

    if (selectedArtworks.length > 0) {
      blocks.push(
        "OBRAS SELECCIONADAS",
        "Las fotos de estas obras se adjuntan en el mismo chat, justo después de este texto. Úsalas como referencia visual.",
        selectedArtworks
          .map((artwork, index) => {
            const lines = [
              `${index + 1}. ${artwork.title}`,
              `Serie: ${artwork.series || "sin serie"}`,
              `Técnica / tipo: ${labelFor(
                inventory,
                "artworkType",
                artwork.type
              )}`,
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
    freeText,
    selectedArtworks,
    selectedSeriesTextKeys,
    pickedExamples,
    referenceLinks,
    inventory,
    responseLanguageLine
  ]);

  /**
   * Chromium's Web Speech API needs Google's cloud recogniser, and Electron
   * ships without that key, so it always fails. macOS dictation types straight
   * into whichever field has focus, so we put the cursor there and explain it.
   */
  function startSystemDictation() {
    const field = notesRef.current;
    if (field) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
    setDictationHelpOpen(true);
  }

  function addReferenceLink() {
    setReferenceLinks((current) => [
      ...current,
      { id: `link-${Date.now()}`, url: "", note: "" }
    ]);
  }

  function toggleSeriesText(key: string) {
    setSelectedSeriesTextKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  async function saveSystemPrompt() {
    setSystemPromptSaving(true);
    try {
      const next =
        systemPrompt.trim() || DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT;
      const data = await requireApi("saveSettings")({
        ...inventory.settings,
        textGeneratorSystemPrompt: next
      });
      setInventory(data);
      setSystemPrompt(
        data.settings.textGeneratorSystemPrompt?.trim() ||
          DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT
      );
      onToast("Instrucciones fijas guardadas.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar las instrucciones."
      );
    } finally {
      setSystemPromptSaving(false);
    }
  }

  async function copyText() {
    const hasSomething =
      selectedArtworks.length > 0 ||
      freeText.trim() ||
      selectedExampleIds.length > 0 ||
      selectedSeriesTextKeys.length > 0 ||
      referenceLinks.some((link) => link.url.trim());
    if (!hasSomething) {
      onError("Añade al menos una obra, una nota, un enlace, un texto de serie o un ejemplo.");
      return;
    }
    setCopying("text");
    try {
      await copyTextToClipboard(generatedText);
      onToast("Texto copiado. Pégalo en ChatGPT con ⌘V.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "No se pudo copiar. Selecciona el texto a la derecha y cópialo con ⌘C."
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
      onError(
        "La app necesita reiniciarse para arrastrar las fotos. Cierra la ventana y vuelve a abrirla."
      );
      return;
    }
    api(photoFiles());
  }

  async function openPhotoFolder() {
    if (artworksWithPhoto.length === 0) {
      onError("Ninguna de las obras elegidas tiene foto principal.");
      return;
    }
    setCopying("folder");
    try {
      const { count } = await requireApi("openPhotoFolder")(photoFiles());
      onToast(
        `${count} foto${count === 1 ? "" : "s"} en la carpeta «Fotos para el chat». Arrástralas al chat desde ahí.`
      );
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "No se pudo abrir la carpeta."
      );
    } finally {
      setCopying(null);
    }
  }

  async function copyPhotos() {
    if (artworksWithPhoto.length === 0) {
      onError("Ninguna de las obras elegidas tiene foto principal.");
      return;
    }
    setCopying("images");
    try {
      const { count } = await requireApi("writeClipboardImageFiles")(
        photoFiles()
      );
      if (count === 0) throw new Error("No se pudo leer ninguna de las fotos.");
      onToast(
        `${count} foto${count === 1 ? "" : "s"} copiada${
          count === 1 ? "" : "s"
        }. Pega en el chat con ⌘V para adjuntarla${count === 1 ? "" : "s"}.`
      );
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "No se pudieron copiar las fotos."
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
          onClick={() =>
            setExpandedSeriesId(expanded ? null : series.id)
          }
        >
          <span className="textgen-series-toggle-main">
            <strong>{series.name}</strong>
            <span className="muted small-note">
              {linked ? "de las obras elegidas" : "otra serie"}
              {" · "}
              {texts.length === 0
                ? "sin textos"
                : `${texts.length} texto${texts.length === 1 ? "" : "s"}`}
              {selectedCount > 0 ? ` · ${selectedCount} marcado${selectedCount === 1 ? "" : "s"}` : ""}
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
                Esta serie aún no tiene textos. Añádelos en la pestaña Series.
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
                            onChange={() => toggleSeriesText(key)}
                          />
                          <span>
                            <strong>{text.topic || "Sin tema"}</strong>
                          </span>
                        </label>
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() =>
                            setExpandedTextKey(textOpen ? null : key)
                          }
                        >
                          {textOpen ? "Ocultar" : "Ver texto"}
                        </button>
                      </div>
                      {textOpen && (
                        <div className="textgen-series-text-full">
                          {text.body.trim() || (
                            <span className="muted">Sin texto</span>
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
    <section className="list-page text-generator-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Ayuda para redactar</p>
          <h2>Generador de texto</h2>
          <p className="page-lead">
            Reúne obras, textos de series, notas y ejemplos. Después copia el
            texto y las fotos al chat, en dos pasos.
          </p>
        </div>
      </div>

      <div className="textgen-summary">
        <span className="textgen-chip">
          {selectedArtworks.length} obra{selectedArtworks.length === 1 ? "" : "s"}
        </span>
        <span className="textgen-chip">
          {artworksWithPhoto.length} foto{artworksWithPhoto.length === 1 ? "" : "s"}
        </span>
        <span className="textgen-chip">
          {selectedSeriesTextKeys.length} texto
          {selectedSeriesTextKeys.length === 1 ? "" : "s"} de serie
        </span>
        <span className="textgen-chip">
          {pickedExamples.length} ejemplo{pickedExamples.length === 1 ? "" : "s"}
        </span>
        {missingPhotoCount > 0 && (
          <span className="textgen-chip warn">
            {missingPhotoCount} obra{missingPhotoCount === 1 ? "" : "s"} sin foto
          </span>
        )}
      </div>

      <div className="textgen-layout">
        <div className="textgen-config">
          <div className={`textgen-system${systemPromptOpen ? " open" : ""}`}>
            <button
              type="button"
              className="textgen-system-toggle"
              onClick={() => setSystemPromptOpen((open) => !open)}
            >
              <span>Instrucciones fijas (sistema)</span>
              <span className="muted">{systemPromptOpen ? "▲" : "▼"}</span>
            </button>
            {systemPromptOpen && (
              <div className="textgen-system-body">
                <p className="muted small-note">
                  Va al inicio de lo que copias. Queda guardado; no hace falta
                  tocarlo cada vez.
                </p>
                <textarea
                  className="textgen-system-input"
                  rows={5}
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                />
                <div className="row-actions">
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() =>
                      setSystemPrompt(DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT)
                    }
                  >
                    Restaurar pred.
                  </button>
                  <button
                    type="button"
                    className="small"
                    disabled={systemPromptSaving}
                    onClick={() => void saveSystemPrompt()}
                  >
                    {systemPromptSaving ? "…" : "Guardar"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pl-block">
            <div className="pl-block-head">
              <span className="pl-block-title">1. Obras</span>
              <div className="row-actions">
                {selectedArtworks.length > 1 && (
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() =>
                      setSelectedIds((current) =>
                        sortArtworkIdsBySeries(current, inventory)
                      )
                    }
                  >
                    Ordenar por serie
                  </button>
                )}
                <button type="button" onClick={() => setShowPicker(true)}>
                  + Elegir obras
                </button>
              </div>
            </div>
            {selectedArtworks.length === 0 ? (
              <p className="muted small-note">No hay obras seleccionadas.</p>
            ) : (
              <div className="textgen-work-list">
                {selectedArtworks.map((artwork, index) => (
                  <div className="textgen-work" key={artwork.id}>
                    <OrderButtons
                      index={index}
                      total={selectedArtworks.length}
                      onMove={(direction) =>
                        setSelectedIds((current) =>
                          moveIdInList(current, index, direction)
                        )
                      }
                    />
                    <div className="textgen-work-thumb">
                      {photos[artwork.id] ? (
                        <img src={photos[artwork.id].dataUrl} alt="" />
                      ) : (
                        <span className="muted">Sin foto</span>
                      )}
                    </div>
                    <div>
                      <strong>{artwork.title}</strong>
                      <span className="muted">
                        {[
                          artwork.series || "sin serie",
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
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pl-block">
            <div className="pl-block-head">
              <button
                type="button"
                className="textgen-collapse-toggle"
                onClick={() => setSeriesOpen((open) => !open)}
              >
                <span className="pl-block-title">
                  2. Textos de las series
                  {selectedSeriesTextKeys.length > 0
                    ? ` (${selectedSeriesTextKeys.length})`
                    : ""}
                </span>
                <span className="muted">{seriesOpen ? "▲" : "▼"}</span>
              </button>
            </div>
            {!seriesOpen ? (
              <p className="muted small-note">
                Cerrado. Ábrelo para revisar textos completos y marcar cuáles
                van al chat.
              </p>
            ) : seriesForPrompt.linked.length === 0 &&
              seriesForPrompt.other.length === 0 ? (
              <p className="muted small-note">
                Todavía no hay series con metadatos. Créalos en la pestaña Series.
              </p>
            ) : (
              <div className="textgen-series-list">
                <p className="muted small-note">
                  Pulsa una serie para abrirla. Ahí puedes leer el texto entero
                  antes de marcarlo.
                </p>
                {seriesForPrompt.linked.map((series) =>
                  renderSeriesTextPicker(series, true)
                )}
                {selectedSeriesNames
                  .filter(
                    (name) =>
                      !seriesForPrompt.linked.some(
                        (series) =>
                          series.name.toLowerCase() === name.toLowerCase()
                      )
                  )
                  .map((name) => (
                    <div className="textgen-series-block" key={`missing-${name}`}>
                      <strong>{name}</strong>
                      <p className="muted small-note">
                        No hay ficha de serie. Créala en Series para añadir textos.
                      </p>
                    </div>
                  ))}
                {seriesForPrompt.other.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => setShowOtherSeries((value) => !value)}
                    >
                      {showOtherSeries
                        ? "Ocultar otras series"
                        : `Mostrar otras series (${seriesForPrompt.other.length})`}
                    </button>
                    {showOtherSeries &&
                      seriesForPrompt.other.map((series) =>
                        renderSeriesTextPicker(series, false)
                      )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="pl-block">
            <div className="pl-block-head">
              <span className="pl-block-title">3. Encargo y notas</span>
              <button type="button" className="ghost" onClick={startSystemDictation}>
                Dictar con el Mac
              </button>
            </div>
            <label className="field">
              Qué quieres escribir
              <textarea
                rows={3}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
              />
            </label>
            <label className="field">
              Notas libres (escribe, pega o dicta)
              <textarea
                ref={notesRef}
                rows={5}
                value={freeText}
                placeholder="Ideas sueltas. No hace falta que estén ordenadas."
                onChange={(event) => setFreeText(event.target.value)}
              />
            </label>
            {dictationHelpOpen && (
              <div className="textgen-dictation-help">
                <p>
                  <strong>El dictado lo hace tu Mac</strong>, no esta aplicación.
                  El cursor ya está en «Notas libres».
                </p>
                <ol>
                  <li>Pulsa dos veces la tecla 🎤 (o la que tengas configurada).</li>
                  <li>Habla con calma; el texto se escribe solo.</li>
                  <li>Pulsa la tecla otra vez o Intro para terminar.</li>
                </ol>
                <p className="muted small-note">
                  ¿No pasa nada? Actívalo en Ajustes del Sistema → Teclado →
                  Dictado. También está en el menú Edit → Start Dictation.
                </p>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => setDictationHelpOpen(false)}
                >
                  Entendido
                </button>
              </div>
            )}
            <label className="field">
              Idioma de la respuesta
              <select
                value={responseLanguage}
                onChange={(event) =>
                  setResponseLanguage(event.target.value as "es" | "en" | "de")
                }
              >
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </select>
            </label>
            <p className="muted small-note">
              El texto copiado pedirá a ChatGPT que responda en este idioma.
            </p>
            <div className="pl-block-head" style={{ marginTop: "0.35rem" }}>
              <span className="pl-block-title" style={{ fontSize: "0.95rem" }}>
                Enlaces de referencia
              </span>
              <button
                type="button"
                className="ghost small"
                onClick={addReferenceLink}
              >
                + Enlace
              </button>
            </div>
            <p className="muted small-note">
              ChatGPT recibirá la instrucción de consultar estas direcciones.
            </p>
            {referenceLinks.length === 0 ? (
              <p className="muted small-note">Ningún enlace todavía.</p>
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
                    <input
                      value={link.note}
                      placeholder="Para qué sirve (opcional)"
                      onChange={(event) =>
                        setReferenceLinks((current) =>
                          current.map((item) =>
                            item.id === link.id
                              ? { ...item, note: event.target.value }
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
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pl-block">
            <div className="pl-block-head">
              <span className="pl-block-title">
                4. Ejemplos de estilo
                {pickedExamples.length > 0 ? ` (${pickedExamples.length})` : ""}
              </span>
              <div className="row-actions">
                <button
                  type="button"
                  className="ghost small"
                  onClick={onOpenExampleLibrary}
                >
                  Abrir biblioteca
                </button>
                <button
                  type="button"
                  onClick={() => setExamplePickerOpen(true)}
                >
                  + Elegir ejemplos
                </button>
              </div>
            </div>
            {examples.length === 0 ? (
              <p className="muted small-note">
                Tu biblioteca está vacía. Guarda ahí los textos que te gusten
                («Abrir biblioteca») y luego elígelos desde aquí.
              </p>
            ) : pickedExamples.length === 0 ? (
              <p className="muted small-note">
                Ningún ejemplo elegido. ChatGPT los usa como referencia de tono,
                nunca los copia.
              </p>
            ) : (
              <div className="textgen-example-list">
                {pickedExamples.map((example) => (
                  <div className="textgen-example" key={example.id}>
                    <div className="textgen-example-head">
                      <strong>{example.topic || "Sin tema"}</strong>
                      <button
                        type="button"
                        className="ghost danger small"
                        onClick={() =>
                          setSelectedExampleIds((current) =>
                            current.filter((id) => id !== example.id)
                          )
                        }
                      >
                        Quitar
                      </button>
                    </div>
                    {example.body.trim() && (
                      <p className="muted small-note textgen-example-preview">
                        {example.body.trim().slice(0, 110)}
                        {example.body.trim().length > 110 ? "…" : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="textgen-preview-pane">
          <div className="textgen-steps">
            <div className="textgen-step">
              <span className="textgen-step-num">1</span>
              <div className="textgen-step-text">
                <strong>Copia el texto</strong>
                <span className="muted small-note">
                  Pégalo en ChatGPT con ⌘V.
                </span>
              </div>
              <button
                type="button"
                className="cuentas-primary"
                disabled={copying !== null}
                onClick={() => void copyText()}
              >
                {copying === "text" ? "…" : "Copiar texto"}
              </button>
            </div>
            <div className="textgen-step">
              <span className="textgen-step-num">2</span>
              <div className="textgen-step-text">
                <strong>Copia las fotos</strong>
                <span className="muted small-note">
                  {artworksWithPhoto.length === 0
                    ? "Ninguna obra elegida tiene foto principal."
                    : artworksWithPhoto.length === 1
                      ? "1 foto. Vuelve al mismo chat y pega otra vez con ⌘V."
                      : `${artworksWithPhoto.length} fotos. Al pegar solo entra una; para llevarlas todas usa el recuadro de abajo.`}
                </span>
              </div>
              <button
                type="button"
                className="cuentas-primary"
                disabled={copying !== null || artworksWithPhoto.length === 0}
                onClick={() => void copyPhotos()}
              >
                {copying === "images" ? "…" : "Copiar fotos"}
              </button>
            </div>
            <div className="textgen-steps-note">
              <p className="muted small-note">
                El Mac solo guarda una cosa a la vez en el portapapeles, por eso
                van en dos pasos: primero el texto, después las fotos.
              </p>
              {artworksWithPhoto.length > 1 && (
                <div className="textgen-fallback">
                  <p className="muted small-note">
                    Arrastra este recuadro hasta la ventana del chat y se
                    adjuntan las {artworksWithPhoto.length} de una vez.
                  </p>
                  <div
                    className="textgen-drag-tile"
                    draggable
                    onDragStart={(event) => {
                      event.preventDefault();
                      startPhotoDrag();
                    }}
                  >
                    <span aria-hidden>⇧</span>
                    Arrastrar {artworksWithPhoto.length} fotos al chat
                  </div>
                  <button
                    type="button"
                    className="ghost small"
                    disabled={copying !== null}
                    onClick={() => void openPhotoFolder()}
                  >
                    {copying === "folder"
                      ? "…"
                      : "O abrir la carpeta con las fotos"}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="textgen-preview-head">
            <div>
              <span className="pl-block-title">Texto preparado</span>
              <p className="muted small-note">
                Solo incluye lo que hayas marcado a la izquierda.
              </p>
            </div>
          </div>
          <textarea
            className="textgen-output"
            readOnly
            value={generatedText}
            aria-label="Texto preparado para ChatGPT"
          />
        </div>
      </div>

      {showPicker && (
        <ArtworkPickerModal
          inventory={inventory}
          initialIds={selectedIds}
          title="Elegir obras para el generador"
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
  const [picked, setPicked] = useState<string[]>(initialIds);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const list = examples.filter((example) =>
    exampleMatchesSearch(example, search)
  );

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>Elegir ejemplos de estilo</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-toolbar">
          <input
            className="search-input grow"
            placeholder="Buscar por tema o por palabras del texto..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
          <button type="button" className="ghost small" onClick={onOpenLibrary}>
            Abrir biblioteca
          </button>
        </div>
        <div className="modal-body modal-pick-list">
          {examples.length === 0 ? (
            <p className="muted">
              Todavía no hay ejemplos guardados. Añádelos en la Biblioteca de
              ejemplos.
            </p>
          ) : list.length === 0 ? (
            <p className="muted">Ningún ejemplo coincide con esa búsqueda.</p>
          ) : (
            list.map((example) => {
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
                      {example.topic || "Sin tema"}
                    </span>
                    <span className="muted picker-meta">
                      {countWords(body)} palabras
                    </span>
                  </label>
                  <p className="muted small-note example-pick-preview">
                    {open ? body : `${body.slice(0, 160)}${body.length > 160 ? "…" : ""}`}
                  </p>
                  {body.length > 160 && (
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => setOpenId(open ? null : example.id)}
                    >
                      {open ? "Ocultar" : "Ver entero"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={() => onConfirm(picked)}>
            Usar {picked.length} ejemplo{picked.length === 1 ? "" : "s"}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
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
  const [editing, setEditing] = useState<Application | null | "new">(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ApplicationKind>("all");
  const [yearFilter, setYearFilter] = useState<"all" | number>("all");
  const thisYear = new Date().getFullYear();

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
              <p className="eyebrow">Presentaciones</p>
              <h2>Solicitudes</h2>
              <p className="page-lead">
                Concursos, becas y residencias. Las más recientes arriba.
              </p>
            </div>
            <button
              type="button"
              className="cuentas-primary"
              onClick={() => setEditing("new")}
            >
              + Nueva solicitud
            </button>
          </div>

          <div className="list-toolbar">
            <input
              className="search-input grow"
              placeholder="Buscar por título, organización…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="segmented small">
              {(
                [
                  ["all", "Todas"],
                  ["concurso", "Concursos"],
                  ["beca", "Becas"],
                  ["residencia", "Residencias"],
                  ["otro", "Otras"]
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
              Año
              <select
                value={yearFilter === "all" ? "all" : String(yearFilter)}
                onChange={(event) => {
                  const value = event.target.value;
                  setYearFilter(value === "all" ? "all" : Number(value));
                }}
              >
                <option value="all">Todos</option>
                <option value={String(thisYear)}>Este año ({thisYear})</option>
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
                Limpiar
              </button>
            )}
            <span className="count-pill">{list.length}</span>
          </div>

          {allApps.length === 0 ? (
            <div className="empty-friendly">
              <p>Todavía no hay solicitudes.</p>
              <button type="button" onClick={() => setEditing("new")}>
                Crear la primera
              </button>
            </div>
          ) : list.length === 0 ? (
            <p className="muted">Ninguna solicitud con estos filtros.</p>
          ) : (
            <div className="app-line-list">
              <div className="app-line-head">
                <span>Tipo</span>
                <span>Solicitud</span>
                <span>Organización</span>
                <span>Fecha</span>
                <span>Obras</span>
                <span />
              </div>
              {list.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="app-line-row"
                  onClick={() => setEditing(app)}
                >
                  <span className="expense-cat-pill">
                    {applicationKindLabel(app.kind)}
                  </span>
                  <strong>{app.title}</strong>
                  <span>{app.organization || "—"}</span>
                  <span>
                    {app.deadline ||
                      (app.createdAt
                        ? app.createdAt.slice(0, 10).split("-").reverse().join("-")
                        : "—")}
                  </span>
                  <span className="pricing-line-value">{app.artworkIds.length}</span>
                  <span className="pricing-line-chevron" aria-hidden>
                    ›
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
  const initialLang: PriceLang =
    application?.language === "en" || application?.language === "de"
      ? application.language
      : "es";
  const defaults = APP_HEADING_DEFAULTS[initialLang];

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
          headerArtistName: (() => {
            try {
              return localStorage.getItem("solicitud-artist-name") || "";
            } catch {
              return "";
            }
          })(),
          headerCompetition: "Concurso",
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
      const defs = APP_HEADING_DEFAULTS[next];
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
        heading: APP_HEADING_DEFAULTS[language].aboutWorks,
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
      onError("Pon un nombre a la solicitud (para tu lista).");
      return false;
    }
    setBusy(true);
    try {
      const data = await requireApi("saveApplication")(form);
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
      onToast("Solicitud guardada.");
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo guardar.");
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
    const defs = APP_HEADING_DEFAULTS[language];
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
      const path = await requireApi("generateApplicationPdf")(buildPayload());
      if (path) onToast("PDF generado.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo generar.");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="application-editor">
      <div className="form-head">
        <div>
          <p className="eyebrow">Solicitud</p>
          <h2>{form.title || "Nueva solicitud"}</h2>
        </div>
        <div className="form-head-actions">
          <button type="button" className="ghost" onClick={onBack}>
            Volver
          </button>
          <button
            type="button"
            className="ghost"
            disabled={exportBusy}
            onClick={() => void exportPdf()}
          >
            {exportBusy ? "…" : "Generar PDF"}
          </button>
          <button type="button" disabled={busy} onClick={() => void persist()}>
            {busy ? "Guardando…" : "Guardar"}
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
            title="1. Ficha (solo para ti)"
            open={Boolean(openBlocks.ficha)}
            onToggle={() => toggleBlock("ficha")}
            summary={form.title.trim() || "Nombre, tipo, fecha…"}
          >
            <div className="form-grid two">
              <label>
                Nombre en la lista
                <input
                  value={form.title}
                  placeholder="Ej. Beca Berlin 2026 · borrador"
                  onChange={(event) => set("title", event.target.value)}
                />
              </label>
              <label>
                Tipo
                <select
                  value={form.kind}
                  onChange={(event) =>
                    set("kind", event.target.value as ApplicationKind)
                  }
                >
                  <option value="concurso">Concurso</option>
                  <option value="beca">Beca / stipendio</option>
                  <option value="residencia">Residencia</option>
                  <option value="otro">Otro</option>
                </select>
              </label>
              <label>
                Fecha límite
                <DateField
                  value={form.deadline ?? ""}
                  onChange={(value) => set("deadline", value)}
                />
              </label>
              <label>
                Idioma del PDF
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
            </div>
          </AppFormBlock>

          <AppFormBlock
            title="2. Pie del PDF"
            open={Boolean(openBlocks.pie)}
            onToggle={() => toggleBlock("pie")}
            summary={
              [form.headerArtistName, form.headerCompetition]
                .map((s) => s?.trim())
                .filter(Boolean)
                .join(" · ") || "Artista y concurso al pie"
            }
          >
            <p className="muted small-note">
              Nombre a la izquierda, concurso a la derecha y número de página en
              el centro, abajo en cada página. El nombre se recuerda para las
              siguientes solicitudes.
            </p>
            <div className="form-grid two">
              <label>
                Nombre de la artista
                <input
                  value={form.headerArtistName ?? ""}
                  placeholder="Tu nombre completo"
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
                Concurso / convocatoria
                <input
                  value={form.headerCompetition ?? ""}
                  placeholder="Ej. Concurso XYZ 2026"
                  onChange={(event) => set("headerCompetition", event.target.value)}
                />
              </label>
            </div>
          </AppFormBlock>

          <AppFormBlock
            title="3. Portada del PDF"
            open={Boolean(openBlocks.portada)}
            onToggle={() => toggleBlock("portada")}
            summary={
              (form.documentTitle || "").trim() ||
              "Título y líneas de la portada"
            }
          >
            <p className="muted small-note">
              Cada bloque es una línea de la portada. Fuente y tamaño se eligen
              debajo del texto. El índice se genera solo.
            </p>
            <div className="cover-portada-lines">
              <CoverLineEditor
                label="Línea por encima"
                hint="Arriba del título"
                value={form.coverSubtitle ?? ""}
                placeholder="Ej. Convocatoria 2026"
                style={form.coverStyles?.above}
                defaultSize={10}
                defaultBold
                onValueChange={(value) => set("coverSubtitle", value)}
                onStyleChange={(patch) => setCoverLineStyle("above", patch)}
              />
              <CoverLineEditor
                label="Título"
                hint="Principal"
                value={form.documentTitle ?? ""}
                placeholder="Título que verá el jurado"
                style={form.coverStyles?.title}
                defaultSize={28}
                defaultBold
                onValueChange={(value) => set("documentTitle", value)}
                onStyleChange={(patch) => setCoverLineStyle("title", patch)}
              />
              <CoverLineEditor
                label="Línea por debajo"
                hint="Bajo el título"
                value={form.organization ?? ""}
                placeholder="Organización o lugar"
                style={form.coverStyles?.below}
                defaultSize={11.5}
                onValueChange={(value) => set("organization", value)}
                onStyleChange={(patch) => setCoverLineStyle("below", patch)}
              />
              <CoverLineEditor
                label="Segunda línea"
                hint="Debajo de todo"
                value={form.coverNote ?? ""}
                placeholder="Nota extra, contacto…"
                multiline
                style={form.coverStyles?.second}
                defaultSize={10.5}
                onValueChange={(value) => set("coverNote", value)}
                onStyleChange={(patch) => setCoverLineStyle("second", patch)}
              />
            </div>
          </AppFormBlock>

          <AppFormBlock
            title="4. Obras (orden = PDF)"
            open={Boolean(openBlocks.obras)}
            onToggle={() => toggleBlock("obras")}
            summary={
              selectedArts.length
                ? `${selectedArts.length} obra${selectedArts.length === 1 ? "" : "s"}`
                : "Elegir obras del PDF"
            }
            actions={
              <div className="row-actions">
                {(form.tocWorksMode || "list") === "bySeries" &&
                  selectedArts.length > 1 && (
                    <button
                      type="button"
                      className="ghost small"
                      title="Ordena los bloques de serie de A a Z. No cambia el orden de las obras dentro de cada serie."
                      onClick={() =>
                        set(
                          "artworkIds",
                          sortArtworkIdsBySeries(
                            form.artworkIds ?? [],
                            inventory,
                            APP_HEADING_DEFAULTS[language].noSeries
                          )
                        )
                      }
                    >
                      Series A→Z
                    </button>
                  )}
                <button type="button" className="small" onClick={() => setShowPicker(true)}>
                  + Elegir obras
                </button>
              </div>
            }
          >
            <label className="field">
              Etiqueta del grupo de obras
              <input
                value={form.headingWorks ?? ""}
                placeholder={APP_HEADING_DEFAULTS[language].works}
                onChange={(event) => set("headingWorks", event.target.value)}
              />
            </label>
            <label className="field">
              Índice de obras (portada)
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
                          APP_HEADING_DEFAULTS[language].noSeries
                        )
                      )
                    );
                  }
                }}
              >
                <option value="list">Una línea por obra</option>
                <option value="bySeries">Agrupar por serie (N cuadros)</option>
                <option value="worksOnly">
                  Solo «{form.headingWorks || APP_HEADING_DEFAULTS[language].works}»
                  → primera página
                </option>
              </select>
            </label>
            {(form.tocWorksMode || "list") === "bySeries" ? (
              <>
                <p className="muted small-note">
                  Orden del PDF: primero las series (bloques), luego las obras
                  dentro de cada serie.
                </p>
                <ApplicationSeriesOrder
                  artworkIds={form.artworkIds ?? []}
                  inventory={inventory}
                  noSeriesLabel={APP_HEADING_DEFAULTS[language].noSeries}
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
                  Orden manual con ↑ ↓. Puedes mezclar series como quieras; así
                  salen en el PDF.
                </p>
                {selectedArts.length === 0 ? (
                  <p className="muted small-note">Todavía no has elegido obras.</p>
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
                              APP_HEADING_DEFAULTS[language].noSeries}
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
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </AppFormBlock>

          <AppFormBlock
            title="5. Textos"
            open={Boolean(openBlocks.textos)}
            onToggle={() => toggleBlock("textos")}
            summary={
              sections.length
                ? `${sections.length} sección${sections.length === 1 ? "" : "es"}`
                : "Secciones de texto del PDF"
            }
            actions={
              <button type="button" className="ghost small" onClick={addSection}>
                + Añadir sección
              </button>
            }
          >
            {sections.length === 0 ? (
              <div className="empty-friendly">
                <p>Añade secciones (encabezado + texto).</p>
                <button type="button" onClick={addSection}>
                  + Primera sección
                </button>
              </div>
            ) : (
              <div className="app-section-list">
                <div className="app-section-heading-format">
                  <div className="app-section-heading-format-head">
                    <span className="cover-line-label">
                      Formato de todos los encabezados
                    </span>
                    <span className="cover-line-hint">
                      Se aplica a cada sección a la vez
                    </span>
                  </div>
                  <SharedTextFormatTools
                    ariaLabel="encabezados"
                    style={form.sectionHeadingStyle}
                    defaults={{ font: "Georgia", sizePt: 18, bold: true, italic: false }}
                    onChange={setSectionHeadingStyle}
                  />
                </div>
                <div className="app-section-heading-format">
                  <div className="app-section-heading-format-head">
                    <span className="cover-line-label">
                      Formato de todos los textos
                    </span>
                    <span className="cover-line-hint">
                      Base de todos los cuerpos · N/I por letra sigue en el editor
                    </span>
                  </div>
                  <SharedTextFormatTools
                    ariaLabel="textos"
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
                          {section.heading || `Sección ${index + 1}`}
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
                            Encabezado
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
                            <span>Texto</span>
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
                            Quitar sección
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
            title="Tipografías y marco"
            open={Boolean(openBlocks.tipografia)}
            onToggle={() => toggleBlock("tipografia")}
            summary={`${fontTitle} · ${fontBody}`}
          >
            <div className="form-row">
              <label className="field">
                Fichas de obra (título y datos)
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
                Cuerpo de texto
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
                Sin marco gris alrededor de la pintura
              </label>
            </div>
            {!hideFrame ? (
              <>
                <div className="form-row">
                  <label className="field">
                    Color del marco
                    <input
                      type="color"
                      className="color-chip"
                      value={frameBorderColor}
                      onChange={(event) => setFrameBorderColor(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Grosor del marco
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
                  Espacio entre marco y pintura
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
                Espacio alrededor de la pintura
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
            <p className="muted small-note">
              Cuadrado al 95% del ancho, centrado. La pintura queda inscrita.
              Grosor y espacio crecen hacia dentro (la pintura se hace más
              pequeña).
            </p>
          </AppFormBlock>
        </div>

        <div
          className="app-split-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Cambiar tamaño de la vista previa"
          title="Arrastra para dar más o menos espacio a la vista previa"
          onPointerDown={onSplitPointerDown}
        />

        <div className="pl-preview-pane">
          <div className="app-preview-toolbar">
            <span className="pl-fp-label muted">
              Vista previa del PDF ({selectedArts.length} obras)
            </span>
            <div className="app-preview-zoom">
              <button
                type="button"
                className="ghost small app-zoom-btn"
                aria-label="Alejar"
                disabled={previewZoom <= 0.4}
                onClick={() => nudgePreviewZoom(-0.1)}
              >
                −
              </button>
              <button
                type="button"
                className="ghost small app-zoom-pct"
                title="Restablecer zoom"
                onClick={() => setPreviewZoom(1)}
              >
                {Math.round(previewZoom * 100)}%
              </button>
              <button
                type="button"
                className="ghost small app-zoom-btn"
                aria-label="Acercar"
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
            title="Vista previa de la solicitud"
          />
        </div>
      </div>

      {showPicker && (
        <ArtworkPickerModal
          inventory={inventory}
          excludeIds={[]}
          initialIds={form.artworkIds ?? []}
          title="Elegir obras para la solicitud"
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
                      APP_HEADING_DEFAULTS[language].noSeries
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
  preset,
  onError,
  onToast
}: {
  inventory: InventoryData;
  preset: PriceListPreset | null;
  onError: (message: string) => void;
  onToast: (message: string) => void;
}) {
  const [mode, setMode] = useState<"free" | "exhibition">(
    preset?.exhibitionId ? "exhibition" : "free"
  );
  const [exhibitionId, setExhibitionId] = useState(preset?.exhibitionId ?? "");
  const [freeSelected, setFreeSelected] = useState<string[]>(preset?.artworkIds ?? []);
  const [exhibitionOrder, setExhibitionOrder] = useState<string[]>([]);
  const [header, setHeader] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [leftHeader, setLeftHeader] = useState("");
  const [rightHeader, setRightHeader] = useState("");
  const [showPrice, setShowPrice] = useState(true);
  const [imagesPerPage, setImagesPerPage] = useState(4);
  const [language, setLanguage] = useState<PriceLang>("es");
  const [fontHeader, setFontHeader] = useState("Georgia");
  const [fontSubtitle, setFontSubtitle] = useState("Georgia");
  const [fontBody, setFontBody] = useState("Georgia");
  const [headerBold, setHeaderBold] = useState(true);
  const [headerItalic, setHeaderItalic] = useState(false);
  const [headerColor, setHeaderColor] = useState("#1c1c1c");
  const [subtitleItalic, setSubtitleItalic] = useState(true);
  const [subtitleColor, setSubtitleColor] = useState("#555555");
  const [priceBold, setPriceBold] = useState(true);
  const [imageGap, setImageGap] = useState(16);
  const [frameBorderColor, setFrameBorderColor] = useState("#e4e4e4");
  const [customImages, setCustomImages] = useState<Record<string, string>>({});
  const [previewImages, setPreviewImages] = useState<Record<string, string>>({});
  const [showFreePicker, setShowFreePicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const artworkById = useMemo(
    () => new Map(inventory.artworks.map((art) => [art.id, art])),
    [inventory.artworks]
  );

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

  useEffect(() => {
    if (mode !== "exhibition") return;
    setExhibitionOrder((prev) => {
      const keep = prev.filter((id) => exhibitionArtworkIds.includes(id));
      const add = exhibitionArtworkIds.filter((id) => !keep.includes(id));
      return [...keep, ...add];
    });
  }, [mode, exhibitionArtworkIds.join(",")]);

  const selectedIds = mode === "exhibition" ? exhibitionOrder : freeSelected;

  function setSelectedIds(next: string[]) {
    if (mode === "exhibition") setExhibitionOrder(next);
    else setFreeSelected(next);
  }

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, exhibitionId]);

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

  // Mirrors rowImageHeight() in the PDF generator so the preview shows the
  // exact frame size the PDF will use.
  function previewFrameSize(perPage: number): number {
    const per = (980 - 110) / Math.max(1, perPage);
    return Math.max(60, Math.min(340, Math.round(per - 30)));
  }

  async function pickImage(id: string) {
    const dataUrl = await window.inventoryApi.pickImageDataUrl();
    if (dataUrl) setCustomImages((current) => ({ ...current, [id]: dataUrl }));
  }

  async function generate() {
    if (selectedIds.length === 0) {
      onError("Selecciona al menos una obra para la lista.");
      return;
    }
    setBusy(true);
    try {
      const rows = [];
      for (const id of selectedIds) {
        const art = artworkById.get(id);
        if (!art) continue;
        let imageDataUrl = customImages[id];
        if (!imageDataUrl) {
          const image = mainImageFor(art, inventory);
          if (image?.absolutePath) {
            imageDataUrl = await window.inventoryApi.imageToDataUrl(image.absolutePath);
          }
        }
        rows.push({
          title: art.title,
          series: art.series ?? "",
          material: artTypeLabel(inventory, art.type, language),
          size: formatSize(art),
          year: art.yearMade ?? "",
          price: formatEuro(listedPriceFor(id)),
          imageDataUrl,
          widthCm: toCm(art.width, art.unit),
          heightCm: toCm(art.height, art.unit)
        });
      }
      const savedPath = await window.inventoryApi.generatePriceList({
        header: header || "Folleto de obras",
        subtitle,
        leftHeader,
        rightHeader,
        showPrice,
        priceBold,
        imagesPerPage,
        imageGap,
        frameBorderColor,
        fonts: { header: fontHeader, subtitle: fontSubtitle, body: fontBody },
        headerStyle: { bold: headerBold, italic: headerItalic, color: headerColor },
        subtitleStyle: { italic: subtitleItalic, color: subtitleColor },
        rows
      });
      if (savedPath) {
        onError("");
        onToast("Lista generada (PDF).");
      }
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "No se pudo generar la lista.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="list-page pricelist-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Documentos</p>
          <h2>Generar folleto de obras</h2>
        </div>
        <div className="form-head-actions">
          <button disabled={busy} onClick={() => void generate()}>
            Generar PDF
          </button>
        </div>
      </div>

      <div className="pl-layout">
        <div className="pl-config">
          <div className="segmented">
            <button
              className={`seg ${mode === "free" ? "active" : ""}`}
              onClick={() => setMode("free")}
            >
              Selección libre
            </button>
            <button
              className={`seg ${mode === "exhibition" ? "active" : ""}`}
              onClick={() => setMode("exhibition")}
            >
              De una exposición
            </button>
          </div>

          {mode === "exhibition" && (
            <label className="field">
              Exposición
              <select
                value={exhibitionId}
                onChange={(event) => setExhibitionId(event.target.value)}
              >
                <option value="">— Seleccionar —</option>
                {inventory.exhibitions.map((exh) => (
                  <option key={exh.id} value={exh.id}>
                    {exh.title}
                    {exh.startDate ? ` · ${exh.startDate}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === "free" && (
            <div className="pl-block">
              <div className="pl-block-head">
                <span className="pl-block-title">
                  Obras elegidas ({freeSelected.length})
                </span>
                <button type="button" onClick={() => setShowFreePicker(true)}>
                  + Añadir obras
                </button>
              </div>
              {freeSelected.length === 0 && (
                <p className="muted small-note">
                  Usa «Añadir obras» para elegirlas en una ventana con búsqueda.
                </p>
              )}
            </div>
          )}

          {selectedIds.length > 0 && (
            <div className="pl-block">
              <span className="pl-block-title">
                Imagen y orden de cada obra
              </span>
              <p className="muted small-note">
                Usa ↑ ↓ para elegir el orden del folleto. Los precios se toman de
                la exposición (o del precio de venta si no hay exposición);
                cámbialos allí si hace falta.
              </p>
              <div className="pl-row-list">
                {selectedIds.map((id, index) => {
                  const art = artworkById.get(id);
                  if (!art) return null;
                  return (
                    <div className="pl-row-item" key={id}>
                      <OrderButtons
                        index={index}
                        total={selectedIds.length}
                        onMove={(dir) =>
                          setSelectedIds(moveIdInList(selectedIds, index, dir))
                        }
                      />
                      <span className="pl-row-title" title={art.title}>
                        {art.title}
                      </span>
                      <button className="ghost small" onClick={() => pickImage(id)}>
                        {customImages[id] ? "Cambiar imagen" : "Otra imagen"}
                      </button>
                      {mode === "free" && (
                        <button
                          type="button"
                          className="link-button remove-link"
                          onClick={() =>
                            setFreeSelected((current) =>
                              current.filter((item) => item !== id)
                            )
                          }
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <label className="field">
            Encabezado (título del documento)
            <input
              value={header}
              placeholder="ej. Galería X · Obra reciente"
              onChange={(event) => setHeader(event.target.value)}
            />
          </label>
          <label className="field">
            Subtítulo (opcional)
            <input
              value={subtitle}
              placeholder="ej. Madrid · Marzo 2026"
              onChange={(event) => setSubtitle(event.target.value)}
            />
          </label>

          <div className="form-row">
            <label className="field">
              Texto a la izquierda (sala y ciudad)
              <input
                value={leftHeader}
                placeholder="ej. Sala XYZ, Heidelberg"
                onChange={(event) => setLeftHeader(event.target.value)}
              />
            </label>
            <label className="field">
              Texto a la derecha (fechas)
              <input
                value={rightHeader}
                placeholder="ej. del 20/04/2000 al 31/05/2020"
                onChange={(event) => setRightHeader(event.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label className="field">
              Idioma del «tipo de arte»
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as PriceLang)}
              >
                {PRICE_LANGS.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Imágenes por página
              <select
                value={imagesPerPage}
                onChange={(event) => setImagesPerPage(Number(event.target.value))}
              >
                {[2, 3, 4, 5, 6].map((value) => (
                  <option key={value} value={value}>
                    {value} por página
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="checkline">
            <input
              type="checkbox"
              checked={showPrice}
              onChange={(event) => setShowPrice(event.target.checked)}
            />
            Mostrar precio (en euros)
          </label>
          {showPrice && (
            <label className="checkline">
              <input
                type="checkbox"
                checked={priceBold}
                onChange={(event) => setPriceBold(event.target.checked)}
              />
              Precio en negrita
            </label>
          )}

          <div className="form-row">
            <label className="field">
              Espacio entre imagen y texto
              <div className="range-inline">
                <input
                  type="range"
                  min={0}
                  max={120}
                  value={imageGap}
                  onChange={(event) => setImageGap(Number(event.target.value))}
                />
                <span className="range-value">{imageGap}px</span>
              </div>
            </label>
            <label className="field">
              Color del borde del marco
              <input
                type="color"
                className="color-chip"
                value={frameBorderColor}
                onChange={(event) => setFrameBorderColor(event.target.value)}
              />
            </label>
          </div>

          <div className="pl-style-block">
            <span className="pl-block-title">Estilo del título</span>
            <div className="pl-style-row">
              <select
                value={fontHeader}
                onChange={(event) => setFontHeader(event.target.value)}
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
                onClick={() => setHeaderBold((value) => !value)}
              >
                <strong>N</strong>
              </button>
              <button
                type="button"
                className={`toggle-chip ${headerItalic ? "on" : ""}`}
                onClick={() => setHeaderItalic((value) => !value)}
              >
                <em>C</em>
              </button>
              <input
                type="color"
                className="color-chip"
                value={headerColor}
                onChange={(event) => setHeaderColor(event.target.value)}
              />
            </div>
          </div>

          <div className="pl-style-block">
            <span className="pl-block-title">Estilo del subtítulo</span>
            <div className="pl-style-row">
              <select
                value={fontSubtitle}
                onChange={(event) => setFontSubtitle(event.target.value)}
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
                onClick={() => setSubtitleItalic((value) => !value)}
              >
                <em>C</em>
              </button>
              <input
                type="color"
                className="color-chip"
                value={subtitleColor}
                onChange={(event) => setSubtitleColor(event.target.value)}
              />
            </div>
          </div>

          <label className="field">
            Tipografía del texto de las obras
            <select value={fontBody} onChange={(event) => setFontBody(event.target.value)}>
              {PRICELIST_FONTS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="pl-preview-pane">
          <span className="pl-fp-label muted">
            Vista previa · así saldrá el PDF ({selectedIds.length} obras)
          </span>
          <div className="pl-paper">
            <div className="pl-sheet" style={{ fontFamily: fontBody }}>
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
                    ? "Selecciona una exposición con obras."
                    : "Añade obras para verlas aquí."}
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
                      {pageBreakHere && (
                        <div className="pl-page-break">
                          <span>Página {Math.floor(index / imagesPerPage) + 1}</span>
                        </div>
                      )}
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
                            <span className="pl-sheet-noimg">Sin imagen</span>
                          )}
                        </div>
                      </div>
                      <div
                        className="pl-sheet-info"
                        style={{ paddingLeft: `${imageGap}px` }}
                      >
                        <div className="pl-sheet-info-title">{art.title}</div>
                        {art.series && (
                          <div className="pl-sheet-meta">{art.series}</div>
                        )}
                        <div className="pl-sheet-meta">
                          {artTypeLabel(inventory, art.type, language)}
                        </div>
                        <div className="pl-sheet-meta">{formatSize(art)}</div>
                        {art.yearMade && (
                          <div className="pl-sheet-meta">{art.yearMade}</div>
                        )}
                        {showPrice && (
                          <div
                            className="pl-sheet-price"
                            style={{ fontWeight: priceBold ? 700 : 400 }}
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
          title="Añadir obras a la lista"
          onConfirm={(ids) => {
            setFreeSelected((current) => [...current, ...ids]);
            setShowFreePicker(false);
          }}
          onClose={() => setShowFreePicker(false)}
        />
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
        aria-label={`Fuente de ${ariaLabel}`}
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
          aria-label={`Tamaño de ${ariaLabel}`}
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
        aria-label={`Estilo de ${ariaLabel}`}
      >
        <button
          type="button"
          className={`toggle-chip${boldOn ? " on" : ""}`}
          title="Negrita (base)"
          onClick={() => onChange({ bold: !boldOn })}
        >
          N
        </button>
        <button
          type="button"
          className={`toggle-chip${italicOn ? " on" : ""}`}
          title="Cursiva (base)"
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
          aria-label={`Fuente · ${label}`}
          value={style?.font ?? ""}
          onChange={(event) =>
            onStyleChange({
              font: event.target.value || undefined,
              sizePt: style?.sizePt ?? defaultSize
            })
          }
        >
          <option value="">Fuente pred.</option>
          {PRICELIST_FONTS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
        <label className="cover-line-size">
          <select
            aria-label={`Tamaño · ${label}`}
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
        <div className="cover-line-style-toggles" role="group" aria-label="Estilo">
          <button
            type="button"
            className={`toggle-chip${boldOn ? " on" : ""}`}
            title="Negrita"
            onClick={() => onStyleChange({ bold: !boldOn })}
          >
            N
          </button>
          <button
            type="button"
            className={`toggle-chip${italicOn ? " on" : ""}`}
            title="Cursiva"
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
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>
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
  inventory: InventoryData
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
        labelFor(inventory, "artworkType", a.type).localeCompare(
          labelFor(inventory, "artworkType", b.type)
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

function lookupOptions(inventory: InventoryData, category: string) {
  const seen = new Set<string>();
  return inventory.lookups.filter((lookup) => {
    if (lookup.category !== category) return false;
    const key = lookup.value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function labelFor(inventory: InventoryData, category: string, value?: string) {
  if (!value) return "";
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

function movementSummary(movement: Movement, inventory: InventoryData): string {
  if (movementKind(movement.type) === "exhibition") {
    const title =
      movement.exhibitionTitle || exhibitionTitle(inventory, movement.exhibitionId);
    return title ? `Exposición · ${title}` : "Exposición";
  }
  return labelFor(inventory, "movementType", movement.type);
}

function movementSubtitle(movement: Movement, inventory: InventoryData): string {
  if (movementKind(movement.type) === "exhibition") {
    return movement.returned
      ? "Devuelta al estudio"
      : movement.keptAtGallery
        ? "Con galería tras exposición"
        : "En exposición";
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
  "artworkType:other",
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
    if (!filePath) {
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
