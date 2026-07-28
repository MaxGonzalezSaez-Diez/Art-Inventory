import { createContext, useContext } from "react";
import type { AppLanguage } from "../main/preferences";

export type Lang = AppLanguage;

export const LANGUAGE_OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" }
];

type Entry = { es: string; en: string; de: string };

/**
 * Only the shell and the first-run screens live here so far; the pages
 * themselves are still Spanish.
 */
const strings = {
  "brand.eyebrow": { es: "Inventario", en: "Inventory", de: "Inventar" },
  "brand.title": { es: "Obras de arte", en: "Artworks", de: "Kunstwerke" },

  "nav.library": { es: "Lista de obras", en: "Artworks", de: "Werkliste" },
  "nav.series": {
    es: "Series (metadatos)",
    en: "Series (metadata)",
    de: "Serien (Metadaten)"
  },
  "nav.contacts": {
    es: "Personas y galerías",
    en: "People and galleries",
    de: "Personen und Galerien"
  },
  "nav.exhibitions": { es: "Exposiciones", en: "Exhibitions", de: "Ausstellungen" },
  "nav.pricelist": { es: "Folleto de obras", en: "Artwork booklet", de: "Werkbroschüre" },
  "nav.pricing": {
    es: "Factores y precios",
    en: "Factors and prices",
    de: "Faktoren und Preise"
  },
  "nav.financials": { es: "Cuentas", en: "Accounts", de: "Konten" },
  "nav.applications": { es: "Solicitudes", en: "Applications", de: "Bewerbungen" },
  "nav.textGenerator": {
    es: "Generador de texto",
    en: "Text generator",
    de: "Textgenerator"
  },
  "nav.examples": {
    es: "Biblioteca de ejemplos",
    en: "Example library",
    de: "Beispielbibliothek"
  },

  "sidebar.folder": { es: "Carpeta local", en: "Local folder", de: "Lokaler Ordner" },
  "sidebar.changeFolder": {
    es: "Cambiar carpeta",
    en: "Change folder",
    de: "Ordner ändern"
  },
  "sidebar.language": { es: "Idioma", en: "Language", de: "Sprache" },
  "sidebar.languageNote": {
    es: "Por ahora solo cambian los menús; las páginas siguen en español.",
    en: "For now only the menus change; the pages are still in Spanish.",
    de: "Vorerst ändern sich nur die Menüs; die Seiten bleiben auf Spanisch."
  },

  "setup.welcome": { es: "Bienvenida", en: "Welcome", de: "Willkommen" },
  "setup.title": {
    es: "Vamos a preparar tu inventario",
    en: "Let's set up your inventory",
    de: "Richten wir dein Inventar ein"
  },
  "setup.lead": {
    es: "Dos preguntas y listo. Todo se guarda en tu ordenador: no hay cuentas ni internet.",
    en: "Two questions and you are done. Everything stays on your computer: no accounts, no internet.",
    de: "Zwei Fragen und fertig. Alles bleibt auf deinem Rechner: keine Konten, kein Internet."
  },
  "setup.step1": { es: "1. Idioma", en: "1. Language", de: "1. Sprache" },
  "setup.step1Help": {
    es: "Puedes cambiarlo cuando quieras desde la barra lateral.",
    en: "You can change this at any time from the sidebar.",
    de: "Du kannst das jederzeit in der Seitenleiste ändern."
  },
  "setup.step2": {
    es: "2. ¿Dónde guardamos tus obras?",
    en: "2. Where should your artworks live?",
    de: "2. Wo sollen deine Werke gespeichert werden?"
  },
  "setup.step2Help": {
    es: "Se creará una carpeta «ArtInventory» con una hoja de Excel y tus fotos. Puedes copiarla o moverla como cualquier otra carpeta.",
    en: "An «ArtInventory» folder will be created with an Excel sheet and your photos. You can copy or move it like any other folder.",
    de: "Es wird ein Ordner «ArtInventory» mit einer Excel-Datei und deinen Fotos angelegt. Du kannst ihn wie jeden anderen Ordner kopieren oder verschieben."
  },
  "setup.documents": { es: "Documentos", en: "Documents", de: "Dokumente" },
  "setup.desktop": { es: "Escritorio", en: "Desktop", de: "Schreibtisch" },
  "setup.custom": { es: "Otra carpeta…", en: "Another folder…", de: "Anderer Ordner…" },
  "setup.chooseFolder": {
    es: "Elegir carpeta…",
    en: "Choose folder…",
    de: "Ordner wählen…"
  },
  "setup.start": { es: "Empezar", en: "Start", de: "Los geht's" },
  "setup.working": { es: "Creando…", en: "Creating…", de: "Wird erstellt…" },
  "setup.failed": {
    es: "No se pudo crear la carpeta. Elige otra ubicación.",
    en: "The folder could not be created. Pick another location.",
    de: "Der Ordner konnte nicht erstellt werden. Wähle einen anderen Ort."
  },
  "setup.existingNote": {
    es: "Si ya tienes una carpeta de una versión anterior, elige «Otra carpeta…» y selecciónala.",
    en: "If you already have a folder from an earlier version, choose «Another folder…» and select it.",
    de: "Wenn du bereits einen Ordner aus einer früheren Version hast, wähle «Anderer Ordner…» und suche ihn aus."
  }
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof strings;

export function translate(lang: Lang, key: StringKey): string {
  const entry = strings[key] as Entry;
  return entry[lang] || entry.es;
}

export type Translate = (key: StringKey) => string;

const LanguageContext = createContext<{ lang: Lang; t: Translate }>({
  lang: "es",
  t: (key) => translate("es", key)
});

export const LanguageProvider = LanguageContext.Provider;

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useT(): Translate {
  return useContext(LanguageContext).t;
}
