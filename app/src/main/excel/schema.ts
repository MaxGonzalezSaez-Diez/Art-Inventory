import type { LookupOption } from "../types/inventory";

export const WORKBOOK_FILE = "inventory.xlsx";

export const LIBRARY_DIRECTORIES = [
  "images/originals",
  "images/editions",
  "images/exhibitions",
  "backups"
] as const;

export type SheetName =
  | "Artworks"
  | "Editions"
  | "Movements"
  | "Exhibitions"
  | "Contacts"
  | "Images"
  | "Lookups";

export const SHEETS: Record<SheetName, string[]> = {
  Artworks: [
    "id",
    "title",
    "series",
    "type",
    "yearMade",
    "height",
    "width",
    "depth",
    "unit",
    "status",
    "galleryContactId",
    "galleryName",
    "editionMode",
    "editionPersonalCopies",
    "editionSaleCopies",
    "soldPrice",
    "soldDate",
    "soldToContactId",
    "soldToName",
    "notes",
    "mainImageId",
    "mainImagePath",
    "createdAt",
    "updatedAt"
  ],
  Editions: [
    "id",
    "artworkId",
    "label",
    "kind",
    "status",
    "notes",
    "createdAt",
    "updatedAt"
  ],
  Movements: [
    "id",
    "artworkId",
    "editionId",
    "editionLabel",
    "type",
    "recipientType",
    "contactId",
    "contactName",
    "exhibitionId",
    "exhibitionTitle",
    "context",
    "returned",
    "keptAtGallery",
    "date",
    "endDate",
    "indefinite",
    "price",
    "received",
    "listedPrice",
    "taxCharged",
    "currency",
    "notes",
    "createdAt"
  ],
  Exhibitions: [
    "id",
    "title",
    "city",
    "country",
    "venue",
    "galleryContactId",
    "galleryName",
    "curatorContactId",
    "startDate",
    "endDate",
    "curator",
    "exhibitionType",
    "comments",
    "artworkIds",
    "imagePaths",
    "createdAt",
    "updatedAt"
  ],
  Contacts: [
    "id",
    "kind",
    "name",
    "firstName",
    "lastName",
    "birthday",
    "job",
    "relationship",
    "phone",
    "email",
    "website",
    "location",
    "city",
    "country",
    "firstContactYear",
    "comments",
    "galleristContactId",
    "organizationId",
    "createdAt",
    "updatedAt"
  ],
  Images: [
    "id",
    "targetType",
    "targetId",
    "category",
    "relativePath",
    "caption",
    "createdAt"
  ],
  Lookups: ["category", "value", "label"]
};

export const DEFAULT_LOOKUPS: LookupOption[] = [
  { category: "artworkType", value: "oil_canvas", label: "Óleo sobre lienzo" },
  { category: "artworkType", value: "acrylic_canvas", label: "Acrílico sobre lienzo" },
  { category: "artworkType", value: "painting", label: "Pintura" },
  { category: "artworkType", value: "watercolor", label: "Acuarela" },
  { category: "artworkType", value: "sculpture", label: "Escultura" },
  { category: "artworkType", value: "drawing", label: "Dibujo" },
  { category: "artworkType", value: "print", label: "Grabado / impresión" },
  { category: "artworkType", value: "mixed_media", label: "Técnica mixta" },
  { category: "artworkType", value: "other", label: "Otro" },
  { category: "status", value: "not_made", label: "No generada" },
  { category: "status", value: "in_studio", label: "En estudio" },
  { category: "status", value: "sold", label: "Vendida" },
  { category: "status", value: "lost", label: "Perdida" },
  { category: "status", value: "gifted", label: "Regalada" },
  { category: "status", value: "loaned", label: "Prestada" },
  { category: "status", value: "consigned", label: "En galería" },
  { category: "status", value: "in_exhibition", label: "En exposición" },
  { category: "status", value: "post_show_gallery", label: "Tras exposición" },
  { category: "status", value: "payment_gallery", label: "Entregada como pago" },
  { category: "status", value: "per_copy", label: "Ver cada copia" },
  { category: "status", value: "archived", label: "Archivada" },
  { category: "movementType", value: "sale", label: "Venta" },
  { category: "movementType", value: "gift", label: "Regalo" },
  { category: "movementType", value: "loan", label: "Préstamo" },
  { category: "movementType", value: "exhibition", label: "Exposición" },
  { category: "movementType", value: "payment", label: "Pago a galerista" },
  { category: "movementType", value: "lost", label: "Perdida" },
  { category: "exhibitionType", value: "single", label: "Individual" },
  { category: "exhibitionType", value: "group", label: "Colectiva" },
  { category: "country", value: "spain", label: "España" },
  { category: "country", value: "france", label: "Francia" },
  { category: "country", value: "germany", label: "Alemania" }
];
