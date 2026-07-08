import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction
} from "react";
import type {
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
  MovementInput
} from "../main/types/inventory";

type Page =
  | "library"
  | "form"
  | "detail"
  | "contacts"
  | "contactDetail"
  | "exhibitions"
  | "pricelist";

interface PriceListPreset {
  exhibitionId?: string;
  artworkIds?: string[];
}
type FormTab = "info" | "movimientos";
type DetailTab = "info" | "movimientos";

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

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

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
          <NavButton active={page === "library"} onClick={() => guarded(() => goTo("library"))}>
            <span className="nav-dot dot-obras" /> Obras
          </NavButton>
          <NavButton active={page === "form"} onClick={() => guarded(startAdd)}>
            <span className="nav-dot dot-add" /> Añadir obra
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
            <span className="nav-dot dot-price" /> Lista de precios
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
        {toast && <div className="toast">{toast}</div>}
        {message && <div className="notice">{message}</div>}
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
            onEdit={startEdit}
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
            onDeleted={(data) => {
              setInventory(data);
              goBack();
            }}
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
  | "year_desc"
  | "year_asc"
  | "type"
  | "price_desc"
  | "price_asc";

function LibraryPage({
  inventory,
  setInventory,
  onAdd,
  onSelect,
  onEdit
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onAdd: () => void;
  onSelect: (artwork: Artwork) => void;
  onEdit: (artwork: Artwork) => void;
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
              <span>Imagen</span>
              <span>Nombre</span>
              <span>Serie</span>
              <span>Tipo</span>
              <span>Año</span>
              <span>Estado</span>
              <span />
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
                  onEdit={() => onEdit(artwork)}
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
  onSelect,
  onEdit
}: {
  artwork: Artwork;
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const image = mainImageFor(artwork, inventory);
  const imageUrl = useImageDataUrl(image?.absolutePath);
  const overdue = overdueMovement(artwork, inventory);

  return (
    <div className="art-row">
      <button className="thumb" onClick={onSelect}>
        {imageUrl ? <img src={imageUrl} alt={artwork.title} /> : <span>Sin foto</span>}
      </button>
      <button className="link-button title-cell" onClick={onSelect}>
        <strong>{artwork.title}</strong>
        <small>{artwork.id}</small>
      </button>
      <span>{artwork.series || "-"}</span>
      <span>{labelFor(inventory, "artworkType", artwork.type)}</span>
      <span>{artwork.yearMade || "-"}</span>
      <span className={`status-cell status-${slugify(artwork.status)}`}>
        <span className={`status-pill st-${slugify(artwork.status)}`}>
          {labelFor(inventory, "status", artwork.status)}
        </span>
        {overdue && (
          <RetrievalMark
            artwork={artwork}
            movement={overdue}
            inventory={inventory}
            setInventory={setInventory}
          />
        )}
      </span>
      <button className="ghost small" onClick={onEdit}>
        Editar
      </button>
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
  // Photo chosen before saving: kept locally and imported when the artwork
  // is saved, so choosing a photo never requires a title first.
  const [pendingImage, setPendingImage] = useState<{
    path: string;
    dataUrl: string;
  } | null>(null);

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
      const result = await window.inventoryApi.importImageFromPath(
        pendingImage.path,
        "artwork",
        saved.id,
        "main"
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
      setPendingImage(picked);
      onDirtyChange?.(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo añadir la foto.");
    }
  }

  const image = form.id
    ? mainImageFor({ id: form.id, mainImageId: form.mainImageId } as Artwork, inventory)
    : undefined;
  const imageUrl = useImageDataUrl(image?.absolutePath);
  const editions = form.editions ?? [];

  return (
    <div className="form-card">
      <div className="form-head">
        <div>
          <p className="eyebrow">{form.id ? form.id : "Nueva obra"}</p>
          <h2>{form.title || "Añadir obra"}</h2>
        </div>
        <div className="form-head-actions">
          {locked ? (
            <>
              <span className="saved-badge">Guardado ✓</span>
              <button onClick={() => setLocked(false)}>Editar</button>
              <button className="ghost" onClick={onNew}>
                + Nueva obra
              </button>
              <button className="ghost" onClick={onBackToList}>
                Volver
              </button>
            </>
          ) : (
            <>
              <button onClick={save}>Guardar</button>
              <button className="ghost" onClick={onNew}>
                + Nueva obra
              </button>
              <button className="ghost" onClick={onBackToList}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      <div className="image-strip">
        <div className="image-strip-thumb">
          {pendingImage ? (
            <img src={pendingImage.dataUrl} alt={form.title} />
          ) : imageUrl ? (
            <img src={imageUrl} alt={form.title} />
          ) : (
            <span>Sin foto</span>
          )}
        </div>
        <div className="image-strip-text">
          <button className="ghost" onClick={addImage} disabled={locked}>
            {pendingImage || imageUrl ? "Cambiar foto" : "Añadir foto"}
          </button>
          <span className="muted">
            {pendingImage
              ? "Foto elegida. Se guardará al pulsar «Guardar»."
              : "Elige la foto cuando quieras; se guarda junto con la obra."}
          </span>
        </div>
      </div>

      <div className="subtabs">
        <SubTab active={tab === "info"} onClick={() => setTab("info")}>
          Información
        </SubTab>
        <SubTab
          active={tab === "movimientos"}
          variant="movimientos"
          onClick={() => setTab("movimientos")}
        >
          Movimientos ({form.movements?.length ?? 0})
        </SubTab>
      </div>

      <fieldset className="tab-fieldset" disabled={locked}>
        {tab === "info" && (
          <div className="form-section">
            <label className="field">
              Nombre / título
              <input
                value={form.title}
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
                    update("yearMade", event.target.value.replace(/[^0-9]/g, "").slice(0, 4))
                  }
                />
              </label>
              <label className="field">
                Estado (automático)
                <input
                  value={
                    isSeries
                      ? "Ver cada copia"
                      : labelFor(
                          inventory,
                          "status",
                          displayStatusFromMovements(form.movements ?? [], inventory)
                        )
                  }
                  disabled
                  readOnly
                />
              </label>
            </div>

            <p className="muted small-note">
              El estado se calcula solo a partir de los <strong>movimientos</strong>.
              Registra una venta, préstamo o exposición y el estado se actualizará.
            </p>

            <div className="dimensions">
              <span className="dimensions-label">Medidas</span>
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
                    onChange={(event) => update("unit", event.target.value as "cm" | "in")}
                  >
                    <option value="cm">cm</option>
                    <option value="in">pulgadas</option>
                  </select>
                </label>
              </div>
            </div>

            <EditionBlock
              inventory={inventory}
              setInventory={setInventory}
              form={form}
              update={update}
              setForm={setForm}
            />

            <label className="field">
              Notas
              <textarea
                className="notes-area"
                value={form.notes ?? ""}
                onChange={(event) => update("notes", event.target.value)}
              />
            </label>
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
            collapseSignal={collapseSignal}
          />
        )}
      </fieldset>

      {error && <div className="error-banner">{error}</div>}

      {!locked && (
        <div className="form-actions">
          <button onClick={save}>Guardar</button>
          <button className="ghost" onClick={onBackToList}>
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
      <div className="form-row">
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
        <div className="field" />
      </div>

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
          <button type="button" className="ghost" onClick={generate}>
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
            exposiciones de una copia en la pestaña Movimientos eligiendo «¿Qué copia?».
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
  onChange
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  isSeries: boolean;
  editions: EditionInput[];
  movements: MovementInput[];
  onChange: (items: MovementInput[]) => void;
  collapseSignal?: number;
}) {
  const [editing, setEditing] = useState<
    { mode: "new" } | { mode: "edit"; index: number } | null
  >(null);

  const newDraft: MovementInput = {
    type: "sale",
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

  const order = movements
    .map((movement, index) => ({ movement, index }))
    .sort((a, b) => movementDateValue(b.movement) - movementDateValue(a.movement));

  return (
    <div className="form-section">
      <p className="muted">
        Registra qué pasó con la obra: venta, regalo, préstamo o exposición.
      </p>
      {movements.length > 1 && (
        <div className="sort-hint">Ordenados por fecha · más reciente arriba ↓</div>
      )}
      <div className="record-list">
        {order.length === 0 ? (
          <p className="muted small-note">Aún no hay movimientos registrados.</p>
        ) : (
          order.map(({ movement, index }) => (
            <div
              className={`record-card movement-row ${movementColorClass(movement.type)}`}
              key={index}
            >
              <button
                type="button"
                className="movement-row-open"
                onClick={() => setEditing({ mode: "edit", index })}
              >
                <span className="movement-card-title">
                  {movementSummary(movement as Movement, inventory)}
                </span>
                <span className="date-tag">{movement.date || "Sin fecha"}</span>
              </button>
              <button
                type="button"
                className="link-button remove-link"
                onClick={() => remove(index)}
              >
                Quitar
              </button>
            </div>
          ))
        )}
      </div>
      <button
        type="button"
        className="ghost"
        onClick={() => setEditing({ mode: "new" })}
      >
        + Añadir movimiento
      </button>

      {editing && (
        <MovementModal
          inventory={inventory}
          setInventory={setInventory}
          isSeries={isSeries}
          editions={editions}
          isNew={editing.mode === "new"}
          draft={editing.mode === "edit" ? movements[editing.index] : newDraft}
          onClose={() => setEditing(null)}
          onSave={(value) => {
            if (editing.mode === "new") {
              onChange([...movements, value]);
            } else {
              update(editing.index, value);
            }
            setEditing(null);
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
  draft,
  isNew,
  onSave,
  onClose,
  onRemove
}: {
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  isSeries: boolean;
  editions: EditionInput[];
  draft: MovementInput;
  isNew: boolean;
  onSave: (movement: MovementInput) => void;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const [m, setM] = useState<MovementInput>(draft);
  const set = (patch: Partial<MovementInput>) =>
    setM((current) => ({ ...current, ...patch }));
  const kind = movementKind(m.type);
  const isGallery = m.recipientType === "gallery";

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
              onChange={(value) => set({ type: value })}
            />
            {kind !== "exhibition" && kind !== "loan" && (
              <label className="field">
                Fecha
                <DateField value={m.date ?? ""} onChange={(value) => set({ date: value })} />
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
                Si no marcas «devuelta» y la fecha «hasta» ya pasó, la obra mostrará un
                aviso rojo para recuperarla.
              </p>
            </div>
          ) : kind === "payment" ? (
            <div className="context-box">
              <p className="muted small-note">
                La obra se entrega a una galería como forma de pago.
              </p>
              <ContactSelect
                inventory={inventory}
                setInventory={setInventory}
                label="Galería que recibe la obra"
                kind="gallery"
                value={m.contactId ?? ""}
                onChange={(value) => set({ contactId: value, recipientType: "gallery" })}
              />
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
                Mientras no marques «Ya devuelta al estudio», la obra mostrará un aviso
                rojo recordándote que hay que recuperarla.
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
        </div>
        <div className="modal-actions">
          {!isNew && onRemove && (
            <button type="button" className="ghost danger-text" onClick={onRemove}>
              Quitar movimiento
            </button>
          )}
          <button type="button" onClick={() => onSave(m)}>
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

// Lets the artist re-save any of an artwork's photos in a chosen format and
// (optionally) under a target file size — no external editor needed.
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

  const [selectedId, setSelectedId] = useState(ordered[0]?.id ?? "");
  const [format, setFormat] = useState<"jpg" | "png" | "pdf">("jpg");
  const [sizeValue, setSizeValue] = useState("");
  const [sizeUnit, setSizeUnit] = useState<"kb" | "mb">("kb");
  const [maxDim, setMaxDim] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selected = ordered.find((image) => image.id === selectedId);

  async function run() {
    if (!selected?.absolutePath) {
      setError("Elige una imagen primero.");
      return;
    }
    const num = parseFloat(sizeValue.replace(",", "."));
    const targetKB =
      Number.isFinite(num) && num > 0 ? (sizeUnit === "mb" ? num * 1024 : num) : undefined;
    const dim = parseInt(maxDim, 10);
    setBusy(true);
    setError("");
    setDone(null);
    try {
      const res = await window.inventoryApi.exportImage({
        sourcePath: selected.absolutePath,
        format,
        targetKB,
        maxDimension: Number.isFinite(dim) && dim > 0 ? dim : undefined,
        suggestedName: artwork.title || artwork.id
      });
      if (res) setDone(`Guardada correctamente · ${formatBytes(res.bytes)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar la imagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>Salvar imagen</h3>
          <button className="icon-button ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {ordered.length === 0 ? (
            <p className="muted">
              Esta obra todavía no tiene imágenes. Añade una foto primero.
            </p>
          ) : (
            <>
              <span className="field-label">1 · Elige la imagen</span>
              <div className="export-thumb-grid">
                {ordered.map((image) => (
                  <ExportThumb
                    key={image.id}
                    image={image}
                    active={image.id === selectedId}
                    onClick={() => setSelectedId(image.id)}
                  />
                ))}
              </div>

              <label className="field">
                2 · Formato del archivo
                <select
                  value={format}
                  onChange={(event) =>
                    setFormat(event.target.value as "jpg" | "png" | "pdf")
                  }
                >
                  <option value="jpg">JPG (foto, archivo pequeño)</option>
                  <option value="png">PNG (máxima calidad)</option>
                  <option value="pdf">PDF (documento)</option>
                </select>
              </label>

              <div className="form-row">
                <label className="field">
                  3 · Tamaño máximo (opcional)
                  <input
                    inputMode="decimal"
                    placeholder="ej. 500"
                    value={sizeValue}
                    onChange={(event) =>
                      setSizeValue(event.target.value.replace(/[^0-9.,]/g, ""))
                    }
                  />
                </label>
                <label className="field">
                  Unidad
                  <select
                    value={sizeUnit}
                    onChange={(event) => setSizeUnit(event.target.value as "kb" | "mb")}
                  >
                    <option value="kb">KB</option>
                    <option value="mb">MB</option>
                  </select>
                </label>
              </div>

              <label className="field">
                Ancho/alto máximo en píxeles (opcional)
                <input
                  inputMode="numeric"
                  placeholder="ej. 2000"
                  value={maxDim}
                  onChange={(event) =>
                    setMaxDim(event.target.value.replace(/[^0-9]/g, ""))
                  }
                />
              </label>
              <p className="muted small-note">
                Si indicas un tamaño máximo, la app baja la calidad (y reduce la
                imagen si hace falta) hasta lograrlo. Déjalo en blanco para conservar
                la calidad original.
              </p>
            </>
          )}

          {error && <div className="error-banner">{error}</div>}
          {done && <div className="success-banner">{done}</div>}
        </div>
        <div className="modal-actions">
          <button disabled={busy || ordered.length === 0} onClick={run}>
            {busy ? "Guardando…" : "Guardar imagen…"}
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
  onDeleted
}: {
  artwork: Artwork;
  inventory: InventoryData;
  setInventory: (data: InventoryData) => void;
  onEdit: () => void;
  onBack: () => void;
  onDeleted: (data: InventoryData) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("info");
  const [openMovement, setOpenMovement] = useState<Movement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const image = mainImageFor(artwork, inventory);
  const imageUrl = useImageDataUrl(image?.absolutePath);
  const editions = inventory.editions.filter((item) => item.artworkId === artwork.id);
  const movements = sortMovementsDesc(
    inventory.movements.filter((item) => item.artworkId === artwork.id)
  );

  async function addImage() {
    const result = await window.inventoryApi.importImage("artwork", artwork.id, "main");
    if (result?.inventory) setInventory(result.inventory);
  }

  async function remove() {
    const data = await window.inventoryApi.deleteArtwork(artwork.id);
    onDeleted(data);
  }

  return (
    <section className="detail-layout">
      <div className="detail-image-panel">
        {imageUrl ? <img src={imageUrl} alt={artwork.title} /> : <div>Sin foto</div>}
        <div className="image-panel-actions">
          <button className="ghost" onClick={addImage}>
            {imageUrl ? "Cambiar foto" : "Añadir foto"}
          </button>
          <button className="ghost" onClick={() => setExporting(true)}>
            Salvar imagen…
          </button>
        </div>
      </div>
      <div className="detail-panel">
        <div className="detail-header">
          <div>
            <p className="eyebrow">{artwork.id}</p>
            <h2>{artwork.title}</h2>
          </div>
          <div className="form-head-actions">
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
            variant="movimientos"
            onClick={() => setTab("movimientos")}
          >
            Movimientos ({movements.length})
          </SubTab>
        </div>

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
              <p className="muted">Sin movimientos.</p>
            ) : (
              <>
                <div className="sort-hint">
                  Ordenados por fecha · más reciente arriba ↓
                </div>
                <div className="mini-table">
                  {movements.map((item) => (
                    <button
                      key={item.id}
                      className={`mini-row clickable movement-row ${movementColorClass(
                        item.type
                      )}`}
                      onClick={() => setOpenMovement(item)}
                    >
                      <strong>
                        {movementSummary(item, inventory)}
                        {item.editionLabel ? ` · ${item.editionLabel}` : ""}
                      </strong>
                      <span>
                        <span className="date-tag">{item.date || "Sin fecha"}</span>
                        {movementSubtitle(item, inventory)
                          ? ` · ${movementSubtitle(item, inventory)}`
                          : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </>
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

// A combo box: free text plus a filtered dropdown of existing values.
function SeriesField({
  inventory,
  value,
  onChange
}: {
  inventory: InventoryData;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useMemo(
    () =>
      uniqueValues(inventory.artworks.map((art) => art.series)).sort((a, b) =>
        a.localeCompare(b)
      ),
    [inventory.artworks]
  );
  return (
    <label className="field">
      Serie
      <input
        list="series-options"
        placeholder="Escribe o elige una serie"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id="series-options">
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <span className="field-hint muted">
        Escribe una serie nueva o elige una de la lista.
      </span>
    </label>
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

type ArtworkSort = "title" | "year" | "size";

function orderArtworks(list: Artwork[], sort: ArtworkSort): Artwork[] {
  const copy = [...list];
  if (sort === "year") {
    copy.sort((a, b) => (b.yearMade ?? "").localeCompare(a.yearMade ?? ""));
  } else if (sort === "size") {
    const area = (artwork: Artwork) =>
      (toCm(artwork.height, artwork.unit) ?? 0) *
      (toCm(artwork.width, artwork.unit) ?? 0);
    copy.sort((a, b) => area(b) - area(a));
  } else {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  }
  return copy;
}

function ArtworkPickerModal({
  inventory,
  excludeIds = [],
  title = "Añadir obras",
  notice,
  onConfirm,
  onClose
}: {
  inventory: InventoryData;
  excludeIds?: string[];
  title?: string;
  notice?: string;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
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
    inventory.artworks.filter((artwork) =>
      [artwork.title, artwork.series, artwork.id]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    ),
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
    const data = await window.inventoryApi.addExhibitionSale(
      exhibition.id,
      artworkId,
      price,
      contactId,
      date
    );
    setInventory(data);
    reset();
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

const GROUP_COLORS = [
  "#e8f1eb",
  "#fbf0e0",
  "#e9edf6",
  "#f7ece4",
  "#eef6e9",
  "#f3e9f3",
  "#e9f3f6"
];

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

function GroupedRecords({
  inventory,
  records,
  groupBy,
  colorize,
  artworkById,
  onOpenArtwork
}: {
  inventory: InventoryData;
  records: Movement[];
  groupBy: GroupBy;
  colorize: boolean;
  artworkById: Map<string, Artwork>;
  onOpenArtwork: (artworkId: string) => void;
}) {
  function row(movement: Movement) {
    const artwork = artworkById.get(movement.artworkId);
    const priceText = movement.price || movement.listedPrice || "";
    return (
      <button
        key={movement.id}
        className="mini-row clickable"
        onClick={() => onOpenArtwork(movement.artworkId)}
      >
        <strong>{artwork?.title || movement.artworkId}</strong>
        <span>
          {movementSummary(movement, inventory)}
          {movement.date ? ` · ${movement.date}` : ""}
          {priceText ? ` · ${priceText}` : ""}
        </span>
      </button>
    );
  }

  if (groupBy === "none") {
    return <div className="mini-table">{records.map(row)}</div>;
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
        label = yr ? `${title} (${yr})` : title;
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

  const ordered = [...groups.entries()].sort((a, b) =>
    b[1].sortVal.localeCompare(a[1].sortVal)
  );

  return (
    <div className="record-groups">
      {ordered.map(([key, group], index) => (
        <div
          className="record-group"
          key={key}
          style={
            colorize
              ? { borderLeftColor: GROUP_COLORS[index % GROUP_COLORS.length] }
              : undefined
          }
        >
          <div
            className="record-group-head"
            style={
              colorize
                ? { background: GROUP_COLORS[index % GROUP_COLORS.length] }
                : undefined
            }
          >
            {group.label}
            <span className="count-pill subtle">{group.items.length}</span>
          </div>
          <div className="record-group-items">{group.items.map(row)}</div>
        </div>
      ))}
    </div>
  );
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
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [movGroup, setMovGroup] = useState<GroupBy>("exhibition");
  const [salesGroup, setSalesGroup] = useState<GroupBy>("year");
  const [colorize, setColorize] = useState(true);
  const [showMovements, setShowMovements] = useState(false);
  const [linkingPerson, setLinkingPerson] = useState(false);

  const institution = isInstitution(contact.kind);
  const galerista = contact.galleristContactId
    ? inventory.contacts.find((item) => item.id === contact.galleristContactId)
    : undefined;
  const linkedPeople = inventory.contacts.filter(
    (item) => item.kind === "person" && item.organizationId === contact.id
  );

  const exhibitions = inventory.exhibitions.filter(
    (item) => item.galleryContactId === contact.id
  );
  const exhibitionIds = new Set(exhibitions.map((item) => item.id));
  const movements = sortMovementsDesc(
    inventory.movements.filter(
      (movement) =>
        movement.contactId === contact.id ||
        (movement.exhibitionId && exhibitionIds.has(movement.exhibitionId))
    )
  );
  const sales = movements.filter((movement) => movementKind(movement.type) === "sale");
  const artworkById = new Map(inventory.artworks.map((art) => [art.id, art]));

  async function remove() {
    const data = await window.inventoryApi.deleteContact(contact.id);
    setInventory(data);
    onDeleted();
  }

  return (
    <section className="detail-layout single">
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

        {(movements.length > 0 || sales.length > 0) && (
          <label className="checkline colorize-toggle">
            <input
              type="checkbox"
              checked={colorize}
              onChange={(event) => setColorize(event.target.checked)}
            />
            Colores por grupo
          </label>
        )}

        <dl className="metadata">
          <dt>Lugar</dt>
          <dd>
            {[contact.city, contact.country || contact.location]
              .filter(Boolean)
              .join(", ") || "-"}
          </dd>
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
          <dd>{[contact.phone, contact.email].filter(Boolean).join(" · ") || "-"}</dd>
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

        {institution && (
          <div className="related-block">
            <div className="related-head">
              <h3>Personas ({linkedPeople.length})</h3>
              <button type="button" className="ghost small" onClick={() => setLinkingPerson(true)}>
                + Añadir persona
              </button>
            </div>
            {linkedPeople.length === 0 ? (
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
            )}
          </div>
        )}

        {institution && (
          <div className="related-block">
            <h3>Exposiciones ({exhibitions.length})</h3>
            {exhibitions.length === 0 ? (
              <p className="muted">Sin exposiciones asociadas.</p>
            ) : (
              <div className="mini-table">
                {exhibitions.map((item) => (
                  <button
                    className="mini-row clickable"
                    key={item.id}
                    onClick={() => onOpenExhibition(item.id)}
                  >
                    <strong>{item.title}</strong>
                    <span>
                      {[item.city, item.country].filter(Boolean).join(", ")}
                      {item.startDate ? ` · ${item.startDate}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="related-block">
          <div className="related-head">
            <button
              type="button"
              className="collapse-head"
              onClick={() => setShowMovements((value) => !value)}
            >
              <span className="collapse-caret">{showMovements ? "▾" : "▸"}</span>
              <h3>Movimientos de obras ({movements.length})</h3>
            </button>
            {showMovements && movements.length > 0 && (
              <GroupControl value={movGroup} onChange={setMovGroup} />
            )}
          </div>
          {showMovements &&
            (movements.length === 0 ? (
              <p className="muted">Sin movimientos registrados.</p>
            ) : (
              <GroupedRecords
                inventory={inventory}
                records={movements}
                groupBy={movGroup}
                colorize={colorize}
                artworkById={artworkById}
                onOpenArtwork={onOpenArtwork}
              />
            ))}
        </div>

        {contact.kind === "gallery" && (
          <div className="related-block">
            <div className="related-head">
              <h3>Ventas por la galería ({sales.length})</h3>
              {sales.length > 0 && (
                <GroupControl value={salesGroup} onChange={setSalesGroup} />
              )}
            </div>
            {sales.length === 0 ? (
              <p className="muted">Sin ventas registradas.</p>
            ) : (
              <GroupedRecords
                inventory={inventory}
                records={sales}
                groupBy={salesGroup}
                colorize={colorize}
                artworkById={artworkById}
                onOpenArtwork={onOpenArtwork}
              />
            )}
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
  // after choosing "salir sin guardar").
  useEffect(() => {
    if (resetToken !== undefined && resetToken > 0) setEditing(null);
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
      if (movement.listedPrice) map[movement.artworkId] = movement.listedPrice;
    });
    return map;
  });
  const [artworkSort, setArtworkSort] = useState<ArtworkSort>("title");
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  async function persist(): Promise<boolean> {
    try {
      const data = await window.inventoryApi.saveExhibition(form, selected, listed);
      setInventory(data);
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

  // A piece sold before this exhibition cannot be shown in it. If the
  // exhibition has no date yet, any sold piece is blocked to be safe.
  const exhStartMs = dateToMs(form.startDate);
  const soldBlockedIds = inventory.artworks
    .filter((artwork) => {
      const sale = inventory.movements.find(
        (movement) =>
          movement.artworkId === artwork.id && movementKind(movement.type) === "sale"
      );
      if (!sale) return false;
      if (!Number.isFinite(exhStartMs)) return true;
      const saleMs = dateToMs(sale.date);
      return !Number.isFinite(saleMs) || saleMs <= exhStartMs;
    })
    .map((artwork) => artwork.id);

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
              Generar lista de precios
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
                  <input
                    className="pick-price"
                    placeholder="Precio de lista"
                    value={listed[artwork.id] ?? ""}
                    onChange={(event) => {
                      markDirty();
                      setListed((current) => ({
                        ...current,
                        [artwork.id]: event.target.value
                      }));
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
            notice="Las obras ya vendidas antes de esta exposición no aparecen en la lista."
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
    if (movement.price) rows.push(["Precio", movement.price]);
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
  const [prices, setPrices] = useState<Record<string, string>>({});
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

  const selectedIds = mode === "exhibition" ? exhibitionArtworkIds : freeSelected;

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

  function rawPrice(id: string): string {
    return prices[id] ?? listedPriceFor(id);
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

  async function generate(format: "pdf" | "docx") {
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
          price: formatEuro(rawPrice(id)),
          imageDataUrl,
          widthCm: toCm(art.width, art.unit),
          heightCm: toCm(art.height, art.unit)
        });
      }
      const savedPath = await window.inventoryApi.generatePriceList(format, {
        header: header || "Lista de precios",
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
        onToast(`Lista generada (${format.toUpperCase()}).`);
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
          <h2>Generar lista de precios</h2>
        </div>
        <div className="form-head-actions">
          <button disabled={busy} onClick={() => generate("pdf")}>
            Generar PDF
          </button>
          <button className="ghost" disabled={busy} onClick={() => generate("docx")}>
            Generar Word
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
              <span className="pl-block-title">Precio e imagen de cada obra</span>
              <div className="pl-row-list">
                {selectedIds.map((id) => {
                  const art = artworkById.get(id);
                  if (!art) return null;
                  return (
                    <div className="pl-row-item" key={id}>
                      <span className="pl-row-title" title={art.title}>
                        {art.title}
                      </span>
                      {showPrice && (
                        <input
                          className="pl-price"
                          placeholder="Precio €"
                          value={prices[id] ?? listedPriceFor(id)}
                          onChange={(event) =>
                            setPrices((current) => ({
                              ...current,
                              [id]: event.target.value
                            }))
                          }
                        />
                      )}
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
                {header || "Lista de precios"}
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
                  const pageBreakHere =
                    index > 0 && index % imagesPerPage === 0;
                  const wCm = toCm(art.width, art.unit) ?? 0;
                  const hCm = toCm(art.height, art.unit) ?? 0;
                  let iw = frameSize;
                  let ih = frameSize;
                  if (wCm > 0 && hCm > 0) {
                    const aspect = wCm / hCm;
                    if (aspect >= 1) ih = Math.round(frameSize / aspect);
                    else iw = Math.round(frameSize * aspect);
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
                            {formatEuro(rawPrice(id)) || "—"}
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

function SubTab({
  active,
  onClick,
  variant,
  children
}: {
  active: boolean;
  onClick: () => void;
  variant?: "movimientos";
  children: ReactNode;
}) {
  const classes = ["subtab"];
  if (active) classes.push("active");
  if (variant === "movimientos") classes.push("subtab-movimientos");
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

type MovementKind = "sale" | "gift" | "loan" | "exhibition" | "payment" | "other";

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
    default:
      return "other";
  }
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

// The movement that means the artwork is OUT of the studio and not yet
// confirmed back. The red "to retrieve" mark shows for it.
//
// Rule (per the artist's request): the mark shows for any movement that takes
// the piece out (loan, exhibition, kept-with-gallery) UNLESS "devuelta al
// estudio" is ticked. It never shows for a sale, gift or payment, since the
// piece is gone for good in those cases.
function overdueMovement(
  artwork: Artwork,
  inventory: InventoryData
): Movement | null {
  if (artwork.editionMode !== "unique") return null;
  const movements = inventory.movements.filter((m) => m.artworkId === artwork.id);
  const latest = sortMovementsDesc(movements).find(
    (m) => movementKind(m.type) !== "other"
  );
  if (!latest) return null;
  const kind = movementKind(latest.type);
  if (kind === "sale" || kind === "gift" || kind === "payment") return null;
  if (kind === "loan" || kind === "exhibition") {
    return latest.returned ? null : latest;
  }
  return null;
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
