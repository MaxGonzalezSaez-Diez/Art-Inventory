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
  listedPrice?: string;
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
  targetType: "artwork" | "edition" | "exhibition";
  targetId: string;
  category: string;
  relativePath: string;
  absolutePath?: string;
  caption?: string;
  originalName?: string;
  createdAt: string;
}

export interface LookupOption {
  category: string;
  value: string;
  label: string;
}

export interface InventoryData {
  libraryPath: string;
  artworks: Artwork[];
  editions: Edition[];
  movements: Movement[];
  exhibitions: Exhibition[];
  contacts: Contact[];
  images: ArtworkImage[];
  lookups: LookupOption[];
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
