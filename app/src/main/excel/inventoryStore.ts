import { access, copyFile, mkdir, readFile, writeFile } from "fs/promises";
import { stat } from "fs/promises";
import {
  backupBeforeWrite,
  keepUnreadable,
  listSnapshots,
  previousCopyPath,
  writeFileAtomic
} from "./libraryFiles";
import path from "path";
import { randomUUID } from "crypto";
import type {
  AppSettings,
  Artwork,
  ArtworkImage,
  ArtworkInput,
  Application,
  ApplicationCoverStyles,
  ApplicationInput,
  ApplicationTextSection,
  Contact,
  ContactInput,
  ContactReminder,
  CoverLineStyle,
  Edition,
  Exhibition,
  ExhibitionInput,
  Expense,
  ExpenseInput,
  FixedTypePrice,
  ImportedImage,
  InboxNote,
  InboxTodo,
  InventoryData,
  LookupInput,
  LookupOption,
  Movement,
  PriceListDoc,
  PriceListDocInput,
  ReminderChannel,
  ReminderIntervalUnit,
  SeriesInfo,
  SeriesInfoInput,
  TextGeneratorExample,
  EditionMode
} from "../types/inventory";
import { DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT, DEFAULT_FIXED_TYPE_PRICES } from "../types/inventory";
import { createArtworkId } from "../artworkId";
import {
  createEmptyWorkbook,
  ensureLibrary,
  loadWorkbook,
  replaceSheetRows,
  rowsToObjects,
  saveWorkbook
} from "./workbook";
import { DEFAULT_LOOKUPS } from "./schema";

const DATA_FILE = "inventory.json";

/** Keeps "" (meaning: none) but drops anything that isn't text. */
function optionalText(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

export class InventoryStore {
  constructor(private libraryPath: string) {}

  private get dataPath(): string {
    return path.join(this.libraryPath, DATA_FILE);
  }

  async load(): Promise<InventoryData> {
    await ensureLibrary(this.libraryPath);
    const { data, recoveredFrom } = await this.readOrRecover();
    const loaded = withResolvedImagePaths(compactData(data), this.libraryPath);
    return recoveredFrom ? { ...loaded, recoveredFrom } : loaded;
  }

  /**
   * Read inventory.json. If it is missing or not valid JSON (e.g. a crash
   * mid-write in an older version), restore the newest readable snapshot and
   * keep the broken file aside. Only a library with no data file and no
   * snapshots is built from the Excel workbook (the original migration).
   */
  private async readOrRecover(): Promise<{ data: InventoryData; recoveredFrom?: string }> {
    const main = await readDataFile(this.dataPath);
    if (main.kind === "ok") return { data: normalizeRaw(main.raw, this.libraryPath) };

    // Newest first: the copy from just before the last save, then snapshots.
    const candidates = await listSnapshots(this.libraryPath, "json");
    const previous = previousCopyPath(this.libraryPath);
    const previousTime = await stat(previous).then((info) => info.mtimeMs, () => NaN);
    if (Number.isFinite(previousTime)) candidates.unshift({ file: previous, ms: previousTime });
    for (const snapshot of candidates) {
      const candidate = await readDataFile(snapshot.file);
      if (candidate.kind !== "ok") continue;
      if (main.kind === "unreadable") await keepUnreadable(this.libraryPath, this.dataPath);
      await copyFile(snapshot.file, this.dataPath);
      return {
        data: normalizeRaw(candidate.raw, this.libraryPath),
        recoveredFrom: new Date(snapshot.ms).toISOString()
      };
    }

    if (main.kind === "missing") return { data: await this.migrateFromWorkbook() };
    // Never rebuild over data we could not read: the Excel copy is incomplete.
    throw new Error(
      "No se pudo leer el archivo del inventario (inventory.json) y no hay ninguna copia válida en «backups». No se ha cambiado nada. Escribe a Max antes de seguir."
    );
  }

  private async migrateFromWorkbook(): Promise<InventoryData> {
    let data = emptyInventory(this.libraryPath);
    try {
      const workbook = await loadWorkbook(this.libraryPath);
      data = {
        libraryPath: this.libraryPath,
        artworks: rowsToObjects<Artwork>(workbook, "Artworks"),
        editions: rowsToObjects<Edition>(workbook, "Editions"),
        movements: rowsToObjects<Movement>(workbook, "Movements").map(hydrateMovement),
        exhibitions: rowsToObjects<Exhibition>(workbook, "Exhibitions"),
        contacts: rowsToObjects<Contact>(workbook, "Contacts"),
        images: rowsToObjects<ArtworkImage>(workbook, "Images"),
        lookups: uniqueLookups(rowsToObjects<LookupOption>(workbook, "Lookups")),
        expenses: [],
        seriesInfo: [],
        applications: [],
        priceLists: [],
        textGeneratorExamples: [],
        contactReminders: [],
        inboxNotes: [],
        inboxTodos: [],
        settings: defaultSettings()
      };
    } catch {
      data = emptyInventory(this.libraryPath);
    }
    const compacted = compactData(data);
    await this.writeJson(compacted);
    return compacted;
  }

  private async writeJson(data: InventoryData): Promise<void> {
    const { recoveredFrom: _notice, ...rest } = data;
    const payload = {
      ...rest,
      images: data.images.map(({ absolutePath, ...image }) => image)
    };
    await backupBeforeWrite(this.libraryPath, this.dataPath);
    await writeFileAtomic(this.dataPath, JSON.stringify(payload, null, 2));
  }

  async saveArtwork(input: ArtworkInput): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const title = input.title.trim();
    if (!title) throw new Error("El título es obligatorio.");

    const existing = input.id
      ? data.artworks.find((artwork) => artwork.id === input.id)
      : undefined;
    const existingIds = data.artworks.map((item) => item.id);
    const id =
      existing?.id ??
      createArtworkId(
        {
          title,
          yearMade: input.yearMade,
          height: input.height,
          width: input.width,
          unit: input.unit
        },
        existingIds
      );

    const editionMode = input.editionMode ?? "unique";

    const editions = (editionMode === "multiple" ? input.editions ?? [] : []).map(
      (draft, index) =>
        ({
          id: draft.id || `${id}-E${index + 1}`,
          artworkId: id,
          label: draft.label,
          kind: draft.kind,
          status: draft.status || "in_studio",
          notes: draft.notes ?? "",
          createdAt: now,
          updatedAt: now
        } satisfies Edition)
    );

    const editionLabelFor = (editionId?: string): string =>
      editions.find((edition) => edition.id === editionId)?.label ?? "";

    const movements = (input.movements ?? [])
      .filter((draft) => draft.type)
      .map((draft, index) =>
        buildMovement(draft, id, index, now, data, editionMode, editionLabelFor)
      );

    assertMovementRules(movements, editionMode);

    const gallery = data.contacts.find(
      (contact) => contact.id === input.galleryContactId
    );
    const latestSale = movements
      .filter((movement) => mapMovementToStatus(movement) === "sold")
      .sort(sortByDateDesc)[0];

    const status =
      editionMode === "unique"
        ? computeStatus(movements, input.status || "in_studio")
        : "per_copy";

    const artwork: Artwork = {
      id,
      title,
      series: input.series?.trim() ?? "",
      type: input.type,
      yearMade: (input.yearMade ?? "").replace(/[^0-9]/g, "").slice(0, 4),
      height: input.height ?? "",
      width: input.width ?? "",
      depth: input.depth ?? "",
      unit: input.unit ?? "cm",
      status,
      galleryContactId: status === "consigned" ? input.galleryContactId ?? "" : "",
      galleryName: status === "consigned" ? gallery?.name ?? "" : "",
      editionMode,
      editionPersonalCopies:
        editionMode === "multiple" ? input.editionPersonalCopies ?? "0" : "",
      editionSaleCopies:
        editionMode === "multiple" ? input.editionSaleCopies ?? "0" : "",
      soldPrice: editionMode === "unique" ? latestSale?.price ?? "" : "",
      soldDate: editionMode === "unique" ? latestSale?.date ?? "" : "",
      soldToContactId: editionMode === "unique" ? latestSale?.contactId ?? "" : "",
      soldToName: editionMode === "unique" ? latestSale?.contactName ?? "" : "",
      notes: input.notes ?? "",
      mainImageId: existing?.mainImageId ?? "",
      mainImagePath: "",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    data.artworks = upsertById(data.artworks, artwork);
    data.editions = [
      ...data.editions.filter((edition) => edition.artworkId !== id),
      ...editions
    ];
    data.movements = [
      ...data.movements.filter((movement) => movement.artworkId !== id),
      ...movements
    ];

    await this.persist(data);
    return this.load();
  }

  async saveExhibition(
    input: ExhibitionInput,
    artworkIds: string[] = [],
    listedPrices: Record<string, string> = {}
  ): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const title = input.title.trim();
    if (!title) throw new Error("El título de la exposición es obligatorio.");

    const existing = input.id
      ? data.exhibitions.find((item) => item.id === input.id)
      : undefined;
    const id = existing?.id ?? input.id ?? `EXH-${randomUUID().slice(0, 8)}`;

    const gallery = data.contacts.find(
      (contact) => contact.id === input.galleryContactId
    );
    const curatorContact = data.contacts.find(
      (contact) => contact.id === input.curatorContactId
    );
    const exhibition: Exhibition = {
      id,
      title,
      city: input.city ?? "",
      country: input.country ?? "",
      venue: input.venue ?? "",
      galleryContactId: input.galleryContactId ?? "",
      galleryName: gallery?.name ?? "",
      curatorContactId: input.curatorContactId ?? "",
      startDate: validateDate(input.startDate, "Fecha de inicio"),
      endDate: validateDate(input.endDate, "Fecha de fin"),
      curator: curatorContact?.name ?? input.curator ?? "",
      exhibitionType: input.exhibitionType ?? "group",
      comments: input.comments ?? "",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    data.exhibitions = upsertById(data.exhibitions, exhibition);

    const previousForExhibition = data.movements.filter(
      (movement) =>
        isExhibitionMovementType(movement.type) && movement.exhibitionId === id
    );
    const otherMovements = data.movements.filter(
      (movement) =>
        !(
          isExhibitionMovementType(movement.type) && movement.exhibitionId === id
        )
    );
    const linkedMovements: Movement[] = artworkIds.map((artworkId) => {
      const prior = previousForExhibition.find(
        (movement) => movement.artworkId === artworkId
      );
      const listedPrice = Object.prototype.hasOwnProperty.call(
        listedPrices,
        artworkId
      )
        ? listedPrices[artworkId] ?? ""
        : prior?.listedPrice ?? "";
      if (prior) {
        return {
          ...prior,
          type: prior.type || "exhibition",
          exhibitionTitle: title,
          date: exhibition.startDate || prior.date || "",
          listedPrice
        };
      }
      return {
        id: `MOV-${randomUUID().slice(0, 8)}`,
        artworkId,
        type: "exhibition",
        exhibitionId: id,
        exhibitionTitle: title,
        returned: false,
        keptAtGallery: false,
        date: exhibition.startDate ?? "",
        listedPrice,
        currency: "EUR",
        createdAt: now
      };
    });
    data.movements = [...otherMovements, ...linkedMovements];

    const affected = new Set<string>([
      ...artworkIds,
      ...previousForExhibition.map((movement) => movement.artworkId)
    ]);
    data.artworks = data.artworks.map((artwork) => {
      if (!affected.has(artwork.id) || artwork.editionMode !== "unique") return artwork;
      const movements = data.movements.filter((m) => m.artworkId === artwork.id);
      return { ...artwork, status: computeStatus(movements, artwork.status), updatedAt: now };
    });

    await this.persist(data);
    return this.load();
  }

  async deleteArtwork(artworkId: string): Promise<InventoryData> {
    const data = await this.load();
    data.artworks = data.artworks.filter((artwork) => artwork.id !== artworkId);
    data.editions = data.editions.filter((edition) => edition.artworkId !== artworkId);
    data.movements = data.movements.filter(
      (movement) => movement.artworkId !== artworkId
    );
    data.images = data.images.filter((image) => image.targetId !== artworkId);
    await this.persist(data);
    return this.load();
  }

  async deleteContact(contactId: string): Promise<InventoryData> {
    const data = await this.load();
    data.contacts = data.contacts.filter((contact) => contact.id !== contactId);
    await this.persist(data);
    return this.load();
  }

  async deleteExhibition(exhibitionId: string): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const affected = new Set(
      data.movements
        .filter(
          (movement) =>
            movement.exhibitionId === exhibitionId &&
            isExhibitionMovementType(movement.type)
        )
        .map((movement) => movement.artworkId)
    );
    data.exhibitions = data.exhibitions.filter((item) => item.id !== exhibitionId);
    data.movements = data.movements.filter(
      (movement) =>
        !(
          movement.exhibitionId === exhibitionId &&
          isExhibitionMovementType(movement.type)
        )
    );
    data.artworks = data.artworks.map((artwork) => {
      if (!affected.has(artwork.id) || artwork.editionMode !== "unique") return artwork;
      const movements = data.movements.filter((m) => m.artworkId === artwork.id);
      return { ...artwork, status: computeStatus(movements, "in_studio"), updatedAt: now };
    });
    await this.persist(data);
    return this.load();
  }

  async saveContact(input: ContactInput): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const kind = input.kind ?? "person";
    const name =
      (input.name ?? "").trim() ||
      [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
    if (!name) throw new Error("El nombre del contacto es obligatorio.");

    const existing =
      (input.id && data.contacts.find((contact) => contact.id === input.id)) ||
      data.contacts.find(
        (contact) =>
          contact.name.toLowerCase() === name.toLowerCase() && contact.kind === kind
      );

    const contact: Contact = {
      id: existing?.id ?? input.id ?? `CON-${randomUUID().slice(0, 8)}`,
      kind,
      name,
      firstName: input.firstName ?? "",
      lastName: input.lastName ?? "",
      birthday: input.birthday ?? "",
      job: input.job ?? "",
      relationship: input.relationship ?? "",
      phone: input.phone ?? "",
      email: input.email ?? "",
      website: input.website ?? "",
      location: input.location ?? "",
      city: input.city ?? "",
      country: input.country ?? "",
      firstContactYear: (input.firstContactYear ?? "").replace(/[^0-9]/g, "").slice(0, 4),
      comments: input.comments ?? "",
      galleristContactId: input.galleristContactId ?? existing?.galleristContactId ?? "",
      organizationId: input.organizationId ?? existing?.organizationId ?? "",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    data.contacts = upsertById(data.contacts, contact);
    await this.persist(data);
    return this.load();
  }

  async saveSettings(settings: AppSettings): Promise<InventoryData> {
    const data = await this.load();
    data.settings = normalizeSettings({
      ...data.settings,
      ...settings
    });
    await this.persist(data);
    return this.load();
  }

  async saveTextGeneratorExamples(
    examples: TextGeneratorExample[]
  ): Promise<InventoryData> {
    const data = await this.load();
    data.textGeneratorExamples = (examples ?? []).map((example, index) =>
      hydrateTextGeneratorExample(example, index)
    );
    await this.persist(data);
    return this.load();
  }

  async saveContactReminders(
    reminders: ContactReminder[]
  ): Promise<InventoryData> {
    const data = await this.load();
    data.contactReminders = (reminders ?? []).map((item, index) => {
      const hydrated = hydrateContactReminder(item, index);
      // Force a plain JSON-safe object so days/months cannot be dropped.
      return {
        id: hydrated.id,
        contactId: hydrated.contactId,
        channel: hydrated.channel,
        intervalValue: hydrated.intervalValue,
        intervalUnit: hydrated.intervalUnit,
        ...(hydrated.intervalUnit === "months"
          ? { intervalMonths: hydrated.intervalValue }
          : {}),
        note: hydrated.note ?? "",
        lastDoneAt: hydrated.lastDoneAt ?? "",
        createdAt: hydrated.createdAt,
        updatedAt: hydrated.updatedAt
      };
    });
    await this.persist(data);
    return this.load();
  }

  async saveInboxNotes(notes: InboxNote[]): Promise<InventoryData> {
    const data = await this.load();
    data.inboxNotes = (notes ?? []).map((item, index) =>
      hydrateInboxNote(item, index)
    );
    await this.persist(data);
    return this.load();
  }

  async saveInboxTodos(todos: InboxTodo[]): Promise<InventoryData> {
    const data = await this.load();
    data.inboxTodos = (todos ?? []).map((item, index) =>
      hydrateInboxTodo(item, index)
    );
    await this.persist(data);
    return this.load();
  }

  async saveExpense(input: ExpenseInput): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const existing = input.id
      ? data.expenses.find((expense) => expense.id === input.id)
      : undefined;
    const expense: Expense = {
      id: existing?.id ?? `EXP-${randomUUID().slice(0, 8)}`,
      category: input.category || "misc",
      amount: String(input.amount ?? "").trim(),
      date: validateDate(input.date, "Fecha del gasto") || "",
      note: String(input.note ?? "").trim(),
      contactId: input.contactId || "",
      exhibitionId: input.exhibitionId || "",
      receiptImageId: input.receiptImageId || existing?.receiptImageId || "",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    data.expenses = upsertById(data.expenses, expense);
    await this.persist(data);
    return this.load();
  }

  async deleteExpense(expenseId: string): Promise<InventoryData> {
    const data = await this.load();
    data.expenses = data.expenses.filter((expense) => expense.id !== expenseId);
    data.images = data.images.filter(
      (image) => !(image.targetType === "expense" && image.targetId === expenseId)
    );
    await this.persist(data);
    return this.load();
  }

  async saveSeriesInfo(input: SeriesInfoInput): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("La serie necesita un nombre.");
    const existing = input.id
      ? data.seriesInfo.find((item) => item.id === input.id)
      : data.seriesInfo.find(
          (item) => item.name.toLowerCase() === name.toLowerCase()
        );
    const texts = normalizeSeriesTexts(input.texts, input);
    const record: SeriesInfo = {
      id: existing?.id ?? `SER-${randomUUID().slice(0, 8)}`,
      name,
      texts,
      notes: String(input.notes ?? "").trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    data.seriesInfo = upsertById(data.seriesInfo, record);
    await this.persist(data);
    return this.load();
  }

  async deleteSeriesInfo(seriesId: string): Promise<InventoryData> {
    const data = await this.load();
    data.seriesInfo = data.seriesInfo.filter((item) => item.id !== seriesId);
    data.images = data.images.filter(
      (image) => !(image.targetType === "series" && image.targetId === seriesId)
    );
    await this.persist(data);
    return this.load();
  }

  async saveApplication(input: ApplicationInput): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const title = String(input.title ?? "").trim();
    if (!title) throw new Error("La solicitud necesita un título.");
    const existing = input.id
      ? data.applications.find((item) => item.id === input.id)
      : undefined;
    const record: Application = {
      id: existing?.id ?? `APP-${randomUUID().slice(0, 8)}`,
      title,
      kind: input.kind || "concurso",
      organization: String(input.organization ?? "").trim(),
      deadline: validateDate(input.deadline, "Fecha límite") || "",
      documentTitle: String(
        input.documentTitle ?? existing?.documentTitle ?? ""
      ).trim(),
      coverSubtitle: String(
        input.coverSubtitle ?? existing?.coverSubtitle ?? ""
      ).trim(),
      coverDate: String(input.coverDate ?? existing?.coverDate ?? "").trim(),
      coverNote: String(input.coverNote ?? existing?.coverNote ?? "").trim(),
      coverStyles: normalizeCoverStyles(
        input.coverStyles ?? existing?.coverStyles
      ),
      sectionHeadingStyle: normalizeCoverLineStyle(
        input.sectionHeadingStyle ?? existing?.sectionHeadingStyle
      ),
      sectionBodyStyle: normalizeCoverLineStyle(
        input.sectionBodyStyle ?? existing?.sectionBodyStyle
      ),
      coverImageId: "",
      sections: normalizeApplicationSections(input, existing),
      textAboutWorks: "",
      textAboutProject: "",
      headingAboutWorks: String(
        input.headingAboutWorks ?? existing?.headingAboutWorks ?? "Sobre las obras"
      ).trim(),
      headingAboutProject: String(
        input.headingAboutProject ??
          existing?.headingAboutProject ??
          "Sobre el proyecto"
      ).trim(),
      headingWorks: String(
        input.headingWorks ?? existing?.headingWorks ?? "Obras"
      ).trim(),
      language:
        input.language === "en" || input.language === "de" || input.language === "es"
          ? input.language
          : existing?.language || "es",
      tocWorksMode:
        input.tocWorksMode === "bySeries" ||
        input.tocWorksMode === "worksOnly" ||
        input.tocWorksMode === "list"
          ? input.tocWorksMode
          : existing?.tocWorksMode || "list",
      showToc:
        typeof input.showToc === "boolean"
          ? input.showToc
          : existing?.showToc !== false,
      headerArtistName: String(
        input.headerArtistName ?? existing?.headerArtistName ?? ""
      ).trim(),
      headerCompetition: String(
        input.headerCompetition ?? existing?.headerCompetition ?? ""
      ).trim(),
      artworkIds: uniquePreserveOrder(input.artworkIds),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    data.applications = upsertById(data.applications, record);
    await this.persist(data);
    return this.load();
  }

  async deleteApplication(applicationId: string): Promise<InventoryData> {
    const data = await this.load();
    data.applications = data.applications.filter(
      (item) => item.id !== applicationId
    );
    data.images = data.images.filter(
      (image) =>
        !(image.targetType === "application" && image.targetId === applicationId)
    );
    await this.persist(data);
    return this.load();
  }

  async savePriceList(input: PriceListDocInput): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const header = String(input.header ?? "").trim();
    const title =
      String(input.title ?? "").trim() || header || "Dossier de obras";
    const existing = input.id
      ? (data.priceLists ?? []).find((item) => item.id === input.id)
      : undefined;
    const mode =
      input.mode === "exhibition"
        ? "exhibition"
        : input.mode === "series"
          ? "series"
          : "free";
    const language =
      input.language === "en" || input.language === "de" || input.language === "es"
        ? input.language
        : existing?.language || "es";
    const priceOverrides = normalizePriceOverrides(
      input.priceOverrides ?? existing?.priceOverrides
    );
    const record: PriceListDoc = {
      id: existing?.id ?? `PL-${randomUUID().slice(0, 8)}`,
      title,
      mode,
      exhibitionId:
        mode === "exhibition"
          ? String(input.exhibitionId ?? existing?.exhibitionId ?? "").trim()
          : "",
      seriesName:
        mode === "series"
          ? String(input.seriesName ?? existing?.seriesName ?? "").trim()
          : "",
      artworkIds: uniquePreserveOrder(input.artworkIds),
      priceOverrides,
      header: header || title,
      subtitle: String(input.subtitle ?? "").trim(),
      leftHeader: String(input.leftHeader ?? "").trim(),
      rightHeader: String(input.rightHeader ?? "").trim(),
      introText: String(input.introText ?? existing?.introText ?? "").trim(),
      showPrice: input.showPrice !== false,
      priceBold: input.priceBold !== false,
      titleFontSize: clampFontSize(
        input.titleFontSize ?? existing?.titleFontSize,
        15
      ),
      textFontSize: clampFontSize(
        input.textFontSize ?? existing?.textFontSize,
        12.5
      ),
      priceFontSize: resolvePriceFontSize(input, existing),
      textBold: input.textBold === true,
      imagesPerPage: clampInt(input.imagesPerPage ?? existing?.imagesPerPage ?? 4, 1, 6),
      imageGap: clampInt(input.imageGap ?? existing?.imageGap ?? 16, 0, 120),
      frameBorderColor: normalizeHexColor(
        input.frameBorderColor ?? existing?.frameBorderColor,
        "#e4e4e4"
      ),
      language,
      showSeries: (input.showSeries ?? existing?.showSeries) !== false,
      seriesPrefix: optionalText(input.seriesPrefix ?? existing?.seriesPrefix, 120),
      pageNumbers: (input.pageNumbers ?? existing?.pageNumbers) === true,
      footerText: String(input.footerText ?? existing?.footerText ?? "").trim().slice(0, 300),
      fonts: {
        header: String(input.fonts?.header ?? existing?.fonts?.header ?? "Georgia").trim() || "Georgia",
        subtitle:
          String(input.fonts?.subtitle ?? existing?.fonts?.subtitle ?? "Georgia").trim() ||
          "Georgia",
        body: String(input.fonts?.body ?? existing?.fonts?.body ?? "Georgia").trim() || "Georgia"
      },
      headerStyle: {
        bold: input.headerStyle?.bold !== false,
        italic: input.headerStyle?.italic === true,
        color: normalizeHexColor(
          input.headerStyle?.color ?? existing?.headerStyle?.color,
          "#1c1c1c"
        )
      },
      subtitleStyle: {
        italic: input.subtitleStyle?.italic !== false,
        color: normalizeHexColor(
          input.subtitleStyle?.color ?? existing?.subtitleStyle?.color,
          "#555555"
        )
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    data.priceLists = upsertById(data.priceLists ?? [], record);
    await this.persist(data);
    return this.load();
  }

  async deletePriceList(priceListId: string): Promise<InventoryData> {
    const data = await this.load();
    data.priceLists = (data.priceLists ?? []).filter(
      (item) => item.id !== priceListId
    );
    await this.persist(data);
    return this.load();
  }

  async saveLookup(input: LookupInput): Promise<InventoryData> {
    const data = await this.load();
    const label = input.label.trim();
    const category = input.category.trim();
    if (!label || !category) throw new Error("Categoría y etiqueta obligatorias.");
    data.lookups = addLookupValues(data.lookups, [
      { category, value: input.value?.trim() || slugify(label), label }
    ]);
    await this.persist(data);
    return this.load();
  }

  async deleteLookup(input: LookupInput): Promise<InventoryData> {
    const data = await this.load();
    if (isDefaultLookup(input.category, input.value)) return this.load();
    data.lookups = data.lookups.filter(
      (lookup) =>
        !(
          lookup.category === input.category &&
          lookup.value.toLowerCase() === input.value.toLowerCase()
        )
    );
    await this.persist(data);
    return this.load();
  }

  // Reassign every record that still uses `fromValue` to a new value, then
  // delete the old lookup option. `assignments` maps a record id to the value
  // its field should take. Any affected record not listed keeps `fromValue`
  // untouched (so it is safe to call with a partial map).
  async reassignLookup(input: {
    category: string;
    fromValue: string;
    assignments: Array<{ id: string; value: string }>;
  }): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const map = new Map(input.assignments.map((a) => [a.id, a.value]));

    if (input.category === "artworkType") {
      data.artworks = data.artworks.map((artwork) =>
        map.has(artwork.id)
          ? { ...artwork, type: map.get(artwork.id) as Artwork["type"], updatedAt: now }
          : artwork
      );
    } else if (input.category === "movementType") {
      data.movements = data.movements.map((movement) =>
        map.has(movement.id)
          ? { ...movement, type: map.get(movement.id) as Movement["type"] }
          : movement
      );
    } else if (input.category === "exhibitionType") {
      data.exhibitions = data.exhibitions.map((exhibition) =>
        map.has(exhibition.id)
          ? { ...exhibition, exhibitionType: map.get(exhibition.id) ?? "", updatedAt: now }
          : exhibition
      );
    }

    if (!isDefaultLookup(input.category, input.fromValue)) {
      data.lookups = data.lookups.filter(
        (lookup) =>
          !(
            lookup.category === input.category &&
            lookup.value.toLowerCase() === input.fromValue.toLowerCase()
          )
      );
    }
    await this.persist(data);
    return this.load();
  }

  async importImage(
    sourcePath: string,
    targetType: "artwork" | "edition" | "exhibition" | "expense" | "series" | "application",
    targetId: string,
    category = "main"
  ): Promise<ImportedImage> {
    const extension = path.extname(sourcePath) || ".jpg";
    const data = await this.load();
    const now = new Date().toISOString();
    const relativePath = this.nextImportedRelativePath(
      targetType,
      targetId,
      extension
    );
    const destination = path.join(this.libraryPath, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    // Copy on disk — videos (.mov) are often hundreds of MB and must not
    // be loaded into RAM as a Buffer.
    await copyFile(sourcePath, destination);
    return this.registerImportedFile(
      data,
      now,
      relativePath,
      targetType,
      targetId,
      category,
      path.basename(sourcePath)
    );
  }

  async importImageFromDataUrl(
    dataUrl: string,
    targetType: "artwork" | "edition" | "exhibition" | "expense" | "series" | "application",
    targetId: string,
    category = "main",
    originalName = "foto.jpg"
  ): Promise<ImportedImage> {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(dataUrl.trim());
    if (!match) {
      throw new Error("La imagen editada no es válida.");
    }
    const mime = match[1].toLowerCase();
    const extension = mime.includes("png")
      ? ".png"
      : mime.includes("webp")
        ? ".webp"
        : ".jpg";
    const buffer = Buffer.from(match[2], "base64");
    const base =
      originalName.replace(/\.[^.]+$/, "").trim() || "foto";
    return this.importImageBuffer(
      buffer,
      extension,
      targetType,
      targetId,
      category,
      `${base}${extension}`
    );
  }

  private async importImageBuffer(
    buffer: Buffer,
    extension: string,
    targetType: "artwork" | "edition" | "exhibition" | "expense" | "series" | "application",
    targetId: string,
    category: string,
    originalName: string
  ): Promise<ImportedImage> {
    const data = await this.load();
    const now = new Date().toISOString();
    const relativePath = this.nextImportedRelativePath(
      targetType,
      targetId,
      extension
    );
    const destination = path.join(this.libraryPath, relativePath);

    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);

    return this.registerImportedFile(
      data,
      now,
      relativePath,
      targetType,
      targetId,
      category,
      originalName
    );
  }

  private nextImportedRelativePath(
    targetType: "artwork" | "edition" | "exhibition" | "expense" | "series" | "application",
    targetId: string,
    extension: string
  ): string {
    const folder =
      targetType === "edition"
        ? "images/editions"
        : targetType === "exhibition"
          ? "images/exhibitions"
          : targetType === "expense"
            ? "images/receipts"
            : targetType === "series"
              ? "images/series"
              : targetType === "application"
                ? "images/applications"
                : "images/originals";
    const ext = extension.startsWith(".") ? extension : `.${extension}`;
    return path.join(folder, `${targetId}-${Date.now()}${ext}`);
  }

  private async registerImportedFile(
    data: InventoryData,
    now: string,
    relativePath: string,
    targetType: "artwork" | "edition" | "exhibition" | "expense" | "series" | "application",
    targetId: string,
    category: string,
    originalName: string
  ): Promise<ImportedImage> {
    const image: ArtworkImage = {
      id: `IMG-${randomUUID().slice(0, 8)}`,
      targetType,
      targetId,
      category,
      relativePath,
      originalName,
      createdAt: now,
      ...(category === "extra" && /original/i.test(originalName)
        ? { caption: "Foto original" }
        : {})
    };

    if (category === "main" && targetType === "artwork") {
      // Overwrite: drop previous main (and any legacy history versions).
      // Keep "Foto original" extras untouched.
      data.images = data.images.filter(
        (item) =>
          !(
            item.targetType === targetType &&
            item.targetId === targetId &&
            (item.category === "main" || item.category === "history")
          )
      );
    } else if (category === "main" || category === "receipt" || category === "cover") {
      data.images = data.images.filter(
        (item) =>
          !(
            item.targetType === targetType &&
            item.targetId === targetId &&
            (item.category === category ||
              (category === "receipt" && item.category === "main") ||
              (category === "cover" && item.category === "main"))
          )
      );
    }

    if (
      category === "extra" &&
      /original/i.test(originalName)
    ) {
      // Keep the raw upload as the first additional image.
      const others = data.images.filter(
        (item) =>
          !(
            item.targetType === targetType &&
            item.targetId === targetId &&
            item.category === "extra"
          )
      );
      const existingExtras = data.images.filter(
        (item) =>
          item.targetType === targetType &&
          item.targetId === targetId &&
          item.category === "extra"
      );
      data.images = [...others, image, ...existingExtras];
    } else {
      data.images.push(image);
    }

    if (category === "main" && targetType === "artwork") {
      data.artworks = data.artworks.map((artwork) =>
        artwork.id === targetId
          ? { ...artwork, mainImageId: image.id, updatedAt: now }
          : artwork
      );
    }

    if (targetType === "expense") {
      data.expenses = data.expenses.map((expense) =>
        expense.id === targetId
          ? { ...expense, receiptImageId: image.id, updatedAt: now }
          : expense
      );
    }

    if (targetType === "application" && (category === "cover" || category === "main")) {
      data.applications = data.applications.map((app) =>
        app.id === targetId
          ? { ...app, coverImageId: image.id, updatedAt: now }
          : app
      );
    }

    await this.persist(data);
    return {
      image: withImagePath(image, this.libraryPath),
      inventory: await this.load()
    };
  }

  async markMovementReturned(movementId: string): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const target = data.movements.find((m) => m.id === movementId);
    data.movements = data.movements.map((m) =>
      m.id === movementId ? { ...m, returned: true, keptAtGallery: false } : m
    );
    if (target) {
      const movements = data.movements.filter((m) => m.artworkId === target.artworkId);
      data.artworks = data.artworks.map((artwork) =>
        artwork.id === target.artworkId && artwork.editionMode === "unique"
          ? { ...artwork, status: computeStatus(movements, "in_studio"), updatedAt: now }
          : artwork
      );
    }
    await this.persist(data);
    return this.load();
  }

  async updateImageCaption(imageId: string, caption: string): Promise<InventoryData> {
    const data = await this.load();
    data.images = data.images.map((image) =>
      image.id === imageId ? { ...image, caption } : image
    );
    await this.persist(data);
    return this.load();
  }

  async deleteImage(imageId: string): Promise<InventoryData> {
    const data = await this.load();
    const target = data.images.find((image) => image.id === imageId);
    data.images = data.images.filter((image) => image.id !== imageId);
    if (target?.category === "main" && target.targetType === "artwork") {
      data.artworks = data.artworks.map((artwork) =>
        artwork.mainImageId === imageId ? { ...artwork, mainImageId: "" } : artwork
      );
    }
    await this.persist(data);
    return this.load();
  }

  async addExhibitionSale(
    exhibitionId: string,
    artworkId: string,
    price = "",
    contactId = "",
    date = ""
  ): Promise<InventoryData> {
    const data = await this.load();
    const artwork = data.artworks.find((item) => item.id === artworkId);
    if (!artwork) throw new Error("Obra no encontrada.");
    const existingForArt = data.movements.filter((m) => m.artworkId === artworkId);
    if (artwork.editionMode === "unique" && countSales(existingForArt) > 0) {
      throw new Error(
        "Esta obra ya está vendida. No se puede registrar otra venta."
      );
    }
    const now = new Date().toISOString();
    const exhibition = data.exhibitions.find((item) => item.id === exhibitionId);
    const contact = data.contacts.find((item) => item.id === contactId);
    data.movements = [
      ...data.movements,
      {
        id: `MOV-${randomUUID().slice(0, 8)}`,
        artworkId,
        type: "sale",
        recipientType: contact?.kind ?? "person",
        contactId,
        contactName: contact?.name ?? "",
        exhibitionId,
        exhibitionTitle: exhibition?.title ?? "",
        context: "exhibition",
        returned: false,
        keptAtGallery: false,
        date: validateDate(date, "Fecha de venta") || exhibition?.startDate || "",
        price,
        currency: "EUR",
        createdAt: now
      }
    ];
    if (artwork.editionMode === "unique") {
      const movements = data.movements.filter((m) => m.artworkId === artworkId);
      const latestSale = movements
        .filter((movement) => mapMovementToStatus(movement) === "sold")
        .sort(sortByDateDesc)[0];
      data.artworks = data.artworks.map((item) =>
        item.id === artworkId
          ? {
              ...item,
              status: computeStatus(movements, item.status),
              soldPrice: latestSale?.price ?? item.soldPrice ?? "",
              soldDate: latestSale?.date ?? item.soldDate ?? "",
              soldToContactId: latestSale?.contactId ?? item.soldToContactId ?? "",
              soldToName: latestSale?.contactName ?? item.soldToName ?? "",
              updatedAt: now
            }
          : item
      );
    }
    await this.persist(data);
    return this.load();
  }

  private async persist(data: InventoryData): Promise<void> {
    const compacted = compactData(data);
    // JSON is the source of truth: reliable, in-place updates.
    await this.writeJson(compacted);
    // The Excel file is a best-effort, human-readable mirror; never block on it.
    await this.exportWorkbook(compacted).catch(() => undefined);
  }

  private async exportWorkbook(compacted: InventoryData): Promise<void> {
    const workbook = createEmptyWorkbook();

    replaceSheetRows(workbook, "Artworks", compacted.artworks);
    replaceSheetRows(workbook, "Editions", compacted.editions);
    replaceSheetRows(workbook, "Movements", compacted.movements);
    replaceSheetRows(workbook, "Exhibitions", compacted.exhibitions);
    replaceSheetRows(workbook, "Contacts", compacted.contacts);
    replaceSheetRows(
      workbook,
      "Images",
      compacted.images.map(({ absolutePath, ...image }) => image)
    );
    replaceSheetRows(workbook, "Lookups", compacted.lookups);

    await saveWorkbook(this.libraryPath, workbook);
  }
}

function buildMovement(
  draft: NonNullable<ArtworkInput["movements"]>[number],
  artworkId: string,
  index: number,
  now: string,
  data: InventoryData,
  editionMode: string,
  editionLabelFor: (editionId?: string) => string
): Movement {
  const contact = data.contacts.find((item) => item.id === draft.contactId);
  const exhibition = data.exhibitions.find((item) => item.id === draft.exhibitionId);
  const slug = slugify(draft.type);
  const isExhibition = slug === "exhibition" || slug === "exposicion";
  const isLoan = slug === "loan" || slug === "prestamo";
  return {
    id: draft.id || `MOV-${randomUUID().slice(0, 8)}-${index}`,
    artworkId,
    editionId: editionMode === "multiple" ? draft.editionId ?? "" : "",
    editionLabel: editionMode === "multiple" ? editionLabelFor(draft.editionId) : "",
    type: draft.type,
    recipientType: draft.recipientType ?? "person",
    contactId: draft.contactId ?? "",
    contactName: contact?.name ?? "",
    exhibitionId: draft.exhibitionId ?? "",
    exhibitionTitle: exhibition?.title ?? "",
    context: draft.context ?? "",
    returned: isExhibition || isLoan ? draft.returned ?? false : false,
    keptAtGallery: isExhibition ? draft.keptAtGallery ?? false : false,
    date: validateDate(draft.date, "Fecha de movimiento"),
    endDate: isLoan && !draft.indefinite ? validateDate(draft.endDate, "Fecha de fin") : "",
    indefinite: isLoan ? draft.indefinite ?? false : false,
    price: draft.price ?? "",
    received: draft.received ?? "",
    listedPrice: draft.listedPrice ?? "",
    taxCharged:
      slug === "sale" || slug === "venta"
        ? draft.taxCharged !== false
        : undefined,
    currency: draft.currency ?? "EUR",
    notes: draft.notes ?? "",
    createdAt: now
  };
}

function mapMovementToStatus(movement: Movement): string {
  switch (slugify(movement.type)) {
    case "sale":
    case "venta":
      return "sold";
    case "payment":
    case "pago":
      return "payment_gallery";
    case "gift":
    case "regalo":
      return "gifted";
    case "lost":
    case "perdido":
    case "perdida":
      return "lost";
    case "loan":
    case "prestamo":
      return movement.returned ? "in_studio" : "loaned";
    case "exhibition":
    case "exposicion":
      return movement.returned
        ? "in_studio"
        : movement.keptAtGallery
          ? "post_show_gallery"
          : "in_exhibition";
    default:
      return "";
  }
}

function isTerminalMovementType(type: string): boolean {
  const slug = slugify(type);
  return (
    slug === "sale" ||
    slug === "venta" ||
    slug === "payment" ||
    slug === "pago" ||
    slug === "lost" ||
    slug === "perdido" ||
    slug === "perdida"
  );
}

function assertMovementRules(
  movements: Movement[],
  editionMode: EditionMode
): void {
  for (const movement of movements) {
    if (!movement.date?.trim()) {
      throw new Error("Cada movimiento necesita una fecha.");
    }
  }
  assertNoDuplicateSales(movements, editionMode);

  if (editionMode !== "unique") return;

  const terminals = movements
    .filter((movement) => isTerminalMovementType(movement.type))
    .sort(sortByDateDesc);
  if (terminals.length > 1) {
    throw new Error(
      "Solo puede haber una salida definitiva (venta, pago a galerista o pérdida)."
    );
  }
  const terminal = terminals[0];
  if (!terminal) return;
  const terminalMs = dateValue(terminal);
  for (const movement of movements) {
    if (movement.id === terminal.id) continue;
    if (dateValue(movement) > terminalMs) {
      throw new Error(
        "No puede haber movimientos después de una venta, pago a galerista o pérdida."
      );
    }
  }
}

function isSaleMovement(type: string): boolean {
  const slug = slugify(type);
  return slug === "sale" || slug === "venta";
}

function countSales(movements: Movement[]): number {
  return movements.filter((movement) => isSaleMovement(movement.type)).length;
}

function assertNoDuplicateSales(
  movements: Movement[],
  editionMode: EditionMode
): void {
  const sales = movements.filter((movement) => isSaleMovement(movement.type));
  if (editionMode === "unique") {
    if (sales.length > 1) {
      throw new Error(
        "Una obra única solo puede tener una venta. Quita la venta anterior antes de registrar otra."
      );
    }
    return;
  }
  const seen = new Set<string>();
  for (const sale of sales) {
    const key = sale.editionId?.trim() || "__whole__";
    if (seen.has(key)) {
      throw new Error(
        "Esta copia (o la obra entera) ya tiene una venta registrada."
      );
    }
    seen.add(key);
  }
}

function computeStatus(movements: Movement[], fallback: string): string {
  const sorted = [...movements].sort(sortByDateDesc);
  for (const movement of sorted) {
    const status = mapMovementToStatus(movement);
    if (status) return status;
  }
  return fallback || "in_studio";
}

function effectiveStatus(
  movements: Movement[],
  exhibitionsById: Map<string, Exhibition>,
  today: Date,
  fallback: string
): string {
  const todayMs = today.getTime();
  const sorted = [...movements].sort(sortByDateDesc);
  for (const movement of sorted) {
    if (slugify(movement.type) === "exhibition" || slugify(movement.type) === "exposicion") {
      const exhibition = movement.exhibitionId
        ? exhibitionsById.get(movement.exhibitionId)
        : undefined;
      const start = parseDateMs(exhibition?.startDate);
      const end = parseDateMs(exhibition?.endDate);
      if (Number.isFinite(start)) {
        if (todayMs < (start as number)) continue; // exhibition has not started yet
        const endMs = Number.isFinite(end) ? (end as number) : (start as number);
        if (todayMs <= endMs + DAY_MS) return "in_exhibition"; // currently on show
        return movement.returned ? "in_studio" : "post_show_gallery";
      }
      const mapped = mapMovementToStatus(movement);
      if (mapped) return mapped;
      continue;
    }
    const status = mapMovementToStatus(movement);
    if (status) return status;
  }
  return fallback || "in_studio";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateMs(value?: string): number {
  if (!value || !/^\d{2}-\d{2}-\d{4}$/.test(value)) return NaN;
  const [day, month, year] = value.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
}

function isMeaningful(value: string | undefined, headerWord: string): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return text.length > 0 && text !== headerWord;
}

function compactData(data: InventoryData): InventoryData {
  const artworks = sanitizeArtworks(data.artworks);
  const artworkIds = new Set(artworks.map((artwork) => artwork.id));
  const exhibitionIdSet = new Set(
    data.exhibitions
      .filter((item) => isMeaningful(item.title, "title"))
      .map((item) => item.id)
  );
  const expenses = dedupeBy(data.expenses ?? [], (expense) => expense.id);
  const expenseIds = new Set(expenses.map((expense) => expense.id));
  const seriesInfo = dedupeBy(data.seriesInfo ?? [], (item) => item.id);
  const seriesIds = new Set(seriesInfo.map((item) => item.id));
  const applications = dedupeBy(data.applications ?? [], (item) => item.id);
  const applicationIds = new Set(applications.map((item) => item.id));
  const priceLists = dedupeBy(data.priceLists ?? [], (item) => item.id);
  const cleanImages = dedupeImages(
    data.images.filter((image) => {
      // Drop legacy retouch history — only main + original extras are kept.
      if (image.category === "history") return false;
      if (image.targetType === "artwork") return artworkIds.has(image.targetId);
      if (image.targetType === "exhibition")
        return exhibitionIdSet.has(image.targetId);
      if (image.targetType === "expense") return expenseIds.has(image.targetId);
      if (image.targetType === "series") return seriesIds.has(image.targetId);
      if (image.targetType === "application")
        return applicationIds.has(image.targetId);
      return true;
    })
  );
  const mainImageByArtwork = new Map<string, ArtworkImage>();
  cleanImages
    .filter((image) => image.targetType === "artwork" && image.category === "main")
    .forEach((image) => mainImageByArtwork.set(image.targetId, image));

  const exhibitionArtworkIds = new Map<string, string[]>();
  data.movements
    .filter((movement) => movement.exhibitionId && artworkIds.has(movement.artworkId))
    .forEach((movement) => {
      const list = exhibitionArtworkIds.get(movement.exhibitionId!) ?? [];
      if (!list.includes(movement.artworkId)) list.push(movement.artworkId);
      exhibitionArtworkIds.set(movement.exhibitionId!, list);
    });
  const exhibitionImagePaths = new Map<string, string[]>();
  cleanImages
    .filter((image) => image.targetType === "exhibition")
    .forEach((image) => {
      const list = exhibitionImagePaths.get(image.targetId) ?? [];
      list.push(image.relativePath);
      exhibitionImagePaths.set(image.targetId, list);
    });

  const exhibitions = dedupeBy(
    data.exhibitions.filter((item) => isMeaningful(item.title, "title")),
    (item) => item.id
  ).map((item) => ({
    ...item,
    artworkIds: (exhibitionArtworkIds.get(item.id) ?? []).join(", "),
    imagePaths: (exhibitionImagePaths.get(item.id) ?? []).join(", ")
  }));
  const exhibitionsById = new Map(exhibitions.map((item) => [item.id, item]));
  const exhibitionTitles = new Map(exhibitions.map((item) => [item.id, item.title]));
  const contacts = dedupeBy(
    data.contacts.filter((contact) => isMeaningful(contact.name, "name")),
    (contact) => contact.id || `${contact.name.toLowerCase()}|${contact.kind}`
  );
  const contactNames = new Map(contacts.map((contact) => [contact.id, contact.name]));

  const today = new Date();
  const decoratedArtworks = artworks.map((artwork) => {
    const main = artwork.mainImageId
      ? cleanImages.find((image) => image.id === artwork.mainImageId)
      : mainImageByArtwork.get(artwork.id);
    const ownMovements = data.movements.filter(
      (movement) => movement.artworkId === artwork.id
    );
    const status =
      artwork.editionMode === "unique"
        ? effectiveStatus(ownMovements, exhibitionsById, today, artwork.status)
        : artwork.status;
    return {
      ...artwork,
      status,
      depth: artwork.depth ?? "",
      mainImageId: main?.id ?? "",
      mainImagePath: main?.relativePath ?? ""
    };
  });

  return {
    ...data,
    artworks: decoratedArtworks,
    editions: dedupeBy(
      data.editions.filter((edition) => artworkIds.has(edition.artworkId)),
      (edition) => edition.id
    ),
    movements: dedupeBy(
      data.movements.filter((movement) => artworkIds.has(movement.artworkId)),
      (movement) => movement.id
    ).map((movement) => ({
      ...movement,
      contactName: movement.contactId
        ? contactNames.get(movement.contactId) ?? movement.contactName ?? ""
        : "",
      exhibitionTitle: movement.exhibitionId
        ? exhibitionTitles.get(movement.exhibitionId) ?? movement.exhibitionTitle ?? ""
        : ""
    })),
    exhibitions,
    contacts,
    images: cleanImages,
    expenses,
    seriesInfo,
    applications,
    priceLists,
    lookups: uniqueLookups(data.lookups)
  };
}

function dedupeBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const byKey = new Map<string, T>();
  items.forEach((item) => {
    const key = keyFor(item);
    if (!key) return;
    byKey.set(key, item);
  });
  return [...byKey.values()];
}

function dedupeImages(images: ArtworkImage[]): ArtworkImage[] {
  const nonMain = dedupeBy(
    images.filter((image) => image.category !== "main"),
    (image) =>
      image.id ||
      `${image.targetType}|${image.targetId}|${image.category}|${image.relativePath}`
  );
  const latestMain = new Map<string, ArtworkImage>();
  images
    .filter((image) => image.category === "main")
    .forEach((image) =>
      latestMain.set(`${image.targetType}|${image.targetId}`, image)
    );
  return [...nonMain, ...latestMain.values()];
}

function sanitizeArtworks(artworks: Artwork[]): Artwork[] {
  const seen = new Set<string>();
  return artworks
    .filter((artwork) => {
      const title = String(artwork.title ?? "").trim().toLowerCase();
      const id = String(artwork.id ?? "").trim().toLowerCase();
      if (!title || title === "title" || id === "id") return false;
      return true;
    })
    .filter((artwork) => {
      if (!artwork.id) return true;
      if (seen.has(artwork.id)) return false;
      seen.add(artwork.id);
      return true;
    });
}

type DataFile =
  | { kind: "ok"; raw: Partial<InventoryData> }
  | { kind: "missing" }
  | { kind: "unreadable" };

async function readDataFile(filePath: string): Promise<DataFile> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return { kind: (await exists(filePath)) ? "unreadable" : "missing" };
  }
  try {
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { kind: "unreadable" };
    return { kind: "ok", raw: raw as Partial<InventoryData> };
  } catch {
    return { kind: "unreadable" };
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function defaultSettings(): AppSettings {
  // Clean install: no size bands, factors or tax rates. The user configures
  // those under «Factores y precios» — never seed sample size data.
  // Fixed technique prices (e.g. Ipad Drawings = 250) come from the built-in
  // defaults and can be edited later; they are not size-factor bands.
  return {
    sizeTypes: [],
    taxRates: [],
    fixedTypePrices: DEFAULT_FIXED_TYPE_PRICES.map((p) => ({
      typeValue: p.typeValue,
      prices: p.prices.map((period) => ({ ...period }))
    })),
    textGeneratorSystemPrompt: DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT
  };
}

function normalizeSettings(raw: Partial<AppSettings> | undefined): AppSettings {
  const base = defaultSettings();
  if (!raw) return base;
  const sizeTypes = Array.isArray(raw.sizeTypes)
    ? raw.sizeTypes.map((type, index) => ({
        id: type.id || `st-${index}`,
        label: typeof type.label === "string" ? type.label : "",
        fromSum: Number(type.fromSum) || 0,
        toSum: Number(type.toSum) || 0,
        factors: Array.isArray(type.factors)
          ? type.factors.map((period, pIndex) => ({
              id: period.id || `st-${index}-f-${pIndex}`,
              from: String(period.from ?? "").trim(),
              factor: Number(period.factor) || 0
            }))
          : []
      }))
    : [];
  const taxRates = Array.isArray(raw.taxRates)
    ? raw.taxRates.map((tax, index) => ({
        id: tax.id || `tax-${index}`,
        country: String(tax.country ?? "").trim(),
        rate: Number(tax.rate) || 0,
        from: String(tax.from ?? "").trim()
      }))
    : [];
  const storedFixed = Array.isArray(raw.fixedTypePrices)
    ? raw.fixedTypePrices
        .map((item, index) => {
          const typeValue = String(item.typeValue ?? "").trim();
          if (!typeValue) return null;
          // New shape: prices[] timeline. Legacy shape: single `price` number.
          const legacy = item as FixedTypePrice & { price?: number };
          let prices: FixedTypePrice["prices"] = [];
          if (Array.isArray(legacy.prices) && legacy.prices.length > 0) {
            prices = legacy.prices.map((period, pIndex) => ({
              id: period.id || `fp-${index}-${pIndex}`,
              from: String(period.from ?? "").trim(),
              price: Number(period.price) || 0
            }));
          } else if (Number(legacy.price) > 0) {
            prices = [
              {
                id: `fp-${index}-legacy`,
                from: "",
                price: Number(legacy.price)
              }
            ];
          }
          prices = prices.filter((p) => p.price > 0);
          if (prices.length === 0) return null;
          return { typeValue, prices };
        })
        .filter((item): item is FixedTypePrice => item != null)
    : [];
  // Keep saved overrides; fill in any built-in technique that is still missing.
  const fixedByType = new Map(storedFixed.map((p) => [p.typeValue, p]));
  for (const def of DEFAULT_FIXED_TYPE_PRICES) {
    if (!fixedByType.has(def.typeValue)) {
      fixedByType.set(def.typeValue, {
        typeValue: def.typeValue,
        prices: def.prices.map((p) => ({ ...p }))
      });
    }
  }
  const seenSeries = new Set<string>();
  const seriesPricePercents = (Array.isArray(raw.seriesPricePercents) ? raw.seriesPricePercents : [])
    .map((item) => ({
      series: String(item?.series ?? "").trim(),
      percent: Math.round((Number(item?.percent) || 0) * 10) / 10
    }))
    .filter((item) => {
      const key = item.series.toLowerCase();
      if (!item.series || item.percent <= 0 || item.percent > 1000 || seenSeries.has(key)) {
        return false;
      }
      seenSeries.add(key);
      return true;
    });
  const prompt =
    typeof raw.textGeneratorSystemPrompt === "string"
      ? raw.textGeneratorSystemPrompt.trim()
      : "";
  return {
    // Keep whatever is stored — including an empty list. Never re-seed size defaults.
    sizeTypes,
    taxRates,
    fixedTypePrices: [...fixedByType.values()],
    seriesPricePercents,
    textGeneratorSystemPrompt:
      prompt || base.textGeneratorSystemPrompt || DEFAULT_TEXT_GENERATOR_SYSTEM_PROMPT
  };
}

function emptyInventory(libraryPath: string): InventoryData {
  return {
    libraryPath,
    artworks: [],
    editions: [],
    movements: [],
    exhibitions: [],
    contacts: [],
    images: [],
    lookups: [...DEFAULT_LOOKUPS],
    expenses: [],
    seriesInfo: [],
    applications: [],
    priceLists: [],
    textGeneratorExamples: [],
    contactReminders: [],
    inboxNotes: [],
    inboxTodos: [],
    settings: defaultSettings()
  };
}

/**
 * A hand-picked status was briefly possible in a pre-release build. Status is
 * movement-only again: drop the old value and recompute what was stored.
 */
function dropManualStatus(artworks: Artwork[], movements: Movement[]): Artwork[] {
  return artworks.map((artwork) => {
    const legacy = artwork as Artwork & { manualStatus?: string };
    if (!("manualStatus" in legacy)) return artwork;
    const { manualStatus: _dropped, ...rest } = legacy;
    if (!_dropped || artwork.editionMode !== "unique") return rest;
    const own = movements.filter((movement) => movement.artworkId === artwork.id);
    return { ...rest, status: computeStatus(own, "in_studio") };
  });
}

function normalizeRaw(
  raw: Partial<InventoryData>,
  libraryPath: string
): InventoryData {
  const movements = (raw.movements ?? []).map(hydrateMovement);
  return {
    libraryPath,
    artworks: dropManualStatus(raw.artworks ?? [], movements),
    editions: raw.editions ?? [],
    movements,
    exhibitions: raw.exhibitions ?? [],
    contacts: raw.contacts ?? [],
    images: raw.images ?? [],
    lookups: uniqueLookups(raw.lookups ?? []),
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    seriesInfo: Array.isArray(raw.seriesInfo)
      ? raw.seriesInfo.map((item, index) => hydrateSeriesInfo(item, index))
      : [],
    applications: Array.isArray(raw.applications)
      ? raw.applications.map((item, index) => hydrateApplication(item, index))
      : [],
    priceLists: Array.isArray(raw.priceLists)
      ? raw.priceLists.map((item, index) => hydratePriceList(item, index))
      : [],
    textGeneratorExamples: Array.isArray(raw.textGeneratorExamples)
      ? raw.textGeneratorExamples.map((item, index) =>
          hydrateTextGeneratorExample(item, index)
        )
      : [],
    contactReminders: Array.isArray(raw.contactReminders)
      ? raw.contactReminders.map((item, index) =>
          hydrateContactReminder(item, index)
        )
      : [],
    inboxNotes: Array.isArray(raw.inboxNotes)
      ? raw.inboxNotes.map((item, index) => hydrateInboxNote(item, index))
      : [],
    inboxTodos: Array.isArray(raw.inboxTodos)
      ? raw.inboxTodos.map((item, index) => hydrateInboxTodo(item, index))
      : [],
    settings: normalizeSettings(raw.settings)
  };
}

function hydrateTextGeneratorExample(
  item: Partial<TextGeneratorExample>,
  index: number
): TextGeneratorExample {
  return {
    id: String(item.id || `example-${index}`),
    topic: String(item.topic ?? item.title ?? "").trim(),
    body: String(item.body ?? item.text ?? ""),
    category: String(item.category ?? "").trim()
  };
}

function hydrateContactReminder(
  item: Partial<ContactReminder>,
  index: number
): ContactReminder {
  const channel: ReminderChannel = String(item.channel ?? "").trim() || "email";
  const explicitUnit = String(item.intervalUnit ?? "")
    .trim()
    .toLowerCase();

  let unit: ReminderIntervalUnit;
  if (explicitUnit === "days" || explicitUnit === "day") {
    unit = "days";
  } else if (explicitUnit === "months" || explicitUnit === "month") {
    unit = "months";
  } else if (
    item.intervalValue != null &&
    Number.isFinite(Number(item.intervalValue)) &&
    (item.intervalMonths == null || item.intervalMonths === undefined)
  ) {
    // Newer payloads sometimes omit unit but send intervalValue for days.
    unit = "days";
  } else {
    unit = "months";
  }

  const preferValue =
    unit === "days"
      ? item.intervalValue ?? item.intervalMonths
      : item.intervalValue ?? item.intervalMonths;
  const rawValue = Number(preferValue);
  const intervalValue = Math.max(
    1,
    Math.round(Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1)
  );

  const out: ContactReminder = {
    id: String(item.id || `REM-${index}`),
    contactId: String(item.contactId ?? "").trim(),
    channel,
    intervalValue,
    intervalUnit: unit,
    note: String(item.note ?? "").trim(),
    lastDoneAt: String(item.lastDoneAt ?? "").trim(),
    createdAt: String(item.createdAt ?? new Date().toISOString()),
    updatedAt: String(item.updatedAt ?? item.createdAt ?? new Date().toISOString())
  };
  // Only month-based reminders keep the legacy mirror field.
  if (unit === "months") {
    out.intervalMonths = intervalValue;
  }
  return out;
}

function hydrateInboxNote(
  item: Partial<InboxNote>,
  index: number
): InboxNote {
  const raw = String(item.body ?? "");
  const body = /<\/?[a-z][\s\S]*>/i.test(raw)
    ? sanitizeStoredNoteHtml(raw)
    : raw.trim();
  return {
    id: String(item.id || `NOTE-${index}`),
    body,
    createdAt: String(item.createdAt ?? new Date().toISOString())
  };
}

/** Main-process sanitizer (keep in sync with renderer note tags). */
function sanitizeStoredNoteHtml(html: string): string {
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
  return out.trim();
}

function hydrateInboxTodo(
  item: Partial<InboxTodo>,
  index: number
): InboxTodo {
  const dueRaw = String(item.dueDate ?? "").trim();
  const dueDate = /^\d{2}-\d{2}-\d{4}$/.test(dueRaw) ? dueRaw : "";
  return {
    id: String(item.id || `TODO-${index}`),
    body: String(item.body ?? "").trim(),
    doneAt: String(item.doneAt ?? "").trim(),
    dueDate,
    createdAt: String(item.createdAt ?? new Date().toISOString())
  };
}

function uniquePreserveOrder(ids: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeCoverLineStyle(raw: unknown): CoverLineStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const item = raw as CoverLineStyle;
  const font = String(item.font ?? "").trim().slice(0, 80);
  const sizeRaw = Number(item.sizePt);
  const sizePt =
    Number.isFinite(sizeRaw) && sizeRaw >= 6 && sizeRaw <= 96
      ? Math.round(sizeRaw * 10) / 10
      : undefined;
  const out: CoverLineStyle = {};
  if (font) out.font = font;
  if (sizePt != null) out.sizePt = sizePt;
  if (item.bold === true) out.bold = true;
  if (item.bold === false) out.bold = false;
  if (item.italic === true) out.italic = true;
  if (item.italic === false) out.italic = false;
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeCoverStyles(raw: unknown): ApplicationCoverStyles | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const item = raw as ApplicationCoverStyles;
  const out: ApplicationCoverStyles = {};
  const above = normalizeCoverLineStyle(item.above);
  const title = normalizeCoverLineStyle(item.title);
  const below = normalizeCoverLineStyle(item.below);
  const belowRight = normalizeCoverLineStyle(item.belowRight);
  const second = normalizeCoverLineStyle(item.second);
  if (above) out.above = above;
  if (title) out.title = title;
  if (below) out.below = below;
  if (belowRight) out.belowRight = belowRight;
  if (second) out.second = second;
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeApplicationSections(
  input: ApplicationInput,
  existing?: Application
): ApplicationTextSection[] {
  if (Array.isArray(input.sections) && input.sections.length > 0) {
    return input.sections.map((section, index) => ({
      id: section.id || `sec-${index}`,
      heading: String(section.heading ?? "").trim(),
      bodyHtml: String(section.bodyHtml ?? "")
    }));
  }
  if (existing?.sections?.length) {
    return existing.sections.map((section, index) => ({
      id: section.id || `sec-${index}`,
      heading: String(section.heading ?? "").trim(),
      bodyHtml: String(section.bodyHtml ?? "")
    }));
  }
  const legacy: ApplicationTextSection[] = [];
  const aboutWorks =
    input.textAboutWorks ?? existing?.textAboutWorks ?? "";
  const aboutProject =
    input.textAboutProject ?? existing?.textAboutProject ?? "";
  if (String(aboutWorks).trim()) {
    legacy.push({
      id: "sec-legacy-works",
      heading: String(
        input.headingAboutWorks ?? existing?.headingAboutWorks ?? "Sobre las obras"
      ).trim(),
      bodyHtml: `<p>${String(aboutWorks)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>")}</p>`
    });
  }
  if (String(aboutProject).trim()) {
    legacy.push({
      id: "sec-legacy-project",
      heading: String(
        input.headingAboutProject ??
          existing?.headingAboutProject ??
          "Sobre el proyecto"
      ).trim(),
      bodyHtml: `<p>${String(aboutProject)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>")}</p>`
    });
  }
  return legacy;
}

function hydrateApplication(
  item: Partial<Application>,
  index: number
): Application {
  const sections = normalizeApplicationSections(
    {
      title: item.title || "",
      kind: item.kind || "concurso",
      sections: item.sections,
      textAboutWorks: item.textAboutWorks,
      textAboutProject: item.textAboutProject,
      headingAboutWorks: item.headingAboutWorks,
      headingAboutProject: item.headingAboutProject,
      artworkIds: item.artworkIds || []
    },
    undefined
  );
  return {
    id: item.id || `APP-${index}`,
    title: String(item.title ?? "").trim(),
    kind: item.kind || "concurso",
    organization: item.organization || "",
    deadline: item.deadline || "",
    documentTitle: item.documentTitle || "",
    coverSubtitle: item.coverSubtitle || "",
    coverDate: item.coverDate || "",
    coverNote: item.coverNote || "",
    coverStyles: normalizeCoverStyles(item.coverStyles),
    sectionHeadingStyle: normalizeCoverLineStyle(item.sectionHeadingStyle),
    sectionBodyStyle: normalizeCoverLineStyle(item.sectionBodyStyle),
    coverImageId: "",
    sections,
    textAboutWorks: "",
    textAboutProject: "",
    headingAboutWorks: item.headingAboutWorks || "Sobre las obras",
    headingAboutProject: item.headingAboutProject || "Sobre el proyecto",
    headingWorks: item.headingWorks || "Obras",
    language: item.language === "en" || item.language === "de" ? item.language : "es",
    tocWorksMode:
      item.tocWorksMode === "bySeries" || item.tocWorksMode === "worksOnly"
        ? item.tocWorksMode
        : "list",
    showToc: item.showToc !== false,
    headerArtistName: String(item.headerArtistName ?? "").trim(),
    headerCompetition: String(item.headerCompetition ?? "").trim(),
    artworkIds: uniquePreserveOrder(item.artworkIds),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeHexColor(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim();
  const hex = raw.replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : fallback;
}

function clampFontSize(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(36, Math.max(8, Math.round(n * 2) / 2));
}

function resolvePriceFontSize(
  item: { priceFontSize?: number; priceSize?: string },
  existing?: { priceFontSize?: number; priceSize?: string }
): number {
  const raw = item.priceFontSize ?? existing?.priceFontSize;
  if (raw != null && Number.isFinite(Number(raw))) {
    return clampFontSize(raw, 15);
  }
  const legacy = item.priceSize ?? existing?.priceSize;
  if (legacy === "text") return 12.5;
  if (legacy === "large") return 18;
  return 15;
}

function hydratePriceList(
  item: Partial<PriceListDoc>,
  index: number
): PriceListDoc {
  const mode =
    item.mode === "exhibition"
      ? "exhibition"
      : item.mode === "series"
        ? "series"
        : "free";
  const header = String(item.header ?? "").trim();
  const title = String(item.title ?? "").trim() || header || "Dossier de obras";
  return {
    id: item.id || `PL-${index}`,
    title,
    mode,
    exhibitionId: mode === "exhibition" ? String(item.exhibitionId ?? "").trim() : "",
    seriesName: mode === "series" ? String(item.seriesName ?? "").trim() : "",
    artworkIds: uniquePreserveOrder(item.artworkIds),
    priceOverrides: normalizePriceOverrides(item.priceOverrides),
    header: header || title,
    subtitle: String(item.subtitle ?? "").trim(),
    leftHeader: String(item.leftHeader ?? "").trim(),
    rightHeader: String(item.rightHeader ?? "").trim(),
    introText: String(item.introText ?? "").trim(),
    showPrice: item.showPrice !== false,
    priceBold: item.priceBold !== false,
    titleFontSize: clampFontSize(item.titleFontSize, 15),
    textFontSize: clampFontSize(item.textFontSize, 12.5),
    priceFontSize: resolvePriceFontSize(item),
    textBold: item.textBold === true,
    imagesPerPage: clampInt(item.imagesPerPage ?? 4, 1, 6),
    imageGap: clampInt(item.imageGap ?? 16, 0, 120),
    frameBorderColor: normalizeHexColor(item.frameBorderColor, "#e4e4e4"),
    language:
      item.language === "en" || item.language === "de" || item.language === "es"
        ? item.language
        : "es",
    showSeries: item.showSeries !== false,
    seriesPrefix: optionalText(item.seriesPrefix, 120),
    pageNumbers: item.pageNumbers === true,
    footerText: String(item.footerText ?? "").trim().slice(0, 300),
    fonts: {
      header: String(item.fonts?.header ?? "Georgia").trim() || "Georgia",
      subtitle: String(item.fonts?.subtitle ?? "Georgia").trim() || "Georgia",
      body: String(item.fonts?.body ?? "Georgia").trim() || "Georgia"
    },
    headerStyle: {
      bold: item.headerStyle?.bold !== false,
      italic: item.headerStyle?.italic === true,
      color: normalizeHexColor(item.headerStyle?.color, "#1c1c1c")
    },
    subtitleStyle: {
      italic: item.subtitleStyle?.italic !== false,
      color: normalizeHexColor(item.subtitleStyle?.color, "#555555")
    },
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function normalizePriceOverrides(
  raw: Record<string, string> | undefined
): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw)) {
    const key = String(id ?? "").trim();
    const price = String(value ?? "").trim();
    if (!key || !price) continue;
    out[key] = price;
  }
  return out;
}

function normalizeSeriesTexts(
  texts: SeriesInfo["texts"] | undefined,
  legacy?: { topic?: string; description?: string }
): SeriesInfo["texts"] {
  if (Array.isArray(texts) && texts.length > 0) {
    return texts.map((text, index) => ({
      id: text.id || `txt-${index}`,
      topic: String(text.topic ?? "").trim(),
      body: String(text.body ?? "")
    }));
  }
  const topic = String(legacy?.topic ?? "").trim();
  const body = String(legacy?.description ?? "").trim();
  if (!topic && !body) return [];
  return [{ id: "txt-legacy", topic: topic || "Texto", body }];
}

function hydrateSeriesInfo(
  item: Partial<SeriesInfo>,
  index: number
): SeriesInfo {
  return {
    id: item.id || `SER-${index}`,
    name: String(item.name ?? "").trim(),
    texts: normalizeSeriesTexts(item.texts, item),
    notes: String(item.notes ?? "").trim(),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function hydrateMovement(movement: Movement): Movement {
  const slug = slugify(movement.type);
  const isSale = slug === "sale" || slug === "venta";
  return {
    ...movement,
    returned: asBool((movement as { returned?: unknown }).returned),
    keptAtGallery: asBool((movement as { keptAtGallery?: unknown }).keptAtGallery),
    indefinite: asBool((movement as { indefinite?: unknown }).indefinite),
    taxCharged: isSale
      ? (movement as { taxCharged?: unknown }).taxCharged === false
        ? false
        : true
      : undefined
  };
}

function asBool(value: unknown): boolean {
  return value === true || String(value).toLowerCase() === "true";
}

function sortByDateDesc(
  a: { date?: string; createdAt?: string },
  b: { date?: string; createdAt?: string }
): number {
  return dateValue(b) - dateValue(a);
}

function dateValue(item: { date?: string; createdAt?: string }): number {
  if (item.date && /^\d{2}-\d{2}-\d{4}$/.test(item.date)) {
    const [day, month, year] = item.date.split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  return item.createdAt ? new Date(item.createdAt).getTime() : 0;
}

function validateDate(value: string | undefined, label: string): string {
  if (!value) return "";
  if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    throw new Error(`${label} debe tener el formato DD-MM-YYYY.`);
  }
  const [day, month, year] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error(`${label} no es una fecha válida.`);
  }
  return value;
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((candidate) => (candidate.id === item.id ? item : candidate));
}

function uniqueLookups(lookups: LookupOption[]): LookupOption[] {
  return addLookupValues(DEFAULT_LOOKUPS, lookups);
}

function addLookupValues(
  lookups: LookupOption[],
  additions: Array<Partial<LookupOption>>
): LookupOption[] {
  const normalized = new Map<string, LookupOption>();
  [...lookups, ...additions].forEach((lookup) => {
    const category = lookup.category?.trim();
    const label = lookup.label?.trim();
    if (!category || !label) return;
    const value = lookup.value?.trim() || slugify(label);
    const key = `${category}:${value.toLowerCase()}`;
    if (!normalized.has(key)) normalized.set(key, { category, value, label });
  });
  return [...normalized.values()].sort((a, b) =>
    `${a.category}:${a.label}`.localeCompare(`${b.category}:${b.label}`)
  );
}

function isDefaultLookup(category: string, value: string): boolean {
  return DEFAULT_LOOKUPS.some(
    (lookup) => lookup.category === category && lookup.value === value
  );
}

function withResolvedImagePaths(
  data: InventoryData,
  libraryPath: string
): InventoryData {
  return {
    ...data,
    images: data.images.map((image) => withImagePath(image, libraryPath))
  };
}

function withImagePath(image: ArtworkImage, libraryPath: string): ArtworkImage {
  return { ...image, absolutePath: path.join(libraryPath, image.relativePath) };
}

function slugify(value?: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isExhibitionMovementType(type: string): boolean {
  const slug = slugify(type);
  return slug === "exhibition" || slug === "exposicion";
}

function isThreeDimensional(type: string): boolean {
  return ["sculpture", "escultura", "object", "objeto", "installation"].includes(
    slugify(type)
  );
}
