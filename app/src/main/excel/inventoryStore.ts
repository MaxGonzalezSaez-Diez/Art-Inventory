import { access, copyFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type {
  AppSettings,
  Artwork,
  ArtworkImage,
  ArtworkInput,
  Contact,
  ContactInput,
  Edition,
  Exhibition,
  ExhibitionInput,
  ImportedImage,
  InventoryData,
  LookupInput,
  LookupOption,
  Movement
} from "../types/inventory";
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

export class InventoryStore {
  constructor(private libraryPath: string) {}

  private get dataPath(): string {
    return path.join(this.libraryPath, DATA_FILE);
  }

  async load(): Promise<InventoryData> {
    await ensureLibrary(this.libraryPath);
    const raw = (await this.readJson()) ?? (await this.migrateFromWorkbook());
    return withResolvedImagePaths(compactData(raw), this.libraryPath);
  }

  private async readJson(): Promise<InventoryData | null> {
    if (!(await exists(this.dataPath))) return null;
    try {
      const text = await readFile(this.dataPath, "utf8");
      const parsed = JSON.parse(text) as Partial<InventoryData>;
      return normalizeRaw(parsed, this.libraryPath);
    } catch {
      return null;
    }
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
    const payload = {
      ...data,
      images: data.images.map(({ absolutePath, ...image }) => image)
    };
    await writeFile(this.dataPath, JSON.stringify(payload, null, 2), "utf8");
  }

  async saveArtwork(input: ArtworkInput): Promise<InventoryData> {
    const data = await this.load();
    const now = new Date().toISOString();
    const title = input.title.trim();
    if (!title) throw new Error("El título es obligatorio.");

    const existing = input.id
      ? data.artworks.find((artwork) => artwork.id === input.id)
      : undefined;
    const id =
      existing?.id ?? input.id ?? yearRandomId(data.artworks.map((item) => item.id));

    const is3D = isThreeDimensional(input.type);
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
      depth: is3D ? input.depth ?? "" : "",
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
      (movement) => movement.type === "exhibition" && movement.exhibitionId === id
    );
    const otherMovements = data.movements.filter(
      (movement) => !(movement.type === "exhibition" && movement.exhibitionId === id)
    );
    const linkedMovements: Movement[] = artworkIds.map((artworkId) => {
      const prior = previousForExhibition.find(
        (movement) => movement.artworkId === artworkId
      );
      const listedPrice =
        listedPrices[artworkId] ?? prior?.listedPrice ?? "";
      if (prior) {
        return {
          ...prior,
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
            movement.type === "exhibition"
        )
        .map((movement) => movement.artworkId)
    );
    data.exhibitions = data.exhibitions.filter((item) => item.id !== exhibitionId);
    data.movements = data.movements.filter(
      (movement) =>
        !(movement.exhibitionId === exhibitionId && movement.type === "exhibition")
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
    data.settings = normalizeSettings(settings);
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
    targetType: "artwork" | "edition" | "exhibition",
    targetId: string,
    category = "main"
  ): Promise<ImportedImage> {
    const data = await this.load();
    const now = new Date().toISOString();
    const extension = path.extname(sourcePath) || ".jpg";
    const folder =
      targetType === "edition"
        ? "images/editions"
        : targetType === "exhibition"
          ? "images/exhibitions"
          : "images/originals";
    const fileName = `${targetId}-${Date.now()}${extension}`;
    const relativePath = path.join(folder, fileName);
    const destination = path.join(this.libraryPath, relativePath);

    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(sourcePath, destination);

    const image: ArtworkImage = {
      id: `IMG-${randomUUID().slice(0, 8)}`,
      targetType,
      targetId,
      category,
      relativePath,
      originalName: path.basename(sourcePath),
      createdAt: now
    };

    if (category === "main") {
      data.images = data.images.filter(
        (item) =>
          !(
            item.targetType === targetType &&
            item.targetId === targetId &&
            item.category === "main"
          )
      );
    }
    data.images.push(image);

    if (category === "main" && targetType === "artwork") {
      data.artworks = data.artworks.map((artwork) =>
        artwork.id === targetId
          ? { ...artwork, mainImageId: image.id, updatedAt: now }
          : artwork
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
    const artwork = data.artworks.find((item) => item.id === artworkId);
    if (artwork && artwork.editionMode === "unique") {
      const movements = data.movements.filter((m) => m.artworkId === artworkId);
      data.artworks = data.artworks.map((item) =>
        item.id === artworkId
          ? { ...item, status: computeStatus(movements, item.status), updatedAt: now }
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
  const cleanImages = dedupeImages(
    data.images.filter((image) => {
      if (image.targetType === "artwork") return artworkIds.has(image.targetId);
      if (image.targetType === "exhibition")
        return exhibitionIdSet.has(image.targetId);
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
      depth: isThreeDimensional(artwork.type) ? artwork.depth ?? "" : "",
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

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function defaultSettings(): AppSettings {
  return {
    sizeTypes: [],
    taxRates: [
      { id: "tax-es", country: "España", rate: 21, from: "" },
      { id: "tax-de", country: "Alemania", rate: 19, from: "" },
      { id: "tax-none", country: "Sin impuesto", rate: 0, from: "" }
    ]
  };
}

function normalizeSettings(raw: Partial<AppSettings> | undefined): AppSettings {
  const base = defaultSettings();
  if (!raw) return base;
  return {
    sizeTypes: Array.isArray(raw.sizeTypes)
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
      : [],
    taxRates:
      Array.isArray(raw.taxRates) && raw.taxRates.length > 0
        ? raw.taxRates.map((tax, index) => ({
            id: tax.id || `tax-${index}`,
            country: String(tax.country ?? "").trim(),
            rate: Number(tax.rate) || 0,
            from: String(tax.from ?? "").trim()
          }))
        : base.taxRates
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
    settings: defaultSettings()
  };
}

function normalizeRaw(
  raw: Partial<InventoryData>,
  libraryPath: string
): InventoryData {
  return {
    libraryPath,
    artworks: raw.artworks ?? [],
    editions: raw.editions ?? [],
    movements: (raw.movements ?? []).map(hydrateMovement),
    exhibitions: raw.exhibitions ?? [],
    contacts: raw.contacts ?? [],
    images: raw.images ?? [],
    lookups: uniqueLookups(raw.lookups ?? []),
    settings: normalizeSettings(raw.settings)
  };
}

function hydrateMovement(movement: Movement): Movement {
  return {
    ...movement,
    returned: asBool((movement as { returned?: unknown }).returned),
    keptAtGallery: asBool((movement as { keptAtGallery?: unknown }).keptAtGallery),
    indefinite: asBool((movement as { indefinite?: unknown }).indefinite)
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

function yearRandomId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  let candidate = "";
  do {
    candidate = `${year}-${Math.floor(1000 + Math.random() * 9000)}`;
  } while (existingIds.includes(candidate));
  return candidate;
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

function isThreeDimensional(type: string): boolean {
  return ["sculpture", "escultura", "object", "objeto", "installation"].includes(
    slugify(type)
  );
}
