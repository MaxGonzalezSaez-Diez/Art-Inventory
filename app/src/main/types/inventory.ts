export type ArtworkStatus = string;
export type ArtworkType = string;
export type MovementType = string;

export type EditionMode = "unique" | "multiple";
export type EditionKind = "personal" | "edition";
export type ContactKind = "person" | "gallery" | "museum" | "collection";
export type MovementContext = "" | "gallery" | "exhibition";

export interface Artwork {
  id: string;
  title: string;
  series?: string;
  type: ArtworkType;
  yearMade?: string;
  height?: string;
  width?: string;
  depth?: string;
  unit: "cm" | "in";
  status: ArtworkStatus;
  galleryContactId?: string;
  galleryName?: string;
  editionMode: EditionMode;
  editionPersonalCopies?: string;
  editionSaleCopies?: string;
  soldPrice?: string;
  soldDate?: string;
  soldToContactId?: string;
  soldToName?: string;
  notes?: string;
  mainImageId?: string;
  mainImagePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Edition {
  id: string;
  artworkId: string;
  label: string;
  kind: EditionKind;
  status?: ArtworkStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Movement {
  id: string;
  artworkId: string;
  editionId?: string;
  editionLabel?: string;
  type: MovementType;
  recipientType?: ContactKind;
  contactId?: string;
  contactName?: string;
  exhibitionId?: string;
  exhibitionTitle?: string;
  context?: MovementContext;
  returned?: boolean;
  keptAtGallery?: boolean;
  date?: string;
  endDate?: string;
  indefinite?: boolean;
  price?: string;
  received?: string;
  listedPrice?: string;
  /** Whether VAT/tax was charged on this sale. Default true for legacy rows. */
  taxCharged?: boolean;
  currency?: string;
  notes?: string;
  createdAt: string;
}

export interface Exhibition {
  id: string;
  title: string;
  city?: string;
  country?: string;
  venue?: string;
  galleryContactId?: string;
  galleryName?: string;
  curatorContactId?: string;
  startDate?: string;
  endDate?: string;
  curator?: string;
  exhibitionType?: string;
  comments?: string;
  artworkIds?: string;
  imagePaths?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  kind: ContactKind;
  name: string;
  firstName?: string;
  lastName?: string;
  birthday?: string;
  job?: string;
  relationship?: string;
  phone?: string;
  email?: string;
  website?: string;
  location?: string;
  city?: string;
  country?: string;
  firstContactYear?: string;
  comments?: string;
  galleristContactId?: string;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArtworkImage {
  id: string;
  targetType: "artwork" | "edition" | "exhibition" | "expense" | "series" | "application";
  targetId: string;
  category: string;
  relativePath: string;
  absolutePath?: string;
  caption?: string;
  originalName?: string;
  createdAt: string;
}

// Shared meta for a named series. Artwork.series strings link to SeriesInfo.name.
export interface SeriesText {
  id: string;
  topic: string;
  body: string;
}

export interface SeriesInfo {
  id: string;
  name: string;
  texts: SeriesText[];
  notes?: string;
  /** @deprecated kept for migration from older saves */
  topic?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesInfoInput
  extends Omit<SeriesInfo, "id" | "createdAt" | "updatedAt"> {
  id?: string;
}

// Competition / stipend / residency applications.
export type ApplicationKind = "concurso" | "beca" | "residencia" | "otro";

export interface CoverLineStyle {
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
}

export interface ApplicationCoverStyles {
  /** Línea por encima del título */
  above?: CoverLineStyle;
  /** Título */
  title?: CoverLineStyle;
  /** Línea por debajo (izquierda) */
  below?: CoverLineStyle;
  /** A la derecha de la línea por debajo */
  belowRight?: CoverLineStyle;
  /** Segunda línea */
  second?: CoverLineStyle;
}

export interface Application {
  id: string;
  /** Internal name for the list / data entry (can include tipo, etc.). */
  title: string;
  kind: ApplicationKind;
  organization?: string;
  deadline?: string; // DD-MM-YYYY
  /** Title printed on the PDF cover. */
  documentTitle?: string;
  /** Optional line above the PDF title. */
  coverSubtitle?: string;
  /** Flexible date or year printed on the PDF cover (right of line below). */
  coverDate?: string;
  /** Second line under the title row. */
  coverNote?: string;
  /** Per-line font / size for the PDF cover. */
  coverStyles?: ApplicationCoverStyles;
  /**
   * Shared format for all text-section encabezados (PDF/Word).
   * Applies to every section heading at once.
   */
  sectionHeadingStyle?: CoverLineStyle;
  /**
   * Shared base format for all text-section bodies (PDF/Word).
   * Inline bold/italic in the editor still work letter by letter.
   */
  sectionBodyStyle?: CoverLineStyle;
  /** @deprecated cover images removed */
  coverImageId?: string;
  /** Flexible text pages (heading + rich HTML body). */
  sections?: ApplicationTextSection[];
  /** @deprecated migrated into sections */
  textAboutWorks?: string;
  textAboutProject?: string;
  headingAboutWorks?: string;
  headingAboutProject?: string;
  headingWorks?: string;
  /** Language for artwork type labels and kind labels on the export. */
  language?: "es" | "en" | "de";
  /**
   * How paintings appear in the cover table of contents:
   * - list: one line per painting (default)
   * - bySeries: one line per series with count
   * - worksOnly: single “Obras” line pointing at the first painting page
   */
  tocWorksMode?: "list" | "bySeries" | "worksOnly";
  /** When false, the cover omits the table of contents. Default true. */
  showToc?: boolean;
  /** Name shown in PDF/Word header/footer (artist). */
  headerArtistName?: string;
  /** Competition / call name shown in PDF/Word header/footer. */
  headerCompetition?: string;
  artworkIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationTextSection {
  id: string;
  heading: string;
  /** Rich HTML from the editor (bold / italic / color / size). */
  bodyHtml: string;
}

export interface TextGeneratorExample {
  id: string;
  /** Short topic label shown when picking examples. */
  topic: string;
  body: string;
  /** Optional foldable group in the example library. Empty = uncategorized. */
  category?: string;
  /** @deprecated migrated into topic */
  title?: string;
  /** @deprecated migrated into body */
  text?: string;
}

/**
 * How to reach out for a contact reminder. Free string so the user can add
 * her own methods through the `contactMethod` lookup list.
 */
export type ReminderChannel = string;

/**
 * Recurring “reach out” reminder tied to a contact (person or gallery).
 * Optional on older libraries — missing arrays hydrate to [].
 */
export type ReminderIntervalUnit = "days" | "months";

export interface ContactReminder {
  id: string;
  contactId: string;
  channel: ReminderChannel;
  /** How often to reach out. */
  intervalValue: number;
  intervalUnit: ReminderIntervalUnit;
  /**
   * @deprecated Prefer intervalValue + intervalUnit.
   * Kept so older app builds still read month-based reminders.
   */
  intervalMonths?: number;
  note?: string;
  /** ISO date of last completed reach-out; empty = never. */
  lastDoneAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Free-form inbox note, newest first in the UI.
 * `body` may be plain text (older notes) or simple HTML (bold / lists).
 */
export interface InboxNote {
  id: string;
  body: string;
  createdAt: string;
}

/**
 * Simple checklist item in Recordatorios → Todo.
 * `doneAt` empty = active; set = archived (kept for history).
 * Optional on older libraries — missing arrays hydrate to [].
 */
export interface InboxTodo {
  id: string;
  body: string;
  /** ISO date when marked done; empty = still open. */
  doneAt?: string;
  /** Optional due date as DD-MM-YYYY; empty = no date. */
  dueDate?: string;
  createdAt: string;
}

export interface ApplicationInput
  extends Omit<Application, "id" | "createdAt" | "updatedAt"> {
  id?: string;
}

/**
 * Saved “Folleto de obras” (price-list brochure). JSON-only — optional on
 * older libraries (missing → []). Mirrors the ephemeral PriceListPage state.
 */
export interface PriceListDoc {
  id: string;
  /** Name shown in the list (usually the document header). */
  title: string;
  mode: "free" | "exhibition" | "series";
  exhibitionId?: string;
  /** Series name when mode is "series" (matches Artwork.series). */
  seriesName?: string;
  /** Ordered artwork IDs included in the brochure. */
  artworkIds: string[];
  /**
   * Optional brochure-only price overrides (artworkId → amount text).
   * Missing on older libraries → {}.
   */
  priceOverrides?: Record<string, string>;
  header: string;
  subtitle?: string;
  leftHeader?: string;
  rightHeader?: string;
  /** Optional text under the header, before the works. Missing → "". */
  introText?: string;
  showPrice: boolean;
  priceBold?: boolean;
  /** @deprecated mapped into priceFontSize on load */
  priceSize?: "text" | "title" | "large";
  /** Artwork title size in the work row (px). Missing → 15. */
  titleFontSize?: number;
  /** Series / type / size / year size (px). Missing → 12.5. */
  textFontSize?: number;
  /** Listed price size (px). Missing → from priceSize, else 15. */
  priceFontSize?: number;
  /** Bold for the work-row text (not the title). Missing → false. */
  textBold?: boolean;
  imagesPerPage?: number;
  imageGap?: number;
  frameBorderColor?: string;
  language?: "es" | "en" | "de";
  /** Series line under each work ("Perteneciente a la serie …"). Missing → true. */
  showSeries?: boolean;
  /** Words before the series name. Missing → default of the language; "" → none. */
  seriesPrefix?: string;
  /** "3 / 12" bottom-right on every page. Missing → false. */
  pageNumbers?: boolean;
  /** One line at the bottom of every page (name, web…). Missing → "". */
  footerText?: string;
  fonts?: { header: string; subtitle: string; body: string };
  headerStyle?: { bold?: boolean; italic?: boolean; color?: string };
  subtitleStyle?: { italic?: boolean; color?: string };
  createdAt: string;
  updatedAt: string;
}

export interface PriceListDocInput
  extends Omit<PriceListDoc, "id" | "createdAt" | "updatedAt"> {
  id?: string;
}

// Money going out: materials, exhibition costs, or other. Receipts are stored
// as images with targetType "expense".
export type ExpenseCategory = "material" | "exhibition" | "misc";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: string;
  date: string; // DD-MM-YYYY
  note: string;
  contactId?: string;
  exhibitionId?: string;
  receiptImageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseInput extends Omit<Expense, "id" | "createdAt" | "updatedAt"> {
  id?: string;
}

export interface LookupOption {
  category: string;
  value: string;
  label: string;
}

// One factor value that becomes effective on a given date (within a size type).
// `from` is a DD-MM-YYYY date; an empty string means "from the beginning".
export interface FactorPeriod {
  id: string;
  from: string; // DD-MM-YYYY effective date; "" = always
  factor: number;
}

// A size band ("type"), defined by the sum of height + width in cm. It applies
// when fromSum <= (height + width) <= toSum. A toSum of 0 means "no upper
// limit". Each type keeps its own timeline of factors, so the factor can change
// over the years (or mid-year) without duplicating rows per year.
export interface SizeType {
  id: string;
  label?: string;
  fromSum: number; // cm, inclusive
  toSum: number; // cm, inclusive; 0 = no upper limit
  factors: FactorPeriod[];
}

export interface TaxRate {
  id: string;
  country: string;
  rate: number; // percentage, e.g. 21
  from?: string; // DD-MM-YYYY effective date; "" = always
}

/** One flat price that becomes effective on a given date (within a technique). */
export interface FixedPricePeriod {
  id: string;
  from: string; // DD-MM-YYYY; "" = from the beginning
  price: number;
}

/**
 * Flat price timeline for a technique that does not use size factors
 * (e.g. Ipad Drawings). Same idea as size-type factors: each row is
 * «from this date, the price is this».
 */
export interface FixedTypePrice {
  typeValue: string;
  prices: FixedPricePeriod[];
}

export interface AppSettings {
  sizeTypes: SizeType[];
  taxRates: TaxRate[];
  /** Techniques priced as a flat amount instead of (alto+ancho) × factor. */
  fixedTypePrices?: FixedTypePrice[];
  /**
   * Fixed system instructions prepended to Generador de texto copies.
   * Editable in a quiet panel on that page.
   */
  textGeneratorSystemPrompt?: string;
}

/** Built-in flat-price techniques seeded into a new library (editable later). */
export const DEFAULT_FIXED_TYPE_PRICES: FixedTypePrice[] = [
  {
    typeValue: "ipad_drawing",
    prices: [{ id: "fp-ipad-default", from: "", price: 250 }]
  },
  {
    typeValue: "plexiglass",
    prices: [{ id: "fp-plexiglass-default", from: "", price: 400 }]
  }
];

export const DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT = `Eres el apoyo de una artista: secretaria, galerista e historiadora del arte. Redactas textos (notas de sala, dossiers, solicitudes, presentaciones de obra) con voz elocuente, precisa y humana — nunca grandilocuente ni de folleto publicitario. No inventes datos (títulos, medidas, fechas, biografía, materiales). Si falta información, márcala entre corchetes. Conserva la voz de la artista cuando haya notas o ejemplos; úsalos como referencia de tono, no como plantilla rígida.`;

export interface InventoryData {
  libraryPath: string;
  artworks: Artwork[];
  editions: Edition[];
  movements: Movement[];
  exhibitions: Exhibition[];
  contacts: Contact[];
  images: ArtworkImage[];
  lookups: LookupOption[];
  expenses: Expense[];
  seriesInfo: SeriesInfo[];
  applications: Application[];
  /** Saved folleto de obras drafts (JSON-only; optional for old libs). */
  priceLists?: PriceListDoc[];
  textGeneratorExamples: TextGeneratorExample[];
  /** Recurring contact reach-out reminders (JSON-only; optional for old libs). */
  contactReminders?: ContactReminder[];
  /** Free inbox notes (JSON-only; optional for old libs). */
  inboxNotes?: InboxNote[];
  /** Checklist todos (JSON-only; optional for old libs). */
  inboxTodos?: InboxTodo[];
  settings: AppSettings;
  /**
   * Set on load (never saved) when inventory.json was unreadable or missing
   * and was restored from the snapshot taken at this time (ISO).
   */
  recoveredFrom?: string;
}

export interface EditionInput
  extends Omit<Edition, "id" | "artworkId" | "createdAt" | "updatedAt"> {
  id?: string;
}

export interface MovementInput
  extends Omit<
    Movement,
    "id" | "artworkId" | "createdAt" | "contactName" | "editionLabel" | "exhibitionTitle"
  > {
  id?: string;
}

export interface ArtworkInput
  extends Omit<
    Artwork,
    | "id"
    | "createdAt"
    | "updatedAt"
    | "soldPrice"
    | "soldDate"
    | "soldToContactId"
    | "soldToName"
    | "galleryName"
    | "mainImagePath"
  > {
  id?: string;
  editions?: EditionInput[];
  movements?: MovementInput[];
}

export interface ExhibitionInput
  extends Omit<
    Exhibition,
    "id" | "createdAt" | "updatedAt" | "artworkIds" | "imagePaths"
  > {
  id?: string;
  artworkIds?: string[];
}

export interface ContactInput
  extends Omit<Contact, "id" | "createdAt" | "updatedAt" | "name"> {
  id?: string;
  name?: string;
}

export interface LookupInput extends LookupOption {}

export interface ImportedImage {
  image: ArtworkImage;
  inventory: InventoryData;
}
