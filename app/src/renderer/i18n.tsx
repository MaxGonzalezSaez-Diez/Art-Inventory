import { createContext, useContext } from "react";
import type { AppLanguage } from "../main/preferences";

export type Lang = AppLanguage;

export const LANGUAGE_OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" }
];

type Entry = { es: string; en: string; de: string };

function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * UI strings for the whole app (shell + pages). App.tsx still uses Spanish
 * literals today; wire `t("…")` / `lookupLabel` as pages are migrated.
 */
const strings = {
  /* ── Brand / nav / sidebar / setup (shell) ─────────────────────────── */
  "brand.eyebrow": { es: "Inventario", en: "Inventory", de: "Inventar" },
  "brand.title": { es: "Obras de arte", en: "Artworks", de: "Kunstwerke" },

  "nav.library": { es: "Lista de obras", en: "Artworks", de: "Werkliste" },
  "nav.inbox": {
    es: "Recordatorios",
    en: "Reminders",
    de: "Erinnerungen"
  },
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
  "nav.floatingBack": {
    es: "← Volver",
    en: "← Back",
    de: "← Zurück"
  },

  "sidebar.folder": { es: "Carpeta local", en: "Local folder", de: "Lokaler Ordner" },
  "sidebar.changeFolder": {
    es: "Cambiar carpeta",
    en: "Change folder",
    de: "Ordner ändern"
  },
  "sidebar.language": { es: "Idioma", en: "Language", de: "Sprache" },
  "sidebar.languageNote": {
    es: "Toda la interfaz cambia de idioma.",
    en: "The whole interface switches language.",
    de: "Die ganze Oberfläche wechselt die Sprache."
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
  },

  /* ── Common actions ─────────────────────────────────────────────────── */
  "common.save": { es: "Guardar", en: "Save", de: "Speichern" },
  "common.saving": { es: "Guardando…", en: "Saving…", de: "Speichern…" },
  "common.saved": { es: "Guardado", en: "Saved", de: "Gespeichert" },
  "common.cancel": { es: "Cancelar", en: "Cancel", de: "Abbrechen" },
  "common.delete": { es: "Eliminar", en: "Delete", de: "Löschen" },
  "common.deleteEllipsis": { es: "Eliminar…", en: "Delete…", de: "Löschen…" },
  "common.deleteForever": {
    es: "Eliminar definitivamente",
    en: "Delete permanently",
    de: "Endgültig löschen"
  },
  "common.edit": { es: "Editar", en: "Edit", de: "Bearbeiten" },
  "common.back": { es: "Volver", en: "Back", de: "Zurück" },
  "common.add": { es: "Añadir", en: "Add", de: "Hinzufügen" },
  "common.copied": {
    es: "Copiado.",
    en: "Copied.",
    de: "Kopiert."
  },
  "common.clickToCopy": {
    es: "Pulsa para copiar",
    en: "Click to copy",
    de: "Klicken zum Kopieren"
  },
  "common.remove": { es: "Quitar", en: "Remove", de: "Entfernen" },
  "common.erase": { es: "Borrar", en: "Erase", de: "Löschen" },
  "common.search": { es: "Buscar...", en: "Search...", de: "Suchen..." },
  "common.close": { es: "Cerrar", en: "Close", de: "Schließen" },
  "common.yes": { es: "Sí", en: "Yes", de: "Ja" },
  "common.no": { es: "No", en: "No", de: "Nein" },
  "common.clear": { es: "Limpiar", en: "Clear", de: "Leeren" },
  "common.clearAll": { es: "Limpiar todo", en: "Clear all", de: "Alles leeren" },
  "common.sort": { es: "Ordenar", en: "Sort", de: "Sortieren" },
  "common.all": { es: "Todos", en: "All", de: "Alle" },
  "common.allFeminine": { es: "Todas", en: "All", de: "Alle" },
  "common.reset": { es: "Restablecer", en: "Reset", de: "Zurücksetzen" },
  "common.use": { es: "Usar", en: "Use", de: "Verwenden" },
  "common.done": { es: "Listo", en: "Done", de: "Fertig" },
  "common.moveUp": { es: "Subir", en: "Move up", de: "Nach oben" },
  "common.moveDown": { es: "Bajar", en: "Move down", de: "Nach unten" },
  "common.open": { es: "Abrir", en: "Open", de: "Öffnen" },
  "common.selectPlaceholder": {
    es: "— Seleccionar —",
    en: "— Select —",
    de: "— Auswählen —"
  },
  "common.noDate": { es: "Sin fecha", en: "No date", de: "Kein Datum" },
  "common.noPhoto": { es: "Sin foto", en: "No photo", de: "Kein Foto" },
  "common.noName": { es: "Sin nombre", en: "No name", de: "Kein Name" },
  "common.noTopic": { es: "Sin tema", en: "No topic", de: "Kein Thema" },
  "common.noPrice": { es: "Sin precio", en: "No price", de: "Kein Preis" },
  "common.noImage": { es: "Sin imagen", en: "No image", de: "Kein Bild" },
  "common.dash": { es: "—", en: "—", de: "—" },
  "common.error.save": {
    es: "No se pudo guardar.",
    en: "Could not save.",
    de: "Speichern fehlgeschlagen."
  },
  "common.error.load": {
    es: "No se pudo cargar.",
    en: "Could not load.",
    de: "Laden fehlgeschlagen."
  },
  "common.error.delete": {
    es: "No se pudo eliminar.",
    en: "Could not delete.",
    de: "Löschen fehlgeschlagen."
  },
  "common.error.export": {
    es: "No se pudo exportar.",
    en: "Could not export.",
    de: "Export fehlgeschlagen."
  },
  "common.error.clipboard": {
    es: "No se pudo copiar al portapapeles.",
    en: "Could not copy to the clipboard.",
    de: "Kopieren in die Zwischenablage fehlgeschlagen."
  },
  "common.toast.saved": {
    es: "Guardado correctamente.",
    en: "Saved successfully.",
    de: "Erfolgreich gespeichert."
  },
  "common.moreFilters": { es: "Más filtros", en: "More filters", de: "Mehr Filter" },
  "common.fewerFilters": {
    es: "Menos filtros",
    en: "Fewer filters",
    de: "Weniger Filter"
  },
  "common.viewDetail": { es: "Ver detalle", en: "View details", de: "Details anzeigen" },
  "common.createFirst": {
    es: "Crear el primero",
    en: "Create the first one",
    de: "Ersten anlegen"
  },

  /* ── App shell empty / loading ──────────────────────────────────────── */
  "app.loadingExcel": {
    es: "Preparando el archivo Excel...",
    en: "Preparing the Excel file...",
    de: "Excel-Datei wird vorbereitet..."
  },
  "app.selectArtwork": {
    es: "Selecciona una obra.",
    en: "Select an artwork.",
    de: "Wähle ein Werk aus."
  },
  "app.restart.photos": {
    es: "Reinicia completamente la aplicación para guardar fotos editadas.",
    en: "Fully restart the app to save edited photos.",
    de: "Starte die App komplett neu, um bearbeitete Fotos zu speichern."
  },
  "app.restart.images": {
    es: "Reinicia la app (cierra la ventana y vuelve a abrirla) para guardar imágenes.",
    en: "Restart the app (close the window and open it again) to save images.",
    de: "Starte die App neu (Fenster schließen und wieder öffnen), um Bilder zu speichern."
  },

  /* ── Library ────────────────────────────────────────────────────────── */
  "library.filters": { es: "Filtros", en: "Filters", de: "Filter" },
  "library.filtersShow": { es: "▶ Filtros", en: "▶ Filters", de: "▶ Filter" },
  "library.filtersHide": {
    es: "◀ Ocultar filtros",
    en: "◀ Hide filters",
    de: "◀ Filter ausblenden"
  },
  "library.filtersCount": { es: " ({count})", en: " ({count})", de: " ({count})" },
  "library.search": { es: "Buscar...", en: "Search...", de: "Suchen..." },
  "library.filter.type": { es: "Técnica", en: "Technique", de: "Technik" },
  "library.filter.status": { es: "Estado", en: "Status", de: "Status" },
  "library.filter.edition": { es: "Edición", en: "Edition", de: "Edition" },
  "library.filter.series": { es: "Serie", en: "Series", de: "Serie" },
  "library.filter.year": { es: "Año", en: "Year", de: "Jahr" },
  "library.filter.height": { es: "Alto (cm)", en: "Height (cm)", de: "Höhe (cm)" },
  "library.filter.width": { es: "Ancho (cm)", en: "Width (cm)", de: "Breite (cm)" },
  "library.filter.soldPrice": {
    es: "Precio vendido",
    en: "Sold price",
    de: "Verkaufspreis"
  },
  "library.edition.unique": { es: "Única", en: "Unique", de: "Unikat" },
  "library.edition.multiple": {
    es: "Serie / ediciones",
    en: "Series / editions",
    de: "Serie / Editionen"
  },
  "library.sort.recent": {
    es: "Añadidas recientemente",
    en: "Recently added",
    de: "Zuletzt hinzugefügt"
  },
  "library.sort.title": { es: "Título (A→Z)", en: "Title (A→Z)", de: "Titel (A→Z)" },
  "library.sort.series": { es: "Serie (A→Z)", en: "Series (A→Z)", de: "Serie (A→Z)" },
  "library.sort.yearDesc": {
    es: "Año (nuevo→viejo)",
    en: "Year (new→old)",
    de: "Jahr (neu→alt)"
  },
  "library.sort.yearAsc": {
    es: "Año (viejo→nuevo)",
    en: "Year (old→new)",
    de: "Jahr (alt→neu)"
  },
  "library.sort.type": { es: "Tipo", en: "Type", de: "Typ" },
  "library.sort.priceDesc": {
    es: "Precio (alto→bajo)",
    en: "Price (high→low)",
    de: "Preis (hoch→niedrig)"
  },
  "library.sort.priceAsc": {
    es: "Precio (bajo→alto)",
    en: "Price (low→high)",
    de: "Preis (niedrig→hoch)"
  },
  "library.count": { es: "{count} obras", en: "{count} artworks", de: "{count} Werke" },
  "library.add": { es: "+ Añadir obra", en: "+ Add artwork", de: "+ Werk hinzufügen" },
  "library.bulkExport": {
    es: "Salvar múltiple",
    en: "Save multiple",
    de: "Mehrere speichern"
  },
  "library.col.photo": { es: "Foto", en: "Photo", de: "Foto" },
  "library.col.artwork": { es: "Obra", en: "Artwork", de: "Werk" },
  "library.col.series": { es: "Serie", en: "Series", de: "Serie" },
  "library.col.type": { es: "Técnica", en: "Technique", de: "Technik" },
  "library.col.year": { es: "Año", en: "Year", de: "Jahr" },
  "library.col.status": { es: "Estado", en: "Status", de: "Status" },
  "library.empty": {
    es: "No hay obras que coincidan.",
    en: "No matching artworks.",
    de: "Keine passenden Werke."
  },
  "library.overdue.tooltip": {
    es: "Pendiente de recuperar — clic para confirmar",
    en: "Pending return — click to confirm",
    de: "Rückgabe ausstehend — klicken zum Bestätigen"
  },
  "library.overdue.title": {
    es: "¿Ha vuelto al estudio?",
    en: "Back in the studio?",
    de: "Wieder im Atelier?"
  },
  "library.overdue.message": {
    es: "«{title}» figura todavía en {where} y la fecha ya pasó. ¿Confirmas que la obra ya volvió al estudio?",
    en: "«{title}» is still listed as in {where} and the date has passed. Confirm that the artwork is back in the studio?",
    de: "«{title}» ist noch bei {where} eingetragen und das Datum ist vorbei. Bestätigst du, dass das Werk wieder im Atelier ist?"
  },
  "library.overdue.whereExhibition": {
    es: "la exposición",
    en: "the exhibition",
    de: "der Ausstellung"
  },
  "library.overdue.whereLoan": {
    es: "el préstamo",
    en: "the loan",
    de: "der Leihgabe"
  },
  "library.overdue.notYet": { es: "Todavía no", en: "Not yet", de: "Noch nicht" },
  "library.overdue.confirm": {
    es: "Sí, está en el estudio",
    en: "Yes, it's in the studio",
    de: "Ja, es ist im Atelier"
  },

  /* ── Artwork form ───────────────────────────────────────────────────── */
  "artwork.form.titleNew": { es: "Nueva obra", en: "New artwork", de: "Neues Werk" },
  "artwork.form.titleEdit": { es: "Editar obra", en: "Edit artwork", de: "Werk bearbeiten" },
  "artwork.form.fallbackTitle": {
    es: "Añadir obra",
    en: "Add artwork",
    de: "Werk hinzufügen"
  },
  "artwork.form.newButton": { es: "Nueva obra", en: "New artwork", de: "Neues Werk" },
  "artwork.tab.info": { es: "Información", en: "Information", de: "Informationen" },
  "artwork.tab.movements": { es: "Movimientos", en: "Movements", de: "Bewegungen" },
  "artwork.tab.movementsCount": {
    es: "Movimientos · {count}",
    en: "Movements · {count}",
    de: "Bewegungen · {count}"
  },
  "artwork.section.identity": { es: "Identidad", en: "Identity", de: "Identität" },
  "artwork.section.dimensions": { es: "Medidas", en: "Dimensions", de: "Maße" },
  "artwork.section.edition": { es: "Edición", en: "Edition", de: "Edition" },
  "artwork.section.notes": { es: "Notas", en: "Notes", de: "Notizen" },
  "artwork.field.title": {
    es: "Nombre / título",
    en: "Name / title",
    de: "Name / Titel"
  },
  "artwork.field.titlePlaceholder": {
    es: "Título de la obra",
    en: "Artwork title",
    de: "Werktitel"
  },
  "artwork.field.id": {
    es: "ID",
    en: "ID",
    de: "ID"
  },
  "artwork.field.idPlaceholder": {
    es: "Se crea al guardar",
    en: "Created on save",
    de: "Wird beim Speichern erzeugt"
  },
  "artwork.field.idHintPreview": {
    es: "Vista previa del ID. Se confirma al pulsar Guardar.",
    en: "ID preview. Confirmed when you press Save.",
    de: "ID-Vorschau. Wird beim Speichern bestätigt."
  },
  "artwork.field.idHintSaved": {
    es: "ID permanente de la obra (no cambia al editar).",
    en: "Permanent work ID (does not change on edit).",
    de: "Dauerhafte Werk-ID (ändert sich beim Bearbeiten nicht)."
  },
  "artwork.field.type": { es: "Técnica", en: "Technique", de: "Technik" },
  "artwork.field.series": { es: "Serie", en: "Series", de: "Serie" },
  "artwork.field.year": { es: "Año", en: "Year", de: "Jahr" },
  "artwork.field.yearPlaceholder": { es: "YYYY", en: "YYYY", de: "JJJJ" },
  "artwork.field.status": { es: "Estado", en: "Status", de: "Status" },
  "artwork.field.height": { es: "Alto", en: "Height", de: "Höhe" },
  "artwork.field.width": { es: "Ancho", en: "Width", de: "Breite" },
  "artwork.field.depth": { es: "Profundidad", en: "Depth", de: "Tiefe" },
  "artwork.field.depthOptional": {
    es: "Opcional (bastidor…)",
    en: "Optional (stretcher…)",
    de: "Optional (Keilrahmen…)"
  },
  "artwork.field.unit": { es: "Unidad", en: "Unit", de: "Einheit" },
  "artwork.field.inches": { es: "pulgadas", en: "inches", de: "Zoll" },
  "artwork.field.depth3dOnly": { es: "Solo 3D", en: "3D only", de: "Nur 3D" },
  "artwork.field.notesPlaceholder": {
    es: "Observaciones internas…",
    en: "Internal notes…",
    de: "Interne Notizen…"
  },
  "artwork.status.perCopy": {
    es: "Ver cada copia",
    en: "See each copy",
    de: "Pro Exemplar"
  },
  "artwork.status.hint": {
    es: "El estado se calcula solo a partir de los movimientos.",
    en: "Status is calculated from movements only.",
    de: "Der Status wird nur aus den Bewegungen berechnet."
  },
  "artwork.photo.add": { es: "Añadir foto", en: "Add photo", de: "Foto hinzufügen" },
  "artwork.photo.change": {
    es: "Cambiar foto (elegir otra)",
    en: "Change photo (pick another)",
    de: "Foto ändern (andere wählen)"
  },
  "artwork.photo.retouch": {
    es: "Retocar foto actual",
    en: "Retouch current photo",
    de: "Aktuelles Foto nachbearbeiten"
  },
  "artwork.photo.retouchSaved": {
    es: "Foto guardada.",
    en: "Photo saved.",
    de: "Foto gespeichert."
  },
  "artwork.photo.restored": {
    es: "Versión anterior restaurada.",
    en: "Previous version restored.",
    de: "Vorherige Version wiederhergestellt."
  },
  "artwork.photo.historyHint": {
    es: "Versiones anteriores (por si te equivocas al retocar):",
    en: "Previous versions (if a retouch goes wrong):",
    de: "Frühere Versionen (falls die Bearbeitung misslingt):"
  },
  "artwork.photo.restore": {
    es: "Restaurar esta",
    en: "Restore this",
    de: "Diese wiederherstellen"
  },
  "artwork.photo.hint.ready": {
    es: "Listo — se guarda con la obra.",
    en: "Ready — saved with the artwork.",
    de: "Fertig — wird mit dem Werk gespeichert."
  },
  "artwork.photo.hint.locked": {
    es: "Pulsa «Editar» para cambiar la foto.",
    en: "Press «Edit» to change the photo.",
    de: "Drücke «Bearbeiten», um das Foto zu ändern."
  },
  "artwork.photo.hint.click": {
    es: "Clic o arrastra una foto para elegir y recortar.",
    en: "Click or drag a photo to choose and crop.",
    de: "Klicken oder Foto ziehen zum Auswählen und Zuschneiden."
  },
  "artwork.photo.hint.drop": {
    es: "También puedes arrastrar una foto aquí.",
    en: "You can also drag a photo here.",
    de: "Du kannst auch ein Foto hierher ziehen."
  },
  "artwork.error.dropImageOnly": {
    es: "Solo se pueden soltar imágenes (jpg, png…).",
    en: "Only images can be dropped (jpg, png…).",
    de: "Nur Bilder können abgelegt werden (jpg, png…)."
  },
  "artwork.error.dropFailed": {
    es: "No se pudo importar el archivo soltado.",
    en: "Could not import the dropped file.",
    de: "Die abgelegte Datei konnte nicht importiert werden."
  },
  "artwork.edition.question": {
    es: "¿Obra única o varias copias?",
    en: "Unique work or multiple copies?",
    de: "Unikat oder mehrere Exemplare?"
  },
  "artwork.edition.unique": { es: "Única", en: "Unique", de: "Unikat" },
  "artwork.edition.multiple": {
    es: "Varias copias",
    en: "Multiple copies",
    de: "Mehrere Exemplare"
  },
  "artwork.edition.personalCopies": {
    es: "Copias personales / pruebas",
    en: "Personal copies / proofs",
    de: "Persönliche Exemplare / Probedrucke"
  },
  "artwork.edition.editionCopies": {
    es: "Copias de la edición (para vender)",
    en: "Edition copies (for sale)",
    de: "Editions-Exemplare (zum Verkauf)"
  },
  "artwork.edition.generate": {
    es: "Generar lista de copias",
    en: "Generate copy list",
    de: "Exemplarliste erzeugen"
  },
  "artwork.edition.copyStatus": {
    es: "Estado de cada copia",
    en: "Status of each copy",
    de: "Status jedes Exemplars"
  },
  "artwork.edition.copyHint": {
    es: "En los movimientos podrás indicar «¿Qué copia?».",
    en: "In movements you can choose «Which copy?».",
    de: "Bei Bewegungen kannst du «Welches Exemplar?» wählen."
  },
  "artwork.error.needTitle": {
    es: "Escribe un título antes de guardar la obra.",
    en: "Enter a title before saving the artwork.",
    de: "Gib vor dem Speichern einen Titel ein."
  },
  "artwork.error.needType": {
    es: "Elige una técnica antes de guardar.",
    en: "Choose a technique before saving.",
    de: "Wähle vor dem Speichern eine Technik."
  },
  "artwork.error.needSeries": {
    es: "Elige o escribe una serie antes de guardar.",
    en: "Choose or enter a series before saving.",
    de: "Wähle oder gib vor dem Speichern eine Serie ein."
  },
  "artwork.error.needYear": {
    es: "Escribe el año antes de guardar.",
    en: "Enter the year before saving.",
    de: "Gib vor dem Speichern das Jahr ein."
  },
  "artwork.error.needHeight": {
    es: "Escribe el alto antes de guardar.",
    en: "Enter the height before saving.",
    de: "Gib vor dem Speichern die Höhe ein."
  },
  "artwork.error.needWidth": {
    es: "Escribe el ancho antes de guardar.",
    en: "Enter the width before saving.",
    de: "Gib vor dem Speichern die Breite ein."
  },
  "artwork.error.needUnit": {
    es: "Elige la unidad de medida antes de guardar.",
    en: "Choose a unit of measure before saving.",
    de: "Wähle vor dem Speichern eine Maßeinheit."
  },
  "artwork.error.needEdition": {
    es: "Elige si la obra es única o una edición.",
    en: "Choose whether the work is unique or an edition.",
    de: "Wähle, ob das Werk ein Unikat oder eine Edition ist."
  },
  "artwork.error.needSaleCopies": {
    es: "Indica cuántas copias de edición hay (para vender).",
    en: "Enter how many edition copies there are (for sale).",
    de: "Gib an, wie viele Editions-Exemplare es gibt (zum Verkauf)."
  },
  "artwork.error.needGenerateCopies": {
    es: "Pulsa «Generar copias» para crear la lista de ejemplares antes de guardar.",
    en: "Press «Generate copies» to build the copy list before saving.",
    de: "Drücke «Exemplare erzeugen», um die Liste vor dem Speichern anzulegen."
  },
  "artwork.dimensions.ipadNote": {
    es: "Las Ipad Drawings no tienen medidas físicas.",
    en: "Ipad Drawings have no physical dimensions.",
    de: "Ipad Drawings haben keine physischen Maße."
  },
  "artwork.error.addPhoto": {
    es: "No se pudo añadir la foto.",
    en: "Could not add the photo.",
    de: "Foto konnte nicht hinzugefügt werden."
  },

  /* ── Artwork detail ─────────────────────────────────────────────────── */
  "artwork.detail.tab.info": {
    es: "Información",
    en: "Information",
    de: "Informationen"
  },
  "artwork.detail.tab.movements": {
    es: "Movimientos ({count})",
    en: "Movements ({count})",
    de: "Bewegungen ({count})"
  },
  "artwork.detail.tab.price": {
    es: "Precio histórico",
    en: "Price history",
    de: "Preisverlauf"
  },
  "artwork.detail.meta.series": { es: "Serie", en: "Series", de: "Serie" },
  "artwork.detail.meta.type": { es: "Tipo", en: "Type", de: "Typ" },
  "artwork.detail.meta.year": { es: "Año", en: "Year", de: "Jahr" },
  "artwork.detail.meta.dimensions": { es: "Medidas", en: "Dimensions", de: "Maße" },
  "artwork.detail.meta.status": { es: "Estado", en: "Status", de: "Status" },
  "artwork.detail.meta.gallery": { es: "Galería", en: "Gallery", de: "Galerie" },
  "artwork.detail.meta.soldBy": { es: "Vendida por", en: "Sold by", de: "Verkauft durch" },
  "artwork.detail.meta.edition": { es: "Edición", en: "Edition", de: "Edition" },
  "artwork.detail.meta.notes": { es: "Notas", en: "Notes", de: "Notizen" },
  "artwork.detail.copyHint": {
    es: "Pulsa cualquier dato para copiarlo.",
    en: "Click any field to copy it.",
    de: "Tippe auf ein Feld, um es zu kopieren."
  },
  "artwork.detail.edition.multiple": {
    es: "Varias copias ({count})",
    en: "Multiple copies ({count})",
    de: "Mehrere Exemplare ({count})"
  },
  "artwork.detail.edition.unique": { es: "Única", en: "Unique", de: "Unikat" },
  "artwork.detail.copies": {
    es: "Copias ({count})",
    en: "Copies ({count})",
    de: "Exemplare ({count})"
  },
  "artwork.detail.extraImages": {
    es: "Imágenes adicionales",
    en: "Additional images",
    de: "Weitere Bilder"
  },
  "artwork.detail.extraImages.hint": {
    es: "Fotos de prensa, montaje u otros ángulos.",
    en: "Press photos, installation shots, or other angles.",
    de: "Pressefotos, Installationsansichten oder andere Winkel."
  },
  "artwork.docs": {
    es: "Documentos ({count})",
    en: "Documents ({count})",
    de: "Dokumente ({count})"
  },
  "artwork.docs.add": {
    es: "Añadir documento",
    en: "Add document",
    de: "Dokument hinzufügen"
  },
  "artwork.docs.hint": {
    es: "PDFs, Word, imágenes, videos (.mov, .mp4…) u otros archivos. Arrastra aquí o pulsa Añadir. Puedes añadir una descripción a cada uno.",
    en: "PDFs, Word, images, videos (.mov, .mp4…), or other files. Drag here or press Add. You can add a description to each.",
    de: "PDFs, Word, Bilder, Videos (.mov, .mp4…) oder andere Dateien. Hierher ziehen oder Hinzufügen. Du kannst jedem eine Beschreibung geben."
  },
  "artwork.docs.empty": {
    es: "Aún no hay documentos.",
    en: "No documents yet.",
    de: "Noch keine Dokumente."
  },
  "artwork.docs.pickSave": {
    es: "¿De cuál quieres salvar una copia?",
    en: "Which one do you want to save a copy of?",
    de: "Von welchem möchtest du eine Kopie speichern?"
  },
  "artwork.docs.pickRemove": {
    es: "¿Cuál quieres quitar?",
    en: "Which one do you want to remove?",
    de: "Welches möchtest du entfernen?"
  },
  "artwork.docs.noImages": {
    es: "No hay imágenes para salvar copia.",
    en: "No images to save a copy of.",
    de: "Keine Bilder zum Speichern einer Kopie."
  },
  "artwork.detail.movementsEmpty": {
    es: "Sin movimientos",
    en: "No movements",
    de: "Keine Bewegungen"
  },
  "artwork.detail.movementsEmpty.hint": {
    es: "Edita la obra para registrar ventas o préstamos.",
    en: "Edit the artwork to record sales or loans.",
    de: "Bearbeite das Werk, um Verkäufe oder Leihgaben zu erfassen."
  },
  "artwork.detail.delete.title": {
    es: "Eliminar esta obra",
    en: "Delete this artwork",
    de: "Dieses Werk löschen"
  },
  "artwork.detail.delete.body": {
    es: "Se borrará «{title}» y todos sus movimientos. No se puede deshacer.",
    en: "«{title}» and all its movements will be deleted. This cannot be undone.",
    de: "«{title}» und alle Bewegungen werden gelöscht. Das lässt sich nicht rückgängig machen."
  },
  "artwork.detail.delete.button": {
    es: "Eliminar obra…",
    en: "Delete artwork…",
    de: "Werk löschen…"
  },
  "artwork.detail.saveImage": {
    es: "Salvar foto…",
    en: "Save photo…",
    de: "Foto speichern…"
  },
  "artwork.detail.cert": {
    es: "Generar certificado",
    en: "Generate certificate",
    de: "Zertifikat erstellen"
  },
  "artwork.detail.certBusy": { es: "…", en: "…", de: "…" },

  /* ── Image export modal ─────────────────────────────────────────────── */
  "artwork.export.title": {
    es: "Salvar foto",
    en: "Save photo",
    de: "Foto speichern"
  },
  "artwork.export.lead": {
    es: "Elige la foto, el uso y la calidad. Se guarda una copia en la carpeta que indiques.",
    en: "Choose the photo, purpose, and quality. A copy is saved to the folder you pick.",
    de: "Wähle Foto, Zweck und Qualität. Eine Kopie landet im gewählten Ordner."
  },
  "artwork.export.step1": {
    es: "1 · Elige la foto",
    en: "1 · Choose the photo",
    de: "1 · Foto wählen"
  },
  "artwork.export.step1Hint": {
    es: "Principal o de Documentos.",
    en: "Main photo or from Documents.",
    de: "Hauptfoto oder aus Dokumente."
  },
  "artwork.export.thumb.main": {
    es: "Principal",
    en: "Main",
    de: "Haupt"
  },
  "artwork.export.thumb.doc": {
    es: "Documento",
    en: "Document",
    de: "Dokument"
  },
  "artwork.export.step2": {
    es: "2 · ¿Para qué la quieres?",
    en: "2 · What is it for?",
    de: "2 · Wofür brauchst du sie?"
  },
  "artwork.export.step3": {
    es: "3 · Calidad y tamaño",
    en: "3 · Quality and size",
    de: "3 · Qualität und Größe"
  },
  "artwork.export.intent.print": { es: "Imprimir", en: "Print", de: "Drucken" },
  "artwork.export.intent.dpi": {
    es: "Solo marcar DPI",
    en: "Set DPI only",
    de: "Nur DPI setzen"
  },
  "artwork.export.intent.web": {
    es: "Email / web",
    en: "Email / web",
    de: "E-Mail / Web"
  },
  "artwork.export.quality.basic": { es: "Básica", en: "Basic", de: "Basis" },
  "artwork.export.quality.good": { es: "Buena", en: "Good", de: "Gut" },
  "artwork.export.quality.fine": { es: "Muy fina", en: "Very fine", de: "Sehr fein" },
  "artwork.export.quality.other": { es: "Otro", en: "Other", de: "Andere" },
  "artwork.export.paperSize": {
    es: "Tamaño del papel",
    en: "Paper size",
    de: "Papierformat"
  },
  "artwork.export.artworkMeasure": {
    es: "Medida de la obra",
    en: "Artwork size",
    de: "Werkmaß"
  },
  "artwork.export.summary": { es: "Resumen:", en: "Summary:", de: "Übersicht:" },
  "artwork.export.saveCopy": {
    es: "Guardar copia…",
    en: "Save copy…",
    de: "Kopie speichern…"
  },
  "artwork.export.noSizeLimit": {
    es: "Vacío = sin límite de peso.",
    en: "Empty = no file-size limit.",
    de: "Leer = keine Dateigrößengrenze."
  },
  "artwork.export.missingSizeDpi": {
    es: "Falta tamaño o DPI",
    en: "Missing size or DPI",
    de: "Größe oder DPI fehlt"
  },
  "artwork.export.missingDpi": {
    es: "Falta el DPI",
    en: "DPI is missing",
    de: "DPI fehlt"
  },
  "artwork.export.error.pickPhoto": {
    es: "Elige una foto primero.",
    en: "Choose a photo first.",
    de: "Wähle zuerst ein Foto."
  },
  "artwork.export.error.quality": {
    es: "Indica la calidad (por ejemplo 300). Si eliges «Otra», escribe un número.",
    en: "Enter the quality (e.g. 300). If you choose «Other», type a number.",
    de: "Gib die Qualität an (z. B. 300). Bei «Andere» eine Zahl eintippen."
  },
  "artwork.export.error.paperCm": {
    es: "Pon el ancho y el alto en centímetros (el tamaño del papel o del cartel).",
    en: "Enter width and height in centimetres (paper or poster size).",
    de: "Gib Breite und Höhe in Zentimetern an (Papier- oder Plakatformat)."
  },
  "artwork.export.error.save": {
    es: "No se pudo guardar la imagen.",
    en: "Could not save the image.",
    de: "Bild konnte nicht gespeichert werden."
  },
  "artwork.export.subLead": {
    es: "Copia para enviar o imprimir (foto principal o imagen de Documentos). La ficha no se toca.",
    en: "A copy to send or print (main photo or an image from Documents). The record stays untouched.",
    de: "Kopie zum Senden/Drucken (Hauptfoto oder Bild aus Dokumente). Der Datensatz bleibt unverändert."
  },
  "artwork.export.noPhotos": {
    es: "Esta obra no tiene fotos (ni principal ni en Documentos).",
    en: "This artwork has no photos (neither main nor in Documents).",
    de: "Dieses Werk hat keine Fotos (weder Hauptfoto noch in Dokumente)."
  },
  "artwork.export.sourcePixels": {
    es: "Foto: {width}×{height} píxeles.",
    en: "Photo: {width}×{height} pixels.",
    de: "Foto: {width}×{height} Pixel."
  },
  "artwork.export.intent.printHint": {
    es: "Sabes el tamaño del papel (A4, 30×40 cm…).",
    en: "You know the paper size (A4, 30×40 cm…).",
    de: "Du kennst das Papierformat (A4, 30×40 cm…)."
  },
  "artwork.export.intent.dpiHint": {
    es: "Te pidieron «300 DPI» sin tamaño de papel.",
    en: "They asked for «300 DPI» without a paper size.",
    de: "Man hat «300 DPI» ohne Papierformat verlangt."
  },
  "artwork.export.intent.webHint": {
    es: "Cambiar formato o hacer el archivo más ligero.",
    en: "Change the format or make the file lighter.",
    de: "Format ändern oder die Datei leichter machen."
  },
  "artwork.export.stepDpi": {
    es: "3 · DPI (calidad)",
    en: "3 · DPI (quality)",
    de: "3 · DPI (Qualität)"
  },
  "artwork.export.dpiHint": {
    es: "Pon el número que te hayan dicho. Si no dijeron nada: 300.",
    en: "Enter the number you were given. If nobody said: 300.",
    de: "Trage die genannte Zahl ein. Wenn nichts gesagt wurde: 300."
  },
  "artwork.export.quality.otherHint": {
    es: "número libre",
    en: "free number",
    de: "freie Zahl"
  },
  "artwork.export.customDpiLabel": {
    es: "Escribe el número que te han pedido",
    en: "Type the number you were asked for",
    de: "Gib die geforderte Zahl ein"
  },
  "artwork.export.customDpiPlaceholder": {
    es: "ej. 240 o 350",
    en: "e.g. 240 or 350",
    de: "z. B. 240 oder 350"
  },
  "artwork.export.stepPaper": {
    es: "4 · Tamaño del papel (cm)",
    en: "4 · Paper size (cm)",
    de: "4 · Papierformat (cm)"
  },
  "artwork.export.warnUpscale": {
    es: "Esta foto se queda corta para {size} cm a {dpi} DPI. Se puede imprimir, pero puede salir borrosa. Prueba un tamaño menor o una foto con más píxeles.",
    en: "This photo falls short for {size} cm at {dpi} DPI. It can be printed, but it may look blurry. Try a smaller size or a photo with more pixels.",
    de: "Dieses Foto reicht für {size} cm bei {dpi} DPI nicht aus. Drucken geht, kann aber unscharf werden. Versuche ein kleineres Format oder ein Foto mit mehr Pixeln."
  },
  "artwork.export.warnLowDpi": {
    es: "Esta foto tiene {pixels} píxeles. A {size} cm eso son solo {effective} DPI (pediste {asked}). Va a salir borrosa. Elige un papel más pequeño o una foto con más píxeles.",
    en: "This photo is {pixels} pixels. At {size} cm that is only {effective} DPI (you asked for {asked}). It will look blurry. Pick smaller paper or a photo with more pixels.",
    de: "Dieses Foto hat {pixels} Pixel. Bei {size} cm sind das nur {effective} DPI (gewünscht: {asked}). Es wird unscharf. Nimm kleineres Papier oder ein Foto mit mehr Pixeln."
  },
  "artwork.export.warnSoftDpi": {
    es: "Esta foto tiene {pixels} píxeles. A {size} cm da {effective} DPI (pediste {asked}). Se puede imprimir, pero no tan nítida como pediste.",
    en: "This photo is {pixels} pixels. At {size} cm that is {effective} DPI (you asked for {asked}). Printable, but not as sharp as requested.",
    de: "Dieses Foto hat {pixels} Pixel. Bei {size} cm ergibt das {effective} DPI (gewünscht: {asked}). Druckbar, aber nicht so scharf wie gewünscht."
  },
  "artwork.export.okPrint": {
    es: "La foto da de sobra para {size} cm a {dpi} DPI. Saldrá nítida.",
    en: "The photo is more than enough for {size} cm at {dpi} DPI. It will look sharp.",
    de: "Das Foto reicht locker für {size} cm bei {dpi} DPI. Es wird scharf."
  },
  "artwork.export.metadataMax": {
    es: "A {dpi} DPI, esta foto se puede imprimir nítida hasta unos {size} cm.",
    en: "At {dpi} DPI, this photo prints sharp up to about {size} cm.",
    de: "Bei {dpi} DPI lässt sich dieses Foto scharf bis etwa {size} cm drucken."
  },
  "artwork.export.metadataNote": {
    es: "Este ajuste no mejora la foto: solo apunta el número que te pidieron. Para un tamaño concreto usa «Imprimir».",
    en: "This setting does not improve the photo: it only records the number you were asked for. For a specific size use «Print».",
    de: "Diese Einstellung verbessert das Foto nicht: sie notiert nur die geforderte Zahl. Für ein konkretes Format nutze «Drucken»."
  },
  "artwork.export.stepFile": {
    es: "{n} · El archivo",
    en: "{n} · The file",
    de: "{n} · Die Datei"
  },
  "artwork.export.fileType": {
    es: "Tipo de archivo",
    en: "File type",
    de: "Dateityp"
  },
  "artwork.export.format.jpg": {
    es: "JPG — lo normal para fotos",
    en: "JPG — the usual for photos",
    de: "JPG — das Übliche für Fotos"
  },
  "artwork.export.format.png": {
    es: "PNG — pesa más",
    en: "PNG — larger file",
    de: "PNG — größere Datei"
  },
  "artwork.export.format.pdf": {
    es: "PDF — una página",
    en: "PDF — one page",
    de: "PDF — eine Seite"
  },
  "artwork.export.limitToggle": {
    es: "También me han puesto un límite de peso",
    en: "They also gave me a file-size limit",
    de: "Mir wurde auch eine Größengrenze genannt"
  },
  "artwork.export.maxSize": {
    es: "Peso máximo del archivo",
    en: "Maximum file size",
    de: "Maximale Dateigröße"
  },
  "artwork.export.sizePlaceholder": {
    es: "ej. {n}",
    en: "e.g. {n}",
    de: "z. B. {n}"
  },
  "artwork.export.compressWarning": {
    es: "Comprimir el archivo baja la calidad de la foto. Solo úsalo si te exigen un máximo de MB.",
    en: "Compressing the file lowers the photo quality. Only use it if a maximum size is required.",
    de: "Komprimieren senkt die Fotoqualität. Nutze es nur, wenn eine Maximalgröße verlangt wird."
  },
  "artwork.export.samePhoto": {
    es: "Misma foto",
    en: "Same photo",
    de: "Gleiches Foto"
  },
  "artwork.export.maxAbbrev": { es: "máx.", en: "max.", de: "max." },
  "artwork.export.doneQuality": {
    es: "calidad {dpi}",
    en: "quality {dpi}",
    de: "Qualität {dpi}"
  },
  "artwork.export.done": {
    es: "Guardada · {details}",
    en: "Saved · {details}",
    de: "Gespeichert · {details}"
  },

  "artwork.exportBulk.title": {
    es: "Salvar múltiple",
    en: "Save multiple",
    de: "Mehrere speichern"
  },
  "artwork.exportBulk.lead": {
    es: "Elige varias obras. Se usa la foto principal de cada una.",
    en: "Pick several artworks. Each one’s main photo is used.",
    de: "Wähle mehrere Werke. Es wird jeweils das Hauptfoto verwendet."
  },
  "artwork.exportBulk.stepWorks": {
    es: "1 · Qué obras",
    en: "1 · Which artworks",
    de: "1 · Welche Werke"
  },
  "artwork.exportBulk.chooseWorks": {
    es: "Elegir obras…",
    en: "Choose artworks…",
    de: "Werke wählen…"
  },
  "artwork.exportBulk.changeWorks": {
    es: "Cambiar obras ({n})",
    en: "Change artworks ({n})",
    de: "Werke ändern ({n})"
  },
  "artwork.exportBulk.worksHint": {
    es: "Solo se exporta la foto principal de cada obra.",
    en: "Only each artwork’s main photo is exported.",
    de: "Es wird nur das Hauptfoto jedes Werks exportiert."
  },
  "artwork.exportBulk.worksReady": {
    es: "{ready} de {total} con foto principal",
    en: "{ready} of {total} with a main photo",
    de: "{ready} von {total} mit Hauptfoto"
  },
  "artwork.exportBulk.worksNoPhoto": {
    es: "{n} sin foto (se omiten)",
    en: "{n} without a photo (skipped)",
    de: "{n} ohne Foto (werden übersprungen)"
  },
  "artwork.exportBulk.pickTitle": {
    es: "Elegir obras para exportar",
    en: "Choose artworks to export",
    de: "Werke zum Export wählen"
  },
  "artwork.exportBulk.pickNotice": {
    es: "Se usará la foto principal de cada obra seleccionada.",
    en: "The main photo of each selected artwork will be used.",
    de: "Es wird das Hauptfoto jedes ausgewählten Werks verwendet."
  },
  "artwork.exportBulk.useArtworkSize": {
    es: "Usar el tamaño (cm) de cada obra",
    en: "Use each artwork’s size (cm)",
    de: "Größe (cm) jedes Werks verwenden"
  },
  "artwork.exportBulk.useArtworkSizeHint": {
    es: "Si una obra no tiene alto y ancho, se omite en modo imprimir.",
    en: "If an artwork has no height and width, it is skipped in print mode.",
    de: "Fehlen Höhe und Breite, wird das Werk im Druckmodus übersprungen."
  },
  "artwork.exportBulk.printIndividually": {
    es: "Si es para imprimir a un tamaño concreto, hazlo obra por obra: ahí verás si la foto queda nítida.",
    en: "If you need to print at a specific size, do it one artwork at a time — there you can see whether the photo is sharp enough.",
    de: "Für einen konkreten Druckgröße speichere einzeln: dort siehst du, ob das Foto scharf genug ist."
  },
  "artwork.exportBulk.stepDest": {
    es: "4 · Dónde guardar",
    en: "4 · Where to save",
    de: "4 · Speicherort"
  },
  "artwork.exportBulk.dest.generated": {
    es: "Carpeta generated",
    en: "generated folder",
    de: "Ordner generated"
  },
  "artwork.exportBulk.dest.generatedHint": {
    es: "Las fotos se guardan sueltas (archivos individuales) en generated.",
    en: "Photos are saved as individual files inside generated.",
    de: "Fotos werden als einzelne Dateien in generated gespeichert."
  },
  "artwork.exportBulk.dest.choose": {
    es: "Mi propia carpeta",
    en: "My own folder",
    de: "Eigener Ordner"
  },
  "artwork.exportBulk.dest.chooseHint": {
    es: "Elige un sitio y se crea una carpeta con el nombre que pongas; todas las fotos van dentro.",
    en: "Pick a location; a folder with the name you type is created, and all photos go inside.",
    de: "Ort wählen; es wird ein Ordner mit deinem Namen erstellt, alle Fotos kommen hinein."
  },
  "artwork.exportBulk.folderName": {
    es: "Nombre de la carpeta nueva",
    en: "New folder name",
    de: "Name des neuen Ordners"
  },
  "artwork.exportBulk.folderNameHint": {
    es: "Todas las fotos van juntas en esta carpeta nueva.",
    en: "All photos go together in this new folder.",
    de: "Alle Fotos landen gemeinsam in diesem neuen Ordner."
  },
  "artwork.exportBulk.summary": {
    es: "{n} fotos · {format}",
    en: "{n} photos · {format}",
    de: "{n} Fotos · {format}"
  },
  "artwork.exportBulk.save": {
    es: "Salvar {n} fotos",
    en: "Save {n} photos",
    de: "{n} Fotos speichern"
  },
  "artwork.exportBulk.progress": {
    es: "Guardando {n} fotos…",
    en: "Saving {n} photos…",
    de: "{n} Fotos werden gespeichert…"
  },
  "artwork.exportBulk.doneSaved": {
    es: "{n} guardadas",
    en: "{n} saved",
    de: "{n} gespeichert"
  },
  "artwork.exportBulk.doneSkipped": {
    es: "{n} omitidas",
    en: "{n} skipped",
    de: "{n} übersprungen"
  },
  "artwork.exportBulk.doneFailed": {
    es: "{n} con error",
    en: "{n} failed",
    de: "{n} fehlgeschlagen"
  },
  "artwork.exportBulk.doneFolder": {
    es: "carpeta «{folder}»",
    en: "folder «{folder}»",
    de: "Ordner «{folder}»"
  },
  "artwork.exportBulk.error.pickWorks": {
    es: "Elige al menos una obra.",
    en: "Choose at least one artwork.",
    de: "Wähle mindestens ein Werk."
  },
  "artwork.exportBulk.error.noPhotos": {
    es: "Ninguna de las obras elegidas tiene foto principal.",
    en: "None of the chosen artworks has a main photo.",
    de: "Keines der gewählten Werke hat ein Hauptfoto."
  },
  "artwork.exportBulk.error.folderName": {
    es: "Escribe un nombre para la carpeta.",
    en: "Enter a folder name.",
    de: "Gib einen Ordnernamen ein."
  },
  "artwork.exportBulk.error.noPrintSize": {
    es: "Ninguna obra tiene tamaño en cm. Desactiva «Usar el tamaño de cada obra» y pon ancho y alto, o completa las fichas.",
    en: "No artwork has a size in cm. Turn off “Use each artwork’s size” and enter width and height, or fill in the artwork records.",
    de: "Kein Werk hat eine Größe in cm. Deaktiviere «Größe jedes Werks» und gib Breite und Höhe ein, oder ergänze die Werkdaten."
  },

  /* ── Movements ──────────────────────────────────────────────────────── */
  "movement.intro": {
    es: "Historial de la obra: ventas, exposiciones, préstamos y regalos. Lo más reciente aparece arriba.",
    en: "Artwork history: sales, exhibitions, loans, and gifts. Newest first.",
    de: "Werkverlauf: Verkäufe, Ausstellungen, Leihgaben und Geschenke. Neueste zuerst."
  },
  "movement.empty.title": {
    es: "Sin movimientos todavía",
    en: "No movements yet",
    de: "Noch keine Bewegungen"
  },
  "movement.empty.hint": {
    es: "Cuando vendas, prestes o expongas la obra, regístralo aquí.",
    en: "When you sell, loan, or exhibit the work, record it here.",
    de: "Wenn du das Werk verkaufst, verleihst oder ausstellst, trage es hier ein."
  },
  "movement.add": {
    es: "+ Añadir movimiento",
    en: "+ Add movement",
    de: "+ Bewegung hinzufügen"
  },
  "movement.remove": { es: "Quitar", en: "Remove", de: "Entfernen" },
  "movement.removeFull": {
    es: "Quitar movimiento",
    en: "Remove movement",
    de: "Bewegung entfernen"
  },
  "movement.modal.add": {
    es: "Añadir movimiento",
    en: "Add movement",
    de: "Bewegung hinzufügen"
  },
  "movement.modal.edit": {
    es: "Editar movimiento",
    en: "Edit movement",
    de: "Bewegung bearbeiten"
  },
  "movement.copy.which": {
    es: "¿Qué copia?",
    en: "Which copy?",
    de: "Welches Exemplar?"
  },
  "movement.copy.whole": {
    es: "Toda la obra",
    en: "Whole artwork",
    de: "Ganzes Werk"
  },
  "movement.field.type": {
    es: "Tipo de movimiento",
    en: "Movement type",
    de: "Bewegungsart"
  },
  "movement.field.date": { es: "Fecha", en: "Date", de: "Datum" },
  "movement.field.notes": { es: "Notas", en: "Notes", de: "Notizen" },
  "movement.field.price": { es: "Precio", en: "Price", de: "Preis" },
  "movement.save": { es: "Salvar", en: "Save", de: "Speichern" },
  "movement.loan.from": {
    es: "Desde (de cuándo)",
    en: "From (since when)",
    de: "Von (ab wann)"
  },
  "movement.loan.until": {
    es: "Hasta (a cuándo)",
    en: "Until (until when)",
    de: "Bis (bis wann)"
  },
  "movement.loan.indefinite": {
    es: "Sin fecha de devolución (indefinido)",
    en: "No return date (open-ended)",
    de: "Kein Rückgabedatum (unbefristet)"
  },
  "movement.loan.personOrGallery": {
    es: "¿A una persona o galería?",
    en: "To a person or gallery?",
    de: "An eine Person oder Galerie?"
  },
  "movement.loan.person": { es: "Persona", en: "Person", de: "Person" },
  "movement.loan.gallery": { es: "Galería", en: "Gallery", de: "Galerie" },
  "movement.loan.returned": {
    es: "Ya devuelta al estudio",
    en: "Already returned to the studio",
    de: "Bereits zurück im Atelier"
  },
  "movement.payment.hint": {
    es: "Entregar la obra a la galería cuenta como gasto en Cuentas (mitad del valor de la obra).",
    en: "Giving the work to the gallery counts as an expense in Accounts (half the artwork value).",
    de: "Das Werk an die Galerie zu geben zählt in Konten als Ausgabe (halber Werkwert)."
  },
  "movement.payment.gallery": {
    es: "Galería que recibe la obra",
    en: "Gallery receiving the artwork",
    de: "Galerie, die das Werk erhält"
  },
  "movement.payment.value": {
    es: "Valor / coste (50% del precio de la obra)",
    en: "Value / cost (50% of artwork price)",
    de: "Wert / Kosten (50 % des Werkpreises)"
  },
  "movement.lost.hint": {
    es: "Marca la obra como perdida. No podrá haber movimientos posteriores.",
    en: "Mark the artwork as lost. No later movements are allowed.",
    de: "Werk als verloren markieren. Danach sind keine Bewegungen mehr möglich."
  },
  "movement.exhibition.dateFromShow": {
    es: "Las fechas se toman de la exposición si las dejas vacías.",
    en: "Dates are taken from the exhibition if you leave them blank.",
    de: "Daten kommen aus der Ausstellung, wenn du sie leer lässt."
  },
  "movement.exhibition.stayedWithGallery": {
    es: "Se quedó con la galería tras la exposición",
    en: "Stayed with the gallery after the exhibition",
    de: "Blieb nach der Ausstellung bei der Galerie"
  },
  "movement.exhibition.listedPrice": {
    es: "Precio de lista en la exposición",
    en: "Listed price at the exhibition",
    de: "Listenpreis in der Ausstellung"
  },
  "movement.exhibition.select": {
    es: "Exposición",
    en: "Exhibition",
    de: "Ausstellung"
  },
  "movement.exhibition.createNew": {
    es: "Crear una exposición nueva",
    en: "Create a new exhibition",
    de: "Neue Ausstellung anlegen"
  },
  "movement.sale.direct": {
    es: "Directa (sin galería)",
    en: "Direct (no gallery)",
    de: "Direkt (ohne Galerie)"
  },
  "movement.sale.viaGallery": {
    es: "A través de una galería",
    en: "Through a gallery",
    de: "Über eine Galerie"
  },
  "movement.sale.atExhibition": {
    es: "En una exposición",
    en: "At an exhibition",
    de: "Auf einer Ausstellung"
  },
  "movement.sale.taxAsked": {
    es: "¿Se cobró impuesto?",
    en: "Was tax charged?",
    de: "Wurde Steuer berechnet?"
  },
  "movement.sale.taxNote": {
    es: "El impuesto se registra en Excel; aquí guardas el neto recibido.",
    en: "Tax is recorded in Excel; here you store the net amount received.",
    de: "Die Steuer landet in Excel; hier speicherst du den Nettobetrag."
  },
  "movement.sale.buyer": {
    es: "Comprador/a (opcional)",
    en: "Buyer (optional)",
    de: "Käufer/in (optional)"
  },
  "movement.sale.galleryQuestion": {
    es: "¿Qué galería? (el comprador queda asociado a la galería)",
    en: "Which gallery? (buyer is linked to the gallery)",
    de: "Welche Galerie? (Käufer/in wird der Galerie zugeordnet)"
  },
  "movement.sale.received": {
    es: "Recibido (parte que te queda)",
    en: "Received (your share)",
    de: "Erhalten (dein Anteil)"
  },
  "movement.error.singleSale": {
    es: "Esta obra ya tiene una venta. Solo puede haber una.",
    en: "This artwork already has a sale. Only one is allowed.",
    de: "Dieses Werk hat schon einen Verkauf. Nur einer ist erlaubt."
  },
  "movement.error.copySale": {
    es: "Esta copia ya tiene una venta registrada.",
    en: "This copy already has a sale recorded.",
    de: "Für dieses Exemplar gibt es schon einen Verkauf."
  },
  "movement.error.wholeSaleDup": {
    es: "Ya hay una venta de «toda la obra». No se puede duplicar.",
    en: "There is already a sale of the «whole artwork». It cannot be duplicated.",
    de: "Es gibt schon einen Verkauf des «ganzen Werks». Das geht nicht doppelt."
  },
  "movement.error.needDate": {
    es: "Cada movimiento necesita una fecha.",
    en: "Every movement needs a date.",
    de: "Jede Bewegung braucht ein Datum."
  },
  "movement.error.singleTerminal": {
    es: "Solo puede haber una salida definitiva (venta, pago a galerista o pérdida).",
    en: "Only one final exit is allowed (sale, gallery payment, or loss).",
    de: "Nur ein endgültiger Abgang ist erlaubt (Verkauf, Galeriezahlung oder Verlust)."
  },
  "movement.error.afterTerminal": {
    es: "No puede haber movimientos después de una venta, pago a galerista o pérdida.",
    en: "No movements are allowed after a sale, gallery payment, or loss.",
    de: "Nach Verkauf, Galeriezahlung oder Verlust sind keine Bewegungen mehr erlaubt."
  },
  "movement.detail.type": { es: "Tipo", en: "Type", de: "Typ" },
  "movement.detail.date": { es: "Fecha", en: "Date", de: "Datum" },
  "movement.detail.copy": { es: "Copia", en: "Copy", de: "Exemplar" },
  "movement.detail.exhibition": {
    es: "Exposición",
    en: "Exhibition",
    de: "Ausstellung"
  },
  "movement.detail.result": { es: "Resultado", en: "Result", de: "Ergebnis" },
  "movement.detail.returned": {
    es: "Devuelta al estudio",
    en: "Returned to the studio",
    de: "Zurück im Atelier"
  },
  "movement.detail.withGalleryAfter": {
    es: "Con galería tras la exposición",
    en: "With gallery after the exhibition",
    de: "Bei Galerie nach der Ausstellung"
  },
  "movement.detail.inExhibition": {
    es: "En exposición",
    en: "In exhibition",
    de: "In Ausstellung"
  },
  "movement.detail.price": { es: "Precio", en: "Price", de: "Preis" },
  "movement.detail.receivedNet": {
    es: "Recibido (neto)",
    en: "Received (net)",
    de: "Erhalten (netto)"
  },
  "movement.detail.context": { es: "Contexto", en: "Context", de: "Kontext" },
  "movement.detail.buyer": { es: "Comprador/a", en: "Buyer", de: "Käufer/in" },
  "movement.detail.contact": { es: "Contacto", en: "Contact", de: "Kontakt" },
  "movement.detail.notes": { es: "Notas", en: "Notes", de: "Notizen" },
  "movement.summary.exhibition": {
    es: "Exposición · {title}",
    en: "Exhibition · {title}",
    de: "Ausstellung · {title}"
  },
  "movement.summary.returned": {
    es: "Devuelta al estudio",
    en: "Returned to the studio",
    de: "Zurück im Atelier"
  },
  "movement.summary.withGalleryAfter": {
    es: "Con galería tras exposición",
    en: "With gallery after show",
    de: "Bei Galerie nach Ausstellung"
  },
  "movement.summary.inExhibition": {
    es: "En exposición",
    en: "In exhibition",
    de: "In Ausstellung"
  },
  "movement.error.terminalExists": {
    es: "Ya hay una salida definitiva. Elige otro tipo o quita esa salida.",
    en: "There is already a final exit. Choose another type or remove that exit.",
    de: "Es gibt bereits einen endgültigen Abgang. Wähle eine andere Art oder entferne ihn."
  },
  "movement.loan.warningHint": {
    es: "El aviso rojo solo mira el último movimiento (préstamo o exposición).",
    en: "The red warning only looks at the latest movement (loan or exhibition).",
    de: "Der rote Hinweis betrachtet nur die letzte Bewegung (Leihgabe oder Ausstellung)."
  },
  "movement.payment.valuePlaceholder": { es: "ej. 2000", en: "e.g. 2000", de: "z. B. 2000" },
  "movement.payment.autoCalc": {
    es: "Calculado solo: mitad de {amount} (factores × alto+ancho). Puedes corregirlo a mano.",
    en: "Calculated automatically: half of {amount} (factors × height+width). You can correct it by hand.",
    de: "Automatisch berechnet: Hälfte von {amount} (Faktoren × Höhe+Breite). Du kannst es von Hand ändern."
  },
  "movement.payment.autoFill": {
    es: "Se rellena solo con la mitad del valor según factores y fecha.",
    en: "Filled in automatically with half the value based on factors and date.",
    de: "Wird automatisch mit dem halben Wert nach Faktoren und Datum gefüllt."
  },
  "movement.exhibition.warningHint": {
    es: "El aviso rojo solo mira el último movimiento. Si añades otra exposición después, no hace falta marcar «devuelta» en la anterior.",
    en: "The red warning only looks at the latest movement. If you add another exhibition afterwards, you do not need to mark the previous one as «returned».",
    de: "Der rote Hinweis betrachtet nur die letzte Bewegung. Wenn du danach eine weitere Ausstellung einträgst, musst du die vorige nicht als «zurück» markieren."
  },
  "movement.exhibition.listedPriceOptional": {
    es: "Precio de lista en la exposición (opcional)",
    en: "Listed price at the exhibition (optional)",
    de: "Listenpreis in der Ausstellung (optional)"
  },
  "movement.exhibition.listedPricePlaceholder": {
    es: "ej. 1.200 €",
    en: "e.g. €1,200",
    de: "z. B. 1.200 €"
  },
  "movement.sale.context": {
    es: "Contexto de la venta",
    en: "Sale context",
    de: "Kontext des Verkaufs"
  },
  "movement.sale.taxNoNote": {
    es: "Si eliges «No», esta venta solo entra en el resumen Excel si marcas «Incluir ventas sin impuesto».",
    en: "If you choose «No», this sale only appears in the Excel summary when «Include sales without tax» is ticked.",
    de: "Bei «Nein» erscheint dieser Verkauf nur in der Excel-Übersicht, wenn «Verkäufe ohne Steuer einbeziehen» aktiviert ist."
  },
  "movement.sale.receivedPlaceholder": {
    es: "ej. 700 €",
    en: "e.g. €700",
    de: "z. B. 700 €"
  },
  "movement.sale.commissionNote": {
    es: "La galería suele quedarse una comisión; aquí va lo que realmente recibe la artista.",
    en: "The gallery usually keeps a commission; enter what the artist actually receives.",
    de: "Die Galerie behält meist eine Provision; hier steht, was die Künstlerin wirklich bekommt."
  },
  "movement.detail.viaGallery": {
    es: "A través de galería",
    en: "Through a gallery",
    de: "Über eine Galerie"
  },
  "movement.detail.atExhibition": {
    es: "En exposición: {title}",
    en: "At exhibition: {title}",
    de: "In Ausstellung: {title}"
  },

  /* ── Contacts ───────────────────────────────────────────────────────── */
  "contact.kind.person": { es: "Persona", en: "Person", de: "Person" },
  "contact.kind.gallery": { es: "Galería", en: "Gallery", de: "Galerie" },
  "contact.kind.museum": { es: "Museo", en: "Museum", de: "Museum" },
  "contact.kind.collection": { es: "Colección", en: "Collection", de: "Sammlung" },
  "contact.kind.persons": { es: "Personas", en: "People", de: "Personen" },
  "contact.kind.galleries": { es: "Galerías", en: "Galleries", de: "Galerien" },
  "contact.kind.museums": { es: "Museos", en: "Museums", de: "Museen" },
  "contact.kind.collections": {
    es: "Colecciones",
    en: "Collections",
    de: "Sammlungen"
  },
  "contacts.search": {
    es: "Buscar contacto...",
    en: "Search contact...",
    de: "Kontakt suchen..."
  },
  "contacts.filter.place": { es: "Lugar", en: "Place", de: "Ort" },
  "contacts.sort.name": {
    es: "Nombre (A→Z)",
    en: "Name (A→Z)",
    de: "Name (A→Z)"
  },
  "contacts.sort.recent": { es: "Recientes", en: "Recent", de: "Zuletzt" },
  "contacts.add": { es: "+ Nuevo…", en: "+ New…", de: "+ Neu…" },
  "contacts.col.type": { es: "Tipo", en: "Type", de: "Typ" },
  "contacts.col.name": { es: "Nombre", en: "Name", de: "Name" },
  "contacts.col.place": { es: "Lugar", en: "Place", de: "Ort" },
  "contacts.col.relation": { es: "Relación", en: "Relation", de: "Beziehung" },
  "contacts.col.contact": { es: "Contacto", en: "Contact", de: "Kontakt" },
  "contacts.col.since": { es: "Desde", en: "Since", de: "Seit" },
  "contacts.empty": {
    es: "Aún no hay personas ni galerías.",
    en: "No people or galleries yet.",
    de: "Noch keine Personen oder Galerien."
  },
  "contact.form.titleNew": {
    es: "Nueva {kind}",
    en: "New {kind}",
    de: "Neue/r {kind}"
  },
  "contact.form.titleEdit": {
    es: "Editar {kind}",
    en: "Edit {kind}",
    de: "{kind} bearbeiten"
  },
  "contact.form.addGallery": {
    es: "Añadir galería nueva",
    en: "Add new gallery",
    de: "Neue Galerie hinzufügen"
  },
  "contact.form.addPerson": {
    es: "Añadir persona nueva",
    en: "Add new person",
    de: "Neue Person hinzufügen"
  },
  "contact.form.nameGallery": {
    es: "Nombre de la galería",
    en: "Gallery name",
    de: "Galeriename"
  },
  "contact.form.nameMuseum": {
    es: "Nombre del museo",
    en: "Museum name",
    de: "Museumsname"
  },
  "contact.form.nameCollection": {
    es: "Nombre de la colección",
    en: "Collection name",
    de: "Sammlungsname"
  },
  "contact.form.city": { es: "Ciudad", en: "City", de: "Stadt" },
  "contact.form.country": { es: "País", en: "Country", de: "Land" },
  "contact.form.website": { es: "Sitio web", en: "Website", de: "Website" },
  "contact.form.firstContactYear": {
    es: "Año de primer contacto",
    en: "Year of first contact",
    de: "Jahr des ersten Kontakts"
  },
  "contact.form.phone": { es: "Teléfono", en: "Phone", de: "Telefon" },
  "contact.form.email": { es: "Email", en: "Email", de: "E-Mail" },
  "contact.form.relation": {
    es: "Relación / contacto",
    en: "Relation / contact",
    de: "Beziehung / Kontakt"
  },
  "contact.form.gallerist": {
    es: "Galerista (persona de referencia)",
    en: "Gallerist (reference person)",
    de: "Galerist/in (Ansprechperson)"
  },
  "contact.form.comments": { es: "Comentarios", en: "Comments", de: "Kommentare" },
  "contact.form.firstName": { es: "Nombre", en: "First name", de: "Vorname" },
  "contact.form.lastName": { es: "Apellido", en: "Last name", de: "Nachname" },
  "contact.form.birthday": { es: "Cumpleaños", en: "Birthday", de: "Geburtstag" },
  "contact.form.profession": { es: "Profesión", en: "Profession", de: "Beruf" },
  "contact.form.linkedTo": {
    es: "Vinculada a…",
    en: "Linked to…",
    de: "Verknüpft mit…"
  },
  "contact.form.none": { es: "— Ninguna —", en: "— None —", de: "— Keine —" },
  "contact.detail.data": {
    es: "Datos de contacto",
    en: "Contact details",
    de: "Kontaktdaten"
  },
  "contact.detail.stat.exhibitions": {
    es: "Exposiciones",
    en: "Exhibitions",
    de: "Ausstellungen"
  },
  "contact.detail.stat.shown": {
    es: "Cuadros expuestos",
    en: "Works shown",
    de: "Ausgestellte Werke"
  },
  "contact.detail.stat.soldVia": {
    es: "Vendidos vía galería",
    en: "Sold via gallery",
    de: "Über Galerie verkauft"
  },
  "contact.detail.stat.billed": {
    es: "Dinero facturado",
    en: "Amount billed",
    de: "Fakturiert"
  },
  "contact.detail.stat.received": {
    es: "Dinero recibido",
    en: "Amount received",
    de: "Erhalten"
  },
  "contact.detail.viewByExhibition": {
    es: "Ver por exposición",
    en: "View by exhibition",
    de: "Nach Ausstellung"
  },
  "contact.detail.allExhibitions": {
    es: "Todas las exposiciones",
    en: "All exhibitions",
    de: "Alle Ausstellungen"
  },
  "contact.detail.people": {
    es: "Personas ({count})",
    en: "People ({count})",
    de: "Personen ({count})"
  },
  "contact.detail.addPerson": {
    es: "+ Añadir persona",
    en: "+ Add person",
    de: "+ Person hinzufügen"
  },
  "contact.detail.shownWorks": {
    es: "Cuadros expuestos",
    en: "Works shown",
    de: "Ausgestellte Werke"
  },
  "contact.detail.status.returned": {
    es: "Devuelta",
    en: "Returned",
    de: "Zurück"
  },
  "contact.detail.status.stayed": {
    es: "Se quedó con la galería",
    en: "Stayed with the gallery",
    de: "Blieb bei der Galerie"
  },
  "contact.detail.status.inShow": {
    es: "En exposición",
    en: "In exhibition",
    de: "In Ausstellung"
  },
  "contact.detail.salesViaGallery": {
    es: "Ventas por la galería",
    en: "Sales via the gallery",
    de: "Verkäufe über die Galerie"
  },
  "contact.detail.group.none": {
    es: "Sin agrupar",
    en: "Ungrouped",
    de: "Nicht gruppiert"
  },
  "contact.detail.group.exhibition": {
    es: "Por exposición",
    en: "By exhibition",
    de: "Nach Ausstellung"
  },
  "contact.detail.group.year": { es: "Por año", en: "By year", de: "Nach Jahr" },
  "contact.detail.billed": { es: "Facturado", en: "Billed", de: "Fakturiert" },
  "contact.detail.received": { es: "Recibido", en: "Received", de: "Erhalten" },
  "contact.detail.galleryPayment": {
    es: "Pago a galerista",
    en: "Gallery payment",
    de: "Zahlung an Galerie"
  },
  "contact.detail.givenAsPayment": {
    es: "Entregada como pago",
    en: "Given as payment",
    de: "Als Zahlung übergeben"
  },
  "contact.detail.emptyShownInExhibition": {
    es: "Sin cuadros en esta exposición.",
    en: "No works in this exhibition.",
    de: "Keine Werke in dieser Ausstellung."
  },
  "contact.detail.emptyShown": {
    es: "Sin cuadros expuestos asociados.",
    en: "No linked shown works.",
    de: "Keine verknüpften ausgestellten Werke."
  },
  "contact.detail.emptySalesInExhibition": {
    es: "Sin ventas en esta exposición.",
    en: "No sales in this exhibition.",
    de: "Keine Verkäufe in dieser Ausstellung."
  },
  "contact.detail.emptySales": {
    es: "Sin ventas registradas.",
    en: "No sales recorded.",
    de: "Keine Verkäufe erfasst."
  },
  "contact.detail.buyerUnknown": {
    es: "Comprador/a sin registrar",
    en: "Unregistered buyer",
    de: "Käufer/in nicht erfasst"
  },
  "contact.detail.noExhibition": {
    es: "Sin exposición",
    en: "No exhibition",
    de: "Keine Ausstellung"
  },
  "contact.detail.saleViaGallery": {
    es: "Venta en galería",
    en: "Gallery sale",
    de: "Galerieverkauf"
  },

  /* ── Exhibitions ────────────────────────────────────────────────────── */
  "exhibitions.search": {
    es: "Buscar exposición...",
    en: "Search exhibition...",
    de: "Ausstellung suchen..."
  },
  "exhibitions.filter.country": { es: "País", en: "Country", de: "Land" },
  "exhibitions.filter.year": { es: "Año", en: "Year", de: "Jahr" },
  "exhibitions.sort.recent": { es: "Recientes", en: "Recent", de: "Zuletzt" },
  "exhibitions.sort.title": {
    es: "Título (A→Z)",
    en: "Title (A→Z)",
    de: "Titel (A→Z)"
  },
  "exhibitions.sort.year": { es: "Año", en: "Year", de: "Jahr" },
  "exhibitions.add": {
    es: "+ Añadir exposición",
    en: "+ Add exhibition",
    de: "+ Ausstellung hinzufügen"
  },
  "exhibitions.col.exhibition": {
    es: "Exposición",
    en: "Exhibition",
    de: "Ausstellung"
  },
  "exhibitions.col.place": { es: "Lugar", en: "Place", de: "Ort" },
  "exhibitions.col.gallery": { es: "Galería", en: "Gallery", de: "Galerie" },
  "exhibitions.col.dates": { es: "Fechas", en: "Dates", de: "Daten" },
  "exhibitions.col.works": { es: "Obras", en: "Works", de: "Werke" },
  "exhibitions.empty": {
    es: "Aún no hay exposiciones.",
    en: "No exhibitions yet.",
    de: "Noch keine Ausstellungen."
  },
  "exhibition.form.titleNew": {
    es: "Nueva exposición",
    en: "New exhibition",
    de: "Neue Ausstellung"
  },
  "exhibition.form.titleEdit": {
    es: "Editar exposición",
    en: "Edit exhibition",
    de: "Ausstellung bearbeiten"
  },
  "exhibition.form.fallbackTitle": {
    es: "Añadir exposición",
    en: "Add exhibition",
    de: "Ausstellung hinzufügen"
  },
  "exhibition.form.generateBooklet": {
    es: "Generar folleto de obras",
    en: "Generate artwork booklet",
    de: "Werkbroschüre erstellen"
  },
  "exhibition.section.identity": { es: "Identidad", en: "Identity", de: "Identität" },
  "exhibition.section.location": { es: "Ubicación", en: "Location", de: "Ort" },
  "exhibition.section.dates": { es: "Fechas", en: "Dates", de: "Daten" },
  "exhibition.section.contacts": { es: "Contactos", en: "Contacts", de: "Kontakte" },
  "exhibition.section.comments": {
    es: "Comentarios",
    en: "Comments",
    de: "Kommentare"
  },
  "exhibition.section.works": { es: "Obras", en: "Works", de: "Werke" },
  "exhibition.section.sales": { es: "Ventas", en: "Sales", de: "Verkäufe" },
  "exhibition.section.documents": {
    es: "Documentos",
    en: "Documents",
    de: "Dokumente"
  },
  "exhibition.field.title": { es: "Título", en: "Title", de: "Titel" },
  "exhibition.field.titlePlaceholder": {
    es: "Nombre de la exposición",
    en: "Exhibition name",
    de: "Name der Ausstellung"
  },
  "exhibition.field.venue": { es: "Lugar / sala", en: "Venue / room", de: "Ort / Raum" },
  "exhibition.field.venuePlaceholder": {
    es: "Galería, museo, sala…",
    en: "Gallery, museum, room…",
    de: "Galerie, Museum, Raum…"
  },
  "exhibition.field.type": { es: "Tipo", en: "Type", de: "Typ" },
  "exhibition.field.city": { es: "Ciudad", en: "City", de: "Stadt" },
  "exhibition.field.country": { es: "País", en: "Country", de: "Land" },
  "exhibition.field.from": { es: "Desde", en: "From", de: "Von" },
  "exhibition.field.until": { es: "Hasta", en: "Until", de: "Bis" },
  "exhibition.field.curator": { es: "Curador/a", en: "Curator", de: "Kurator/in" },
  "exhibition.field.organizingGallery": {
    es: "Galería organizadora (opcional)",
    en: "Organizing gallery (optional)",
    de: "Organisierende Galerie (optional)"
  },
  "exhibition.field.notesPlaceholder": {
    es: "Notas internas sobre la exposición…",
    en: "Internal notes about the exhibition…",
    de: "Interne Notizen zur Ausstellung…"
  },
  "exhibition.works.inShow": {
    es: "En esta exposición ({count})",
    en: "In this exhibition ({count})",
    de: "In dieser Ausstellung ({count})"
  },
  "exhibition.works.add": {
    es: "Añadir obras a la exposición",
    en: "Add works to the exhibition",
    de: "Werke zur Ausstellung hinzufügen"
  },
  "exhibition.works.viewArtwork": {
    es: "Ver la obra",
    en: "View artwork",
    de: "Werk ansehen"
  },
  "exhibition.works.setPrice": {
    es: "Poner precio",
    en: "Set price",
    de: "Preis setzen"
  },
  "exhibition.works.soldBefore": {
    es: "Ya vendida antes de esta exposición.",
    en: "Already sold before this exhibition.",
    de: "Bereits vor dieser Ausstellung verkauft."
  },
  "exhibition.sales.title": {
    es: "Ventas en esta exposición",
    en: "Sales at this exhibition",
    de: "Verkäufe in dieser Ausstellung"
  },
  "exhibition.sales.add": {
    es: "+ Añadir venta",
    en: "+ Add sale",
    de: "+ Verkauf hinzufügen"
  },
  "exhibition.sales.save": {
    es: "Salvar venta",
    en: "Save sale",
    de: "Verkauf speichern"
  },
  "exhibition.sales.error": {
    es: "No se pudo registrar la venta.",
    en: "Could not record the sale.",
    de: "Verkauf konnte nicht erfasst werden."
  },
  "exhibition.docs.title": {
    es: "Documentos de la exposición",
    en: "Exhibition documents",
    de: "Ausstellungsdokumente"
  },
  "exhibition.docs.add": {
    es: "+ Añadir documento",
    en: "+ Add document",
    de: "+ Dokument hinzufügen"
  },
  "exhibition.modal.title": {
    es: "Nueva exposición",
    en: "New exhibition",
    de: "Neue Ausstellung"
  },

  /* ── Pricing / factors ──────────────────────────────────────────────── */
  "pricing.eyebrow": { es: "Precios", en: "Prices", de: "Preise" },
  "pricing.title": {
    es: "Factores y precios",
    en: "Factors and prices",
    de: "Faktoren und Preise"
  },
  "pricing.lead": {
    es: "Precio = base × factor de tamaño × (1 + impuesto). Ajusta tamaños e impuestos aquí.",
    en: "Price = base × size factor × (1 + tax). Adjust sizes and taxes here.",
    de: "Preis = Basis × Größenfaktor × (1 + Steuer). Größen und Steuern hier anpassen."
  },
  "pricing.generateSheet": {
    es: "Generar hoja",
    en: "Generate sheet",
    de: "Tabelle erzeugen"
  },
  "pricing.size.title": { es: "Tamaños", en: "Sizes", de: "Größen" },
  "pricing.size.add": {
    es: "+ Nuevo tamaño",
    en: "+ New size",
    de: "+ Neue Größe"
  },
  "pricing.size.empty": {
    es: "Aún no hay tamaños definidos.",
    en: "No sizes defined yet.",
    de: "Noch keine Größen definiert."
  },
  "pricing.size.col.name": { es: "Nombre", en: "Name", de: "Name" },
  "pricing.size.col.range": { es: "Rango", en: "Range", de: "Bereich" },
  "pricing.size.col.factor": { es: "Factor", en: "Factor", de: "Faktor" },
  "pricing.size.modalNew": {
    es: "Nuevo tamaño",
    en: "New size",
    de: "Neue Größe"
  },
  "pricing.size.modalEdit": { es: "Tamaño", en: "Size", de: "Größe" },
  "pricing.size.chip.small": { es: "Pequeño", en: "Small", de: "Klein" },
  "pricing.size.chip.medium": { es: "Mediano", en: "Medium", de: "Mittel" },
  "pricing.size.chip.large": { es: "Grande", en: "Large", de: "Groß" },
  "pricing.size.namePlaceholder": {
    es: "Ej. Extra grande",
    en: "E.g. Extra large",
    de: "Z. B. Extra groß"
  },
  "pricing.size.range": {
    es: "de {from} a {to}",
    en: "from {from} to {to}",
    de: "von {from} bis {to}"
  },
  "pricing.size.rangeOpen": {
    es: "de {from} a sin límite",
    en: "from {from} with no upper limit",
    de: "von {from} ohne Obergrenze"
  },
  "pricing.tax.title": { es: "Impuestos", en: "Taxes", de: "Steuern" },
  "pricing.fixed.title": {
    es: "Precios fijos por técnica",
    en: "Fixed prices by technique",
    de: "Festpreise nach Technik"
  },
  "pricing.fixed.lead": {
    es: "Estas técnicas no usan el factor de tamaño. Cada una tiene un precio fijo que puede cambiar con el tiempo (igual que los factores).",
    en: "These techniques do not use the size factor. Each one has a flat price that can change over time (same idea as factors).",
    de: "Diese Techniken nutzen keinen Größenfaktor. Jede hat einen Festpreis, der sich über die Zeit ändern kann (wie bei den Faktoren)."
  },
  "pricing.fixed.col.price": { es: "Precio (€)", en: "Price (€)", de: "Preis (€)" },
  "pricing.fixed.col.periods": {
    es: "Periodos",
    en: "Periods",
    de: "Zeiträume"
  },
  "pricing.fixed.col.now": { es: "Ahora", en: "Now", de: "Jetzt" },
  "pricing.fixed.periodsCount": {
    es: "{count} periodos",
    en: "{count} periods",
    de: "{count} Zeiträume"
  },
  "pricing.fixed.add": {
    es: "+ Técnica",
    en: "+ Technique",
    de: "+ Technik"
  },
  "pricing.fixed.empty": {
    es: "Aún no hay técnicas con precio fijo. Añade una (por ejemplo una que hayas creado tú).",
    en: "No fixed-price techniques yet. Add one (for example one you created yourself).",
    de: "Noch keine Techniken mit Festpreis. Füge eine hinzu (z. B. eine selbst angelegte)."
  },
  "pricing.fixed.addTitle": {
    es: "Añadir técnica con precio fijo",
    en: "Add fixed-price technique",
    de: "Technik mit Festpreis hinzufügen"
  },
  "pricing.fixed.addHint": {
    es: "Elige una técnica de la lista (incluye las que hayas añadido a mano). Luego podrás poner el precio y sus cambios en el tiempo.",
    en: "Pick a technique from the list (including ones you added yourself). Then you can set the price and how it changes over time.",
    de: "Wähle eine Technik aus der Liste (auch selbst angelegte). Danach kannst du den Preis und seine Änderungen über die Zeit setzen."
  },
  "pricing.fixed.noneLeft": {
    es: "Todas las técnicas ya tienen precio fijo, o todavía no hay ninguna en el inventario.",
    en: "Every technique already has a fixed price, or there are none in the inventory yet.",
    de: "Alle Techniken haben schon einen Festpreis, oder es gibt noch keine im Inventar."
  },
  "pricing.fixed.editTitle": {
    es: "Precio de «{name}»",
    en: "Price for «{name}»",
    de: "Preis für «{name}»"
  },
  "pricing.fixed.editHint": {
    es: "Cada tarjeta dice: «a partir de esta fecha, el precio es este». La más reciente es la que vale ahora.",
    en: "Each card means: «from this date, the price is this». The latest one is the current price.",
    de: "Jede Karte bedeutet: «ab diesem Datum gilt dieser Preis». Die neueste gilt jetzt."
  },
  "pricing.fixed.addPeriod": {
    es: "+ Cambió el precio (nueva fecha)",
    en: "+ Price changed (new date)",
    de: "+ Preis geändert (neues Datum)"
  },
  "pricing.fixed.removeTechnique": {
    es: "Quitar esta técnica",
    en: "Remove this technique",
    de: "Diese Technik entfernen"
  },
  "pricing.fixed.error.needDate": {
    es: "Elige la fecha desde la que vale el nuevo precio.",
    en: "Choose the date from which the new price applies.",
    de: "Wähle das Datum, ab dem der neue Preis gilt."
  },
  "pricing.fixed.error.needPrice": {
    es: "Escribe el nuevo precio (un número mayor que 0).",
    en: "Enter the new price (a number greater than 0).",
    de: "Gib den neuen Preis ein (eine Zahl größer als 0)."
  },
  "pricing.fixed.error.needRow": {
    es: "Añade al menos un precio.",
    en: "Add at least one price.",
    de: "Füge mindestens einen Preis hinzu."
  },
  "pricing.fixed.error.pricePositive": {
    es: "Cada precio debe ser un número mayor que 0.",
    en: "Each price must be a number greater than 0.",
    de: "Jeder Preis muss eine Zahl größer als 0 sein."
  },
  "pricing.history.fixedPrice": {
    es: "Precio fijo",
    en: "Fixed price",
    de: "Festpreis"
  },
  "pricing.history.fixedTechnique": {
    es: "Por técnica (sin factor de tamaño)",
    en: "By technique (no size factor)",
    de: "Nach Technik (ohne Größenfaktor)"
  },
  "pricing.tax.addCountry": { es: "+ País", en: "+ Country", de: "+ Land" },
  "pricing.tax.countryPlaceholder": {
    es: "Ej. España",
    en: "E.g. Spain",
    de: "Z. B. Spanien"
  },
  "pricing.tax.usedNow": {
    es: "Se usa ahora",
    en: "In use now",
    de: "Aktuell in Gebrauch"
  },
  "pricing.tax.stillValid": {
    es: "Sigue vigente",
    en: "Still valid",
    de: "Weiterhin gültig"
  },
  "pricing.tax.emptyFromStart": {
    es: "Vacío = desde el principio",
    en: "Empty = from the start",
    de: "Leer = von Anfang an"
  },
  "pricing.tax.addPeriod": {
    es: "+ Cambió el impuesto…",
    en: "+ Tax changed…",
    de: "+ Steuer geändert…"
  },
  "pricing.history.size": {
    es: "Tamaño (alto + ancho)",
    en: "Size (height + width)",
    de: "Größe (Höhe + Breite)"
  },
  "pricing.history.basePrice": {
    es: "Precio base {year}",
    en: "Base price {year}",
    de: "Basispreis {year}"
  },
  "pricing.history.showTax": {
    es: "Mostrar línea con impuesto",
    en: "Show line with tax",
    de: "Linie mit Steuer zeigen"
  },
  "pricing.history.empty": {
    es: "Aún no hay historial de precios para esta obra.",
    en: "No price history for this artwork yet.",
    de: "Noch kein Preisverlauf für dieses Werk."
  },
  "pricing.toast.sheetSaved": {
    es: "Hoja de cálculo guardada.",
    en: "Spreadsheet saved.",
    de: "Tabelle gespeichert."
  },
  "pricing.toast.saved": {
    es: "Factores y precios guardados.",
    en: "Factors and prices saved.",
    de: "Faktoren und Preise gespeichert."
  },
  "pricing.export.pickWorks": {
    es: "Elegir obras para la hoja",
    en: "Choose works for the sheet",
    de: "Werke für die Tabelle wählen"
  },
  "pricing.leadFactors": {
    es: "Precio = (alto + ancho) × factor. Los tamaños van de pequeño a grande y no pueden solaparse.",
    en: "Price = (height + width) × factor. Sizes go from small to large and cannot overlap.",
    de: "Preis = (Höhe + Breite) × Faktor. Die Größen gehen von klein bis groß und dürfen sich nicht überschneiden."
  },
  "pricing.error.overlapSave": {
    es: "No se puede guardar: «{a}» se solapa con «{b}». Corrige los rangos antes.",
    en: "Cannot save: «{a}» overlaps with «{b}». Fix the ranges first.",
    de: "Speichern nicht möglich: «{a}» überschneidet sich mit «{b}». Korrigiere zuerst die Bereiche."
  },
  "pricing.period.fromDate": { es: "A partir de", en: "From", de: "Ab" },
  "pricing.period.fromWhen": {
    es: "¿Desde qué fecha vale?",
    en: "From which date does it apply?",
    de: "Ab welchem Datum gilt es?"
  },
  "pricing.size.emptyFriendly": {
    es: "Todavía no hay tamaños. Empieza con uno, por ejemplo «Pequeño».",
    en: "No sizes yet. Start with one, for example «Small».",
    de: "Noch keine Größen. Fang mit einer an, zum Beispiel «Klein»."
  },
  "pricing.size.col.rangeSum": {
    es: "Rango (alto + ancho)",
    en: "Range (height + width)",
    de: "Bereich (Höhe + Breite)"
  },
  "pricing.size.otherName": {
    es: "Otro nombre",
    en: "Another name",
    de: "Anderer Name"
  },
  "pricing.size.rangeTitle": {
    es: "Rango en cm (alto + ancho)",
    en: "Range in cm (height + width)",
    de: "Bereich in cm (Höhe + Breite)"
  },
  "pricing.size.factorsTitle": {
    es: "Factores en el tiempo",
    en: "Factors over time",
    de: "Faktoren im Zeitverlauf"
  },
  "pricing.size.factorsHint": {
    es: "Cada tarjeta dice: «a partir de esta fecha, el factor es este». La más reciente es la que se usa hoy.",
    en: "Each card says: «from this date on, the factor is this». The most recent one is the one used today.",
    de: "Jede Karte sagt: «ab diesem Datum gilt dieser Faktor». Die neueste gilt heute."
  },
  "pricing.size.addChange": {
    es: "+ Cambiar el factor (nueva fecha)",
    en: "+ Change the factor (new date)",
    de: "+ Faktor ändern (neues Datum)"
  },
  "pricing.size.newFactor": {
    es: "Nuevo factor",
    en: "New factor",
    de: "Neuer Faktor"
  },
  "pricing.size.whichFactor": {
    es: "¿Cuál es el factor?",
    en: "What is the factor?",
    de: "Wie hoch ist der Faktor?"
  },
  "pricing.size.factorPlaceholder": { es: "Ej. 22", en: "E.g. 22", de: "Z. B. 22" },
  "pricing.size.delete": {
    es: "Eliminar tamaño",
    en: "Delete size",
    de: "Größe löschen"
  },
  "pricing.size.error.needDate": {
    es: "Elige la fecha desde la que vale el nuevo factor.",
    en: "Choose the date from which the new factor applies.",
    de: "Wähle das Datum, ab dem der neue Faktor gilt."
  },
  "pricing.size.error.needFactor": {
    es: "Escribe el nuevo factor (un número mayor que 0).",
    en: "Enter the new factor (a number greater than 0).",
    de: "Gib den neuen Faktor ein (eine Zahl größer als 0)."
  },
  "pricing.size.error.needName": {
    es: "Pon un nombre al tamaño (por ejemplo Pequeño).",
    en: "Give the size a name (for example Small).",
    de: "Gib der Größe einen Namen (zum Beispiel Klein)."
  },
  "pricing.size.error.badRange": {
    es: "El «hasta» no puede ser menor que el «desde».",
    en: "The «to» value cannot be lower than the «from» value.",
    de: "Der «bis»-Wert darf nicht kleiner als der «von»-Wert sein."
  },
  "pricing.size.error.overlap": {
    es: "No permitido: se solapa con «{name}» ({range}). Los rangos no pueden coincidir ni cruzarse.",
    en: "Not allowed: it overlaps with «{name}» ({range}). Ranges cannot match or cross each other.",
    de: "Nicht erlaubt: überschneidet sich mit «{name}» ({range}). Bereiche dürfen nicht gleich sein oder sich kreuzen."
  },
  "pricing.size.error.needFactorRow": {
    es: "Añade al menos un factor.",
    en: "Add at least one factor.",
    de: "Füge mindestens einen Faktor hinzu."
  },
  "pricing.size.error.factorDates": {
    es: "Cada factor necesita una fecha de inicio. No dejes fechas vacías.",
    en: "Every factor needs a start date. Do not leave dates empty.",
    de: "Jeder Faktor braucht ein Startdatum. Lass keine Daten leer."
  },
  "pricing.size.error.factorPositive": {
    es: "Cada factor debe ser un número mayor que 0.",
    en: "Every factor must be a number greater than 0.",
    de: "Jeder Faktor muss eine Zahl größer als 0 sein."
  },
  "pricing.tax.modalNew": { es: "Nuevo país", en: "New country", de: "Neues Land" },
  "pricing.tax.modalEdit": {
    es: "Impuesto del país",
    en: "Country tax",
    de: "Steuer des Landes"
  },
  "pricing.tax.periodsTitle": {
    es: "Impuestos en el tiempo",
    en: "Taxes over time",
    de: "Steuern im Zeitverlauf"
  },
  "pricing.tax.periodsHint": {
    es: "Cada tarjeta es un periodo: «a partir de esta fecha, el IVA es este %». Si el impuesto cambia, añade otro periodo; no hace falta otra fila de país. El más reciente es el que se usa hoy.",
    en: "Each card is a period: «from this date on, VAT is this %». If the tax changes, add another period; you do not need another country row. The most recent one is the one used today.",
    de: "Jede Karte ist ein Zeitraum: «ab diesem Datum gilt dieser MwSt.-Satz». Wenn sich die Steuer ändert, füge einen weiteren Zeitraum hinzu; eine zweite Länderzeile ist nicht nötig. Der neueste gilt heute."
  },
  "pricing.tax.until": { es: "Hasta {date}", en: "Until {date}", de: "Bis {date}" },
  "pricing.tax.percent": { es: "Impuesto %", en: "Tax %", de: "Steuer %" },
  "pricing.tax.addPeriodDate": {
    es: "+ Cambió el impuesto (nueva fecha)",
    en: "+ The tax changed (new date)",
    de: "+ Steuer geändert (neues Datum)"
  },
  "pricing.tax.newPercent": {
    es: "Nuevo porcentaje",
    en: "New percentage",
    de: "Neuer Prozentsatz"
  },
  "pricing.tax.whichPercent": {
    es: "¿Cuál es el %?",
    en: "What is the %?",
    de: "Wie hoch ist der Prozentsatz?"
  },
  "pricing.tax.percentPlaceholder": { es: "Ej. 21", en: "E.g. 21", de: "Z. B. 21" },
  "pricing.tax.delete": {
    es: "Eliminar país",
    en: "Delete country",
    de: "Land löschen"
  },
  "pricing.tax.emptyFriendly": {
    es: "Aún no hay países. Añade uno para poner su IVA.",
    en: "No countries yet. Add one to set its VAT.",
    de: "Noch keine Länder. Füge eines hinzu, um die Mehrwertsteuer festzulegen."
  },
  "pricing.tax.col.periods": { es: "Periodos", en: "Periods", de: "Zeiträume" },
  "pricing.tax.col.now": { es: "Ahora", en: "Now", de: "Jetzt" },
  "pricing.tax.onePercent": {
    es: "1 porcentaje",
    en: "1 percentage",
    de: "1 Prozentsatz"
  },
  "pricing.tax.periodCount": {
    es: "{count} periodos",
    en: "{count} periods",
    de: "{count} Zeiträume"
  },
  "pricing.tax.note": {
    es: "Entra en un país para ver o cambiar el impuesto. Si el IVA sube o baja, añade un periodo con la fecha del cambio — no hace falta otro país.",
    en: "Open a country to see or change its tax. If VAT goes up or down, add a period with the date of the change — you do not need another country.",
    de: "Öffne ein Land, um die Steuer zu sehen oder zu ändern. Wenn die MwSt. steigt oder sinkt, füge einen Zeitraum mit dem Änderungsdatum hinzu — ein zweites Land ist nicht nötig."
  },
  "pricing.tax.error.needDate": {
    es: "Elige la fecha desde la que vale el nuevo impuesto.",
    en: "Choose the date from which the new tax applies.",
    de: "Wähle das Datum, ab dem die neue Steuer gilt."
  },
  "pricing.tax.error.negative": {
    es: "El porcentaje no puede ser negativo.",
    en: "The percentage cannot be negative.",
    de: "Der Prozentsatz darf nicht negativ sein."
  },
  "pricing.tax.error.needCountry": {
    es: "Escribe el nombre del país.",
    en: "Enter the name of the country.",
    de: "Gib den Namen des Landes ein."
  },
  "pricing.tax.error.duplicate": {
    es: "Ese país ya existe. Ábrelo para cambiar sus impuestos.",
    en: "That country already exists. Open it to change its taxes.",
    de: "Dieses Land gibt es schon. Öffne es, um die Steuern zu ändern."
  },
  "pricing.tax.error.needRate": {
    es: "Añade al menos un porcentaje.",
    en: "Add at least one percentage.",
    de: "Füge mindestens einen Prozentsatz hinzu."
  },
  "pricing.tax.error.rateNumber": {
    es: "Cada porcentaje debe ser un número válido (0 o más).",
    en: "Every percentage must be a valid number (0 or more).",
    de: "Jeder Prozentsatz muss eine gültige Zahl sein (0 oder mehr)."
  },
  "pricing.tax.error.oneWithoutDate": {
    es: "Solo puede haber un impuesto «desde el principio». Los cambios necesitan fecha.",
    en: "There can only be one tax «from the start». Changes need a date.",
    de: "Es kann nur eine Steuer «von Anfang an» geben. Änderungen brauchen ein Datum."
  },
  "pricing.tax.error.duplicateDate": {
    es: "No repitas la misma fecha de inicio en dos cambios.",
    en: "Do not repeat the same start date in two changes.",
    de: "Verwende dasselbe Startdatum nicht für zwei Änderungen."
  },
  "pricing.history.noSize": {
    es: "Sin medidas",
    en: "No dimensions",
    de: "Keine Maße"
  },
  "pricing.history.withTax": {
    es: "Con impuesto ({country} {rate}%)",
    en: "With tax ({country} {rate}%)",
    de: "Mit Steuer ({country} {rate} %)"
  },
  "pricing.history.seriesBase": {
    es: "Precio por factor",
    en: "Price by factor",
    de: "Preis nach Faktor"
  },
  "pricing.history.seriesTax": {
    es: "Con impuesto ({country})",
    en: "With tax ({country})",
    de: "Mit Steuer ({country})"
  },
  "pricing.history.taxCountry": {
    es: "País (impuesto)",
    en: "Country (tax)",
    de: "Land (Steuer)"
  },
  "pricing.history.noFactors": {
    es: "Todavía no hay factores definidos. Ve a «Factores y precios» para añadir los tipos de tamaño y sus factores.",
    en: "No factors defined yet. Go to «Factors and prices» to add the size types and their factors.",
    de: "Noch keine Faktoren definiert. Gehe zu «Faktoren und Preise», um Größentypen und ihre Faktoren anzulegen."
  },
  "pricing.history.noBand": {
    es: "El tamaño de esta obra ({size} cm) no encaja en ningún tipo. Revisa los rangos en «Factores y precios».",
    en: "The size of this artwork ({size} cm) does not fit any type. Check the ranges in «Factors and prices».",
    de: "Die Größe dieses Werks ({size} cm) passt in keinen Typ. Prüfe die Bereiche in «Faktoren und Preise»."
  },
  "pricing.history.needSize": {
    es: "Añade el alto y el ancho de la obra para calcular el precio.",
    en: "Add the height and width of the artwork to calculate the price.",
    de: "Füge Höhe und Breite des Werks hinzu, um den Preis zu berechnen."
  },
  "pricing.history.noChartData": {
    es: "Aún no hay datos para mostrar una gráfica.",
    en: "No data to show a chart yet.",
    de: "Noch keine Daten für ein Diagramm."
  },
  "pricing.payment.missingSize": {
    es: "Faltan alto y ancho de la obra. Complétalos en la ficha para calcular el valor.",
    en: "The height and width of the artwork are missing. Fill them in on the record to calculate the value.",
    de: "Höhe und Breite des Werks fehlen. Ergänze sie im Datensatz, um den Wert zu berechnen."
  },
  "pricing.payment.noFactors": {
    es: "No hay factores definidos. Ve a «Factores y precios» y configura los tamaños.",
    en: "No factors defined. Go to «Factors and prices» and set up the sizes.",
    de: "Keine Faktoren definiert. Gehe zu «Faktoren und Preise» und richte die Größen ein."
  },
  "pricing.payment.noBand": {
    es: "Ningún tamaño cubre {size} cm (alto+ancho). Ajusta los rangos en «Factores y precios».",
    en: "No size covers {size} cm (height+width). Adjust the ranges in «Factors and prices».",
    de: "Keine Größe deckt {size} cm (Höhe+Breite) ab. Passe die Bereiche in «Faktoren und Preise» an."
  },
  "pricing.payment.noFactor": {
    es: "«{name}» no tiene factor. Añádelo en «Factores y precios».",
    en: "«{name}» has no factor. Add one in «Factors and prices».",
    de: "«{name}» hat keinen Faktor. Füge ihn in «Faktoren und Preise» hinzu."
  },
  "pricing.payment.thatSize": {
    es: "Ese tamaño",
    en: "That size",
    de: "Diese Größe"
  },
  "pricing.export.title": {
    es: "Generar hoja de precios",
    en: "Generate price sheet",
    de: "Preistabelle erzeugen"
  },
  "pricing.export.step1": {
    es: "1. ¿Incluir impuesto?",
    en: "1. Include tax?",
    de: "1. Steuer einbeziehen?"
  },
  "pricing.export.withTax": {
    es: "Sí, con impuesto",
    en: "Yes, with tax",
    de: "Ja, mit Steuer"
  },
  "pricing.export.baseOnly": {
    es: "No, solo precio base",
    en: "No, base price only",
    de: "Nein, nur Basispreis"
  },
  "pricing.export.step2": {
    es: "2. País del impuesto",
    en: "2. Tax country",
    de: "2. Land der Steuer"
  },
  "pricing.export.noCountries": {
    es: "Aún no hay países. Añádelos abajo en Impuestos.",
    en: "No countries yet. Add them below under Taxes.",
    de: "Noch keine Länder. Füge sie unten bei Steuern hinzu."
  },
  "pricing.export.stepWorks": {
    es: "{n}. ¿Qué obras?",
    en: "{n}. Which artworks?",
    de: "{n}. Welche Werke?"
  },
  "pricing.export.allWorks": {
    es: "Todas ({count})",
    en: "All ({count})",
    de: "Alle ({count})"
  },
  "pricing.export.chooseWorks": {
    es: "Elegir… ({count} seleccionadas)",
    en: "Choose… ({count} selected)",
    de: "Wählen… ({count} ausgewählt)"
  },
  "pricing.export.stepDate": {
    es: "{n}. ¿Con el factor de qué fecha?",
    en: "{n}. Using the factor from which date?",
    de: "{n}. Mit dem Faktor von welchem Datum?"
  },
  "pricing.export.dateHint": {
    es: "Se usa el factor vigente en esa fecha (sirve si cambió a mitad de año).",
    en: "The factor valid on that date is used (useful if it changed mid-year).",
    de: "Es gilt der an diesem Datum gültige Faktor (nützlich bei Änderungen mitten im Jahr)."
  },
  "pricing.export.generateExcel": {
    es: "Generar Excel",
    en: "Generate Excel",
    de: "Excel erzeugen"
  },
  "pricing.export.needWorks": {
    es: "Elige al menos una obra.",
    en: "Choose at least one artwork.",
    de: "Wähle mindestens ein Werk."
  },
  "pricing.export.col.sum": { es: "Suma (cm)", en: "Sum (cm)", de: "Summe (cm)" },
  "pricing.export.col.base": { es: "Base (€)", en: "Base (€)", de: "Basis (€)" },
  "pricing.export.col.withTax": {
    es: "Con impuesto {country} (€)",
    en: "With tax {country} (€)",
    de: "Mit Steuer {country} (€)"
  },

  /* ── Price chart ────────────────────────────────────────────────────── */
  "chart.noData": {
    es: "No hay datos suficientes para dibujar la gráfica.",
    en: "Not enough data to draw the chart.",
    de: "Nicht genügend Daten für das Diagramm."
  },
  "chart.tip.noListedPrice": {
    es: "{label} ({year}) · sin precio de lista",
    en: "{label} ({year}) · no listed price",
    de: "{label} ({year}) · kein Listenpreis"
  },
  "chart.tip.sale": {
    es: "Venta: {amount} ({year})",
    en: "Sale: {amount} ({year})",
    de: "Verkauf: {amount} ({year})"
  },
  "chart.legend.exhibitionPrice": {
    es: "Precio en exposición",
    en: "Price at exhibition",
    de: "Preis in Ausstellung"
  },
  "chart.legend.exhibitionNoPrice": {
    es: "Exposición sin precio",
    en: "Exhibition without price",
    de: "Ausstellung ohne Preis"
  },
  "chart.legend.salePrice": {
    es: "Precio de venta",
    en: "Sale price",
    de: "Verkaufspreis"
  },

  /* ── Financials / accounts ──────────────────────────────────────────── */
  "financials.eyebrow": { es: "Dinero", en: "Money", de: "Geld" },
  "financials.title": { es: "Cuentas", en: "Accounts", de: "Konten" },
  "financials.lead": {
    es: "Gastos y lo recibido por ventas. Los importes se pueden ocultar.",
    en: "Expenses and amounts received from sales. Figures can be hidden.",
    de: "Ausgaben und Einnahmen aus Verkäufen. Beträge können ausgeblendet werden."
  },
  "financials.hideAmounts": {
    es: "Ocultar importes",
    en: "Hide amounts",
    de: "Beträge ausblenden"
  },
  "financials.showAmounts": {
    es: "Mostrar importes",
    en: "Show amounts",
    de: "Beträge anzeigen"
  },
  "financials.filter.year": { es: "Año", en: "Year", de: "Jahr" },
  "financials.filter.thisYear": {
    es: "Este año",
    en: "This year",
    de: "Dieses Jahr"
  },
  "financials.filter.allTime": {
    es: "Todo el tiempo",
    en: "All time",
    de: "Gesamte Zeit"
  },
  "financials.filter.pickDates": {
    es: "Elegir fechas…",
    en: "Pick dates…",
    de: "Daten wählen…"
  },
  "financials.filter.expenseType": {
    es: "Tipo de gasto",
    en: "Expense type",
    de: "Ausgabenart"
  },
  "financials.totals.spent": { es: "Gastado", en: "Spent", de: "Ausgegeben" },
  "financials.totals.received": { es: "Recibido", en: "Received", de: "Erhalten" },
  "financials.actions.addExpense": {
    es: "+ Añadir un gasto",
    en: "+ Add an expense",
    de: "+ Ausgabe hinzufügen"
  },
  "financials.actions.excelSummary": {
    es: "Hacer resumen en Excel",
    en: "Make Excel summary",
    de: "Excel-Übersicht erstellen"
  },
  "financials.expenses.title": {
    es: "Gastos del periodo",
    en: "Expenses for the period",
    de: "Ausgaben im Zeitraum"
  },
  "financials.expenses.empty": {
    es: "No hay gastos en este periodo.",
    en: "No expenses in this period.",
    de: "Keine Ausgaben in diesem Zeitraum."
  },
  "financials.expense.type.materials": {
    es: "Materiales",
    en: "Materials",
    de: "Materialien"
  },
  "financials.expense.type.exhibition": {
    es: "Exposición",
    en: "Exhibition",
    de: "Ausstellung"
  },
  "financials.expense.type.other": { es: "Otros", en: "Other", de: "Sonstiges" },
  "financials.expense.amount": { es: "Importe", en: "Amount", de: "Betrag" },
  "financials.expense.date": { es: "Fecha", en: "Date", de: "Datum" },
  "financials.expense.note": { es: "Nota", en: "Note", de: "Notiz" },
  "financials.expense.notePlaceholder": {
    es: "Ej. tubos de óleo, transporte a Madrid…",
    en: "E.g. oil tubes, transport to Madrid…",
    de: "Z. B. Ölfarben, Transport nach Madrid…"
  },
  "financials.expense.ticket": { es: "Ticket", en: "Receipt", de: "Beleg" },
  "financials.expense.galleryPayment": {
    es: "Pago a galerista",
    en: "Gallery payment",
    de: "Zahlung an Galerie"
  },
  "financials.export.title": {
    es: "Hacer un resumen en Excel",
    en: "Make an Excel summary",
    de: "Excel-Übersicht erstellen"
  },
  "financials.export.create": {
    es: "Crear Excel",
    en: "Create Excel",
    de: "Excel erstellen"
  },
  "financials.export.row.galleryPayment": {
    es: "Pago a galerista",
    en: "Gallery payment",
    de: "Zahlung an Galerie"
  },
  "financials.export.row.saleGallery": {
    es: "Venta en galería",
    en: "Gallery sale",
    de: "Galerieverkauf"
  },
  "financials.export.row.saleExhibition": {
    es: "Venta en exposición",
    en: "Exhibition sale",
    de: "Ausstellungsverkauf"
  },
  "financials.export.row.saleDirect": {
    es: "Venta directa",
    en: "Direct sale",
    de: "Direktverkauf"
  },
  "financials.export.row.artwork": {
    es: "Obra: {title}",
    en: "Artwork: {title}",
    de: "Werk: {title}"
  },
  "financials.toast.expenseSaved": {
    es: "Gasto guardado.",
    en: "Expense saved.",
    de: "Ausgabe gespeichert."
  },
  "financials.toast.ticketSaved": {
    es: "Ticket guardado.",
    en: "Receipt saved.",
    de: "Beleg gespeichert."
  },
  "financials.toast.summarySaved": {
    es: "Resumen guardado.",
    en: "Summary saved.",
    de: "Übersicht gespeichert."
  },
  "financials.toast.expenseDeleted": {
    es: "Gasto eliminado.",
    en: "Expense deleted.",
    de: "Ausgabe gelöscht."
  },
  "financials.leadLong": {
    es: "Anota gastos aquí. Las ventas cuentan lo que tú recibes (después de comisión de galería, si la hay). «Pago a galerista» cuenta como coste.",
    en: "Record expenses here. Sales count what you actually receive (after the gallery commission, if any). «Gallery payment» counts as a cost.",
    de: "Trage hier Ausgaben ein. Verkäufe zählen, was du tatsächlich erhältst (nach Galerieprovision, falls vorhanden). «Zahlung an Galerie» zählt als Kosten."
  },
  "financials.filter.personGallery": {
    es: "Persona / galería",
    en: "Person / gallery",
    de: "Person / Galerie"
  },
  "financials.expenses.countTitle": {
    es: "Gastos ({count})",
    en: "Expenses ({count})",
    de: "Ausgaben ({count})"
  },
  "financials.expenses.none": {
    es: "Todavía no hay gastos",
    en: "No expenses yet",
    de: "Noch keine Ausgaben"
  },
  "financials.expenses.noneInFilter": {
    es: "Ninguno en este filtro",
    en: "None with this filter",
    de: "Keine mit diesem Filter"
  },
  "financials.expenses.emptyFriendly": {
    es: "Todavía no hay gastos. Empieza con «Añadir un gasto».",
    en: "No expenses yet. Start with «Add an expense».",
    de: "Noch keine Ausgaben. Beginne mit «Ausgabe hinzufügen»."
  },
  "financials.payments.countTitle": {
    es: "Pago a galerista ({count})",
    en: "Gallery payment ({count})",
    de: "Zahlung an Galerie ({count})"
  },
  "financials.expense.modalNew": {
    es: "Añadir un gasto",
    en: "Add an expense",
    de: "Ausgabe hinzufügen"
  },
  "financials.expense.modalEdit": {
    es: "Editar gasto",
    en: "Edit expense",
    de: "Ausgabe bearbeiten"
  },
  "financials.expense.qType": {
    es: "¿De qué tipo es?",
    en: "What type is it?",
    de: "Um welche Art handelt es sich?"
  },
  "financials.expense.hint.materials": {
    es: "Lienzos, pintura, marcos…",
    en: "Canvases, paint, frames…",
    de: "Leinwände, Farbe, Rahmen…"
  },
  "financials.expense.hint.exhibition": {
    es: "Transporte, montaje, catálogo…",
    en: "Transport, installation, catalogue…",
    de: "Transport, Aufbau, Katalog…"
  },
  "financials.expense.hint.other": {
    es: "Cualquier otro gasto",
    en: "Any other expense",
    de: "Jede andere Ausgabe"
  },
  "financials.expense.qWhen": {
    es: "¿Cuánto y cuándo?",
    en: "How much and when?",
    de: "Wie viel und wann?"
  },
  "financials.expense.amountEuros": {
    es: "Importe en euros",
    en: "Amount in euros",
    de: "Betrag in Euro"
  },
  "financials.expense.qWhat": {
    es: "¿En qué se gastó?",
    en: "What was it spent on?",
    de: "Wofür wurde es ausgegeben?"
  },
  "financials.expense.shortNote": {
    es: "Nota breve",
    en: "Short note",
    de: "Kurze Notiz"
  },
  "financials.expense.qExhibition": {
    es: "¿Con qué exposición? (opcional)",
    en: "Which exhibition? (optional)",
    de: "Zu welcher Ausstellung? (optional)"
  },
  "financials.expense.galleryOrPerson": {
    es: "Galería o persona",
    en: "Gallery or person",
    de: "Galerie oder Person"
  },
  "financials.expense.qReceipt": {
    es: "Ticket o factura (opcional)",
    en: "Receipt or invoice (optional)",
    de: "Beleg oder Rechnung (optional)"
  },
  "financials.expense.noReceipt": {
    es: "Todavía no hay foto del ticket.",
    en: "No photo of the receipt yet.",
    de: "Noch kein Foto des Belegs."
  },
  "financials.expense.pickReceipt": {
    es: "Hacer foto / elegir imagen",
    en: "Take a photo / choose an image",
    de: "Foto machen / Bild wählen"
  },
  "financials.expense.save": {
    es: "Guardar gasto",
    en: "Save expense",
    de: "Ausgabe speichern"
  },
  "financials.expense.noDescription": {
    es: "Sin descripción",
    en: "No description",
    de: "Keine Beschreibung"
  },
  "financials.expense.error.needAmount": {
    es: "Escribe cuánto se gastó (el importe).",
    en: "Enter how much was spent (the amount).",
    de: "Gib ein, wie viel ausgegeben wurde (den Betrag)."
  },
  "financials.expense.error.amountBeforeReceipt": {
    es: "Antes de adjuntar el ticket, escribe el importe.",
    en: "Enter the amount before attaching the receipt.",
    de: "Gib den Betrag ein, bevor du den Beleg anhängst."
  },
  "financials.expense.error.create": {
    es: "No se pudo crear el gasto.",
    en: "Could not create the expense.",
    de: "Ausgabe konnte nicht erstellt werden."
  },
  "financials.expense.error.attach": {
    es: "No se pudo adjuntar.",
    en: "Could not attach.",
    de: "Anhängen fehlgeschlagen."
  },
  "financials.export.lead": {
    es: "Elige qué incluir. Si no tocas nada, se incluyen todos los gastos y las ventas con impuesto.",
    en: "Choose what to include. If you change nothing, all expenses and the sales with tax are included.",
    de: "Wähle, was enthalten sein soll. Wenn du nichts änderst, sind alle Ausgaben und die Verkäufe mit Steuer enthalten."
  },
  "financials.export.step1": {
    es: "1. ¿Qué periodo?",
    en: "1. Which period?",
    de: "1. Welcher Zeitraum?"
  },
  "financials.export.step2": {
    es: "2. ¿Solo una exposición?",
    en: "2. Only one exhibition?",
    de: "2. Nur eine Ausstellung?"
  },
  "financials.export.step3": {
    es: "3. Incluir también",
    en: "3. Also include",
    de: "3. Zusätzlich einbeziehen"
  },
  "financials.export.allExhibitions": {
    es: "No, todas",
    en: "No, all of them",
    de: "Nein, alle"
  },
  "financials.export.includePayments": {
    es: "Incluir obras «pago a galerista» como gasto",
    en: "Include «gallery payment» artworks as an expense",
    de: "Werke aus «Zahlung an Galerie» als Ausgabe einbeziehen"
  },
  "financials.export.includeNoTax": {
    es: "Incluir ventas sin impuesto",
    en: "Include sales without tax",
    de: "Verkäufe ohne Steuer einbeziehen"
  },
  "financials.export.row.artworkAsPayment": {
    es: "Obra entregada como pago",
    en: "Artwork given as payment",
    de: "Werk als Zahlung übergeben"
  },

  /* ── Series ─────────────────────────────────────────────────────────── */
  "series.page.eyebrow": { es: "Colecciones", en: "Collections", de: "Sammlungen" },
  "series.page.title": {
    es: "Series (metadatos)",
    en: "Series (metadata)",
    de: "Serien (Metadaten)"
  },
  "series.page.lead": {
    es: "Textos y documentos por serie. Las obras se agrupan por el campo Serie.",
    en: "Texts and documents per series. Works are grouped by the Series field.",
    de: "Texte und Dokumente pro Serie. Werke werden über das Feld Serie gruppiert."
  },
  "series.empty.sidebar": {
    es: "Aún no hay series. Asigna una serie a una obra para verla aquí.",
    en: "No series yet. Assign a series to an artwork to see it here.",
    de: "Noch keine Serien. Weise einem Werk eine Serie zu, um sie hier zu sehen."
  },
  "series.empty.pick": {
    es: "Elige una serie…",
    en: "Choose a series…",
    de: "Wähle eine Serie…"
  },
  "series.splitHandle": {
    es: "Ajustar ancho de la lista",
    en: "Resize series list",
    de: "Serienliste vergrößern"
  },
  "series.texts.title": { es: "Textos", en: "Texts", de: "Texte" },
  "series.texts.add": {
    es: "+ Añadir texto",
    en: "+ Add text",
    de: "+ Text hinzufügen"
  },
  "series.texts.new": { es: "Nuevo texto", en: "New text", de: "Neuer Text" },
  "series.texts.topic": { es: "Tema", en: "Topic", de: "Thema" },
  "series.texts.body": { es: "Texto", en: "Text", de: "Text" },
  "series.texts.remove": {
    es: "Quitar este texto",
    en: "Remove this text",
    de: "Diesen Text entfernen"
  },
  "series.texts.editTitle": {
    es: "Editar texto",
    en: "Edit text",
    de: "Text bearbeiten"
  },
  "series.texts.emptyBody": {
    es: "Sin texto todavía.",
    en: "No text yet.",
    de: "Noch kein Text."
  },
  "series.docs.title": { es: "Documentos", en: "Documents", de: "Dokumente" },
  "series.docs.add": {
    es: "Añadir documento",
    en: "Add document",
    de: "Dokument hinzufügen"
  },
  "series.docs.hint": {
    es: "PDFs, Word, imágenes, videos (.mov, .mp4…) u otros archivos de la serie. Arrastra aquí o pulsa Añadir. Puedes añadir una descripción corta a cada uno.",
    en: "PDFs, Word, images, videos (.mov, .mp4…), or other series files. Drag here or press Add. You can add a short description to each.",
    de: "PDFs, Word, Bilder, Videos (.mov, .mp4…) oder andere Seriendateien. Hierher ziehen oder Hinzufügen. Du kannst jedem eine kurze Beschreibung geben."
  },
  "series.docs.empty": {
    es: "Sin documentos todavía.",
    en: "No documents yet.",
    de: "Noch keine Dokumente."
  },
  "series.works": {
    es: "Obras en esta serie ({count})",
    en: "Works in this series ({count})",
    de: "Werke in dieser Serie ({count})"
  },
  "series.field.label": { es: "Serie", en: "Series", de: "Serie" },
  "series.field.placeholder": {
    es: "Elige una serie…",
    en: "Choose a series…",
    de: "Serie wählen…"
  },
  "series.field.none": {
    es: "Sin serie",
    en: "No series",
    de: "Keine Serie"
  },
  "series.field.namePlaceholder": {
    es: "Nombre de la serie",
    en: "Series name",
    de: "Serienname"
  },
  "series.field.createNew": {
    es: "Crear una serie nueva",
    en: "Create a new series",
    de: "Neue Serie anlegen"
  },
  "series.noSeriesLabel": { es: "sin serie", en: "no series", de: "keine Serie" },
  "series.toast.saved": {
    es: "Serie guardada.",
    en: "Series saved.",
    de: "Serie gespeichert."
  },
  "series.toast.docAdded": {
    es: "Documento añadido.",
    en: "Document added.",
    de: "Dokument hinzugefügt."
  },
  "series.toast.docsAdded": {
    es: "{count} documentos añadidos.",
    en: "{count} documents added.",
    de: "{count} Dokumente hinzugefügt."
  },

  /* ── Example library ────────────────────────────────────────────────── */
  "examples.eyebrow": {
    es: "Textos de referencia",
    en: "Reference texts",
    de: "Referenztexte"
  },
  "examples.title": {
    es: "Biblioteca de ejemplos",
    en: "Example library",
    de: "Beispielbibliothek"
  },
  "examples.lead": {
    es: "Fragmentos de estilo para el generador de texto.",
    en: "Style snippets for the text generator.",
    de: "Stilfragmente für den Textgenerator."
  },
  "examples.goGenerator": {
    es: "Ir al generador",
    en: "Go to generator",
    de: "Zum Generator"
  },
  "examples.saveChanges": {
    es: "Guardar cambios",
    en: "Save changes",
    de: "Änderungen speichern"
  },
  "examples.allSaved": {
    es: "Todo guardado",
    en: "All saved",
    de: "Alles gespeichert"
  },
  "examples.search": {
    es: "Buscar ejemplo...",
    en: "Search example...",
    de: "Beispiel suchen..."
  },
  "examples.count": {
    es: "{n} de {total} ejemplos",
    en: "{n} of {total} examples",
    de: "{n} von {total} Beispielen"
  },
  "examples.add": {
    es: "+ Nuevo ejemplo",
    en: "+ New example",
    de: "+ Neues Beispiel"
  },
  "examples.addCategory": {
    es: "Nueva categoría",
    en: "New category",
    de: "Neue Kategorie"
  },
  "examples.view": { es: "Ver", en: "View", de: "Ansehen" },
  "examples.viewHint": {
    es: "Pulsa para leer el texto",
    en: "Click to read the text",
    de: "Tippen, um den Text zu lesen"
  },
  "examples.categoryName": {
    es: "Nombre de la categoría",
    en: "Category name",
    de: "Kategoriename"
  },
  "examples.uncategorized": {
    es: "Sin categoría",
    en: "Uncategorized",
    de: "Ohne Kategorie"
  },
  "examples.categoryPlaceholder": {
    es: "Categoría (opcional)",
    en: "Category (optional)",
    de: "Kategorie (optional)"
  },
  "examples.fold": { es: "Plegar", en: "Collapse", de: "Einklappen" },
  "examples.unfold": { es: "Desplegar", en: "Expand", de: "Ausklappen" },
  "examples.move": { es: "Mover…", en: "Move…", de: "Verschieben…" },
  "examples.moveSelected": {
    es: "Mover seleccionados…",
    en: "Move selected…",
    de: "Ausgewählte verschieben…"
  },
  "examples.moveModal.title": {
    es: "Mover textos a otra categoría",
    en: "Move texts to another category",
    de: "Texte in andere Kategorie verschieben"
  },
  "examples.moveModal.hint": {
    es: "Elige a dónde van. Puedes crear una categoría nueva.",
    en: "Choose where they go. You can create a new category.",
    de: "Ziel wählen. Du kannst eine neue Kategorie anlegen."
  },
  "examples.moveModal.choose": {
    es: "Elige una categoría…",
    en: "Choose a category…",
    de: "Kategorie wählen…"
  },
  "examples.moveModal.target": {
    es: "Categoría destino",
    en: "Destination category",
    de: "Zielkategorie"
  },
  "examples.moveModal.new": {
    es: "— Nueva categoría —",
    en: "— New category —",
    de: "— Neue Kategorie —"
  },
  "examples.moveModal.confirm": {
    es: "Mover aquí",
    en: "Move here",
    de: "Hierher verschieben"
  },
  "examples.moveModal.count": {
    es: "{n} texto(s) a mover",
    en: "{n} text(s) to move",
    de: "{n} Text(e) verschieben"
  },
  "examples.moveAll": {
    es: "Mover todos…",
    en: "Move all…",
    de: "Alle verschieben…"
  },
  "examples.deleteAll": {
    es: "Borrar todos",
    en: "Delete all",
    de: "Alle löschen"
  },
  "examples.select": { es: "Seleccionar", en: "Select", de: "Auswählen" },
  "examples.clearSelection": {
    es: "Quitar selección",
    en: "Clear selection",
    de: "Auswahl aufheben"
  },
  "examples.empty": {
    es: "Aún no hay ejemplos.",
    en: "No examples yet.",
    de: "Noch keine Beispiele."
  },
  "examples.words": {
    es: "{n} palabras",
    en: "{n} words",
    de: "{n} Wörter"
  },
  "examples.showLess": { es: "Ver menos", en: "Show less", de: "Weniger zeigen" },
  "examples.showAll": { es: "Ver entero", en: "Show all", de: "Alles zeigen" },
  "examples.dirty": {
    es: "Tienes cambios sin guardar.",
    en: "You have unsaved changes.",
    de: "Du hast ungespeicherte Änderungen."
  },

  /* ── Reminders + notes (former "Inbox") ─────────────────────────────── */
  "inbox.eyebrow": {
    es: "Contactos y apuntes",
    en: "Contacts and notes",
    de: "Kontakte und Notizen"
  },
  "inbox.title": {
    es: "Recordatorios",
    en: "Reminders",
    de: "Erinnerungen"
  },
  "inbox.lead": {
    es: "Tres bloques: tareas, contactos pendientes y notas.",
    en: "Three blocks: tasks, contact reminders, and notes.",
    de: "Drei Blöcke: Aufgaben, Kontakterinnerungen und Notizen."
  },
  "inbox.autosave": {
    es: "Se guarda solo, no hace falta botón.",
    en: "Saves by itself, no button needed.",
    de: "Speichert automatisch, kein Knopf nötig."
  },
  "inbox.todo.title": { es: "To Do", en: "To Do", de: "To Do" },
  "inbox.todo.leadSimple": {
    es: "Escribe y pulsa Añadir. Marca el círculo cuando esté hecho.",
    en: "Type and press Add. Tap the circle when it’s done.",
    de: "Schreiben und Hinzufügen. Kreis antippen, wenn erledigt."
  },
  "inbox.todo.addShort": { es: "Añadir", en: "Add", de: "Hinzufügen" },
  "inbox.todo.lead": {
    es: "Lista corta. Finalizado → se archiva.",
    en: "Short list. Finished → archives it.",
    de: "Kurze Liste. Fertig → archiviert."
  },
  "inbox.todo.empty": {
    es: "Nada pendiente.",
    en: "Nothing pending.",
    de: "Nichts offen."
  },
  "inbox.todo.placeholder": {
    es: "Qué hay que hacer…",
    en: "What needs doing…",
    de: "Was zu tun ist…"
  },
  "inbox.todo.modalTitle": {
    es: "Nueva tarea",
    en: "New task",
    de: "Neue Aufgabe"
  },
  "inbox.todo.add": { es: "+ Nueva tarea", en: "+ New task", de: "+ Neue Aufgabe" },
  "inbox.todo.done": {
    es: "Hecho",
    en: "Done",
    de: "Fertig"
  },
  "inbox.todo.archived": {
    es: "Movido a finalizadas.",
    en: "Moved to finished.",
    de: "Zu erledigten verschoben."
  },
  "inbox.todo.tooLong": {
    es: "Demasiado largo: esto es una lista de tareas, no una nota.",
    en: "Too long: this is a to-do list, not a note.",
    de: "Zu lang: das ist eine To-do-Liste, keine Notiz."
  },
  "inbox.todo.charHint": {
    es: "{n} caracteres restantes",
    en: "{n} characters left",
    de: "{n} Zeichen übrig"
  },
  "inbox.todo.history": {
    es: "Ver finalizadas…",
    en: "View finished…",
    de: "Erledigte ansehen…"
  },
  "inbox.todo.historyTitle": {
    es: "Tareas finalizadas",
    en: "Finished tasks",
    de: "Erledigte Aufgaben"
  },
  "inbox.todo.historySearch": {
    es: "Buscar entre finalizadas…",
    en: "Search finished…",
    de: "Erledigte durchsuchen…"
  },
  "inbox.todo.historyEmpty": {
    es: "Ninguna tarea finalizada aún.",
    en: "No finished tasks yet.",
    de: "Noch keine erledigten Aufgaben."
  },
  "inbox.todo.restore": {
    es: "Devolver a la lista",
    en: "Put back on to-do",
    de: "Zurück auf die Liste"
  },
  "inbox.todo.restored": {
    es: "Otra vez en Todo.",
    en: "Back on to-do.",
    de: "Wieder auf der To-do-Liste."
  },
  "inbox.reminders": {
    es: "Recordatorios",
    en: "Reminders",
    de: "Erinnerungen"
  },
  "inbox.notes": { es: "Notas", en: "Notes", de: "Notizen" },
  "inbox.reminders.lead": {
    es: "Resumen en la lista. Crear o editar en una ventana.",
    en: "Summaries in the list. Create or edit in a window.",
    de: "Zusammenfassung in der Liste. Erstellen/Bearbeiten im Fenster."
  },
  "inbox.reminders.dueNow": {
    es: "Toca contactar ahora",
    en: "Due now",
    de: "Jetzt fällig"
  },
  "inbox.reminders.all": {
    es: "Próximos",
    en: "Upcoming",
    de: "Demnächst"
  },
  "inbox.reminders.noneDue": {
    es: "Ninguno vencido ahora.",
    en: "None due right now.",
    de: "Gerade nichts fällig."
  },
  "inbox.reminders.noneUpcoming": {
    es: "Todos están vencidos arriba.",
    en: "All are listed as due above.",
    de: "Alle sind oben als fällig."
  },
  "inbox.notes.lead": {
    es: "Pulsa una nota para editarla.",
    en: "Tap a note to edit it.",
    de: "Tippe eine Notiz an, um sie zu bearbeiten."
  },
  "inbox.notes.modalTitle": {
    es: "Nueva nota",
    en: "New note",
    de: "Neue Notiz"
  },
  "inbox.notes.editTitle": {
    es: "Editar nota",
    en: "Edit note",
    de: "Notiz bearbeiten"
  },
  "inbox.notes.viewTitle": {
    es: "Nota",
    en: "Note",
    de: "Notiz"
  },
  "inbox.notes.clickToEdit": {
    es: "Pulsa para editar",
    en: "Click to edit",
    de: "Klicken zum Bearbeiten"
  },
  "inbox.notes.format": {
    es: "Formato",
    en: "Format",
    de: "Format"
  },
  "inbox.notes.bold": {
    es: "Negrita",
    en: "Bold",
    de: "Fett"
  },
  "inbox.notes.bullets": {
    es: "Viñetas",
    en: "Bullets",
    de: "Aufzählung"
  },
  "inbox.notes.numbers": {
    es: "Numeración",
    en: "Numbering",
    de: "Nummerierung"
  },
  "inbox.notes.emptyBody": {
    es: "(vacía)",
    en: "(empty)",
    de: "(leer)"
  },
  "inbox.notes.find": {
    es: "Buscar",
    en: "Search",
    de: "Suchen"
  },
  "inbox.notes.findTitle": {
    es: "Buscar y ordenar",
    en: "Search and sort",
    de: "Suchen und sortieren"
  },
  "inbox.notes.clearFind": {
    es: "Quitar filtros",
    en: "Clear filters",
    de: "Filter löschen"
  },
  "inbox.notes.search": {
    es: "Buscar en las notas…",
    en: "Search notes…",
    de: "Notizen suchen…"
  },
  "inbox.todo.search": {
    es: "Buscar en las tareas…",
    en: "Search tasks…",
    de: "Aufgaben suchen…"
  },
  "inbox.todo.noMatch": {
    es: "Ninguna tarea coincide.",
    en: "No tasks match.",
    de: "Keine passende Aufgabe."
  },
  "inbox.search.hint": {
    es: "Busca por palabras: deben aparecer todas en el texto (sin distinguir mayúsculas).",
    en: "Keyword search: every word you type must appear in the text (case-insensitive).",
    de: "Stichwortsuche: jedes Wort muss im Text vorkommen (ohne Groß-/Kleinschreibung)."
  },
  "inbox.sort.label": {
    es: "Ordenar por",
    en: "Sort by",
    de: "Sortieren nach"
  },
  "inbox.sort.newest": {
    es: "Más nuevas primero",
    en: "Newest first",
    de: "Neueste zuerst"
  },
  "inbox.sort.oldest": {
    es: "Más antiguas primero",
    en: "Oldest first",
    de: "Älteste zuerst"
  },
  "inbox.sort.longest": {
    es: "Más largas primero",
    en: "Longest first",
    de: "Längste zuerst"
  },
  "inbox.sort.shortest": {
    es: "Más cortas primero",
    en: "Shortest first",
    de: "Kürzeste zuerst"
  },
  "inbox.sort.alpha": {
    es: "Alfabético (A→Z)",
    en: "Alphabetical (A→Z)",
    de: "Alphabetisch (A→Z)"
  },
  "inbox.notes.sort": {
    es: "Orden",
    en: "Sort",
    de: "Sortierung"
  },
  "inbox.notes.sortNewest": {
    es: "Más nuevas primero",
    en: "Newest first",
    de: "Neueste zuerst"
  },
  "inbox.notes.sortOldest": {
    es: "Más antiguas primero",
    en: "Oldest first",
    de: "Älteste zuerst"
  },
  "inbox.notes.noMatch": {
    es: "Ninguna nota coincide.",
    en: "No notes match.",
    de: "Keine passende Notiz."
  },
  "inbox.addReminder": {
    es: "+ Nuevo recordatorio",
    en: "+ New reminder",
    de: "+ Neue Erinnerung"
  },
  "inbox.addNote": { es: "+ Nueva nota", en: "+ New note", de: "+ Neue Notiz" },
  "inbox.how": {
    es: "Cómo contactar",
    en: "How to reach them",
    de: "Kontaktweg"
  },
  "inbox.everyMonths": {
    es: "cada {n} meses",
    en: "every {n} months",
    de: "alle {n} Monate"
  },
  "inbox.everyDays": {
    es: "cada {n} días",
    en: "every {n} days",
    de: "alle {n} Tage"
  },
  "inbox.intervalValue": {
    es: "Cada",
    en: "Every",
    de: "Alle"
  },
  "inbox.intervalUnit": {
    es: "Unidad",
    en: "Unit",
    de: "Einheit"
  },
  "inbox.unit.days": { es: "días", en: "days", de: "Tage" },
  "inbox.unit.months": { es: "meses", en: "months", de: "Monate" },
  "inbox.reminder.newTitle": {
    es: "Nuevo recordatorio",
    en: "New reminder",
    de: "Neue Erinnerung"
  },
  "inbox.reminder.editTitle": {
    es: "Editar recordatorio",
    en: "Edit reminder",
    de: "Erinnerung bearbeiten"
  },
  "inbox.reminder.edit": {
    es: "Editar",
    en: "Edit",
    de: "Bearbeiten"
  },
  "inbox.reminder.clickToEdit": {
    es: "Pulsa para editar",
    en: "Click to edit",
    de: "Zum Bearbeiten tippen"
  },
  "inbox.reminder.formLead": {
    es: "Rellena y pulsa Empezar. Luego solo verás un resumen en la lista.",
    en: "Fill in and press Start. Then you’ll only see a summary in the list.",
    de: "Ausfüllen und Start drücken. Danach nur eine Zusammenfassung in der Liste."
  },
  "inbox.reminder.start": {
    es: "Empezar",
    en: "Start",
    de: "Start"
  },
  "inbox.reminder.save": {
    es: "Guardar cambios",
    en: "Save changes",
    de: "Änderungen speichern"
  },
  "inbox.reminder.started": {
    es: "Recordatorio actualizado.",
    en: "Reminder updated.",
    de: "Erinnerung aktualisiert."
  },
  "inbox.reminder.startedDue": {
    es: "Añadido a «Toca contactar». Pulsa «Ya lo hice» cuando contactes.",
    en: "Added to “Time to contact”. Press “Already did it” once you’ve reached out.",
    de: "Unter „Jetzt kontaktieren“ hinzugefügt. Drücke „Schon erledigt“, wenn du Kontakt hattest."
  },
  "inbox.reminder.startedIn": {
    es: "Recordatorio creado. Próximo contacto en {n} días.",
    en: "Reminder created. Next contact in {n} days.",
    de: "Erinnerung erstellt. Nächster Kontakt in {n} Tagen."
  },
  "inbox.dueWaiting": {
    es: "Pendiente — aún no has marcado «Ya lo hice»",
    en: "Waiting — you haven’t pressed “Already did it” yet",
    de: "Offen — „Schon erledigt“ noch nicht gedrückt"
  },
  "inbox.duePanel.title": {
    es: "Toca contactar",
    en: "Time to contact",
    de: "Jetzt kontaktieren"
  },
  "inbox.duePanel.lead": {
    es: "Entran 3 días antes. Se quedan aquí — también atrasados en rojo — hasta que pulses «Ya lo hice».",
    en: "They appear 3 days early. They stay here — overdue ones in red — until you press “Already did it”.",
    de: "Erscheinen 3 Tage vorher. Bleiben hier — Überfällige in Rot — bis du „Schon erledigt“ drückst."
  },
  "inbox.duePanel.empty": {
    es: "Nadie pendiente. Todo al día.",
    en: "Nobody waiting. All clear.",
    de: "Niemand wartet. Alles erledigt."
  },
  "inbox.weekPanel.title": {
    es: "En 4–7 días",
    en: "In 4–7 days",
    de: "In 4–7 Tagen"
  },
  "inbox.weekPanel.lead": {
    es: "Lo que llega después (tareas con fecha y contactos un poco más lejos).",
    en: "What’s coming next (dated tasks and contacts a bit further out).",
    de: "Was als Nächstes kommt (datierte Aufgaben und Kontakte etwas weiter weg)."
  },
  "inbox.weekPanel.empty": {
    es: "Nada con fecha esta semana.",
    en: "Nothing dated this week.",
    de: "Nichts Datierte diese Woche."
  },
  "inbox.todo.dueDate": {
    es: "Fecha",
    en: "Date",
    de: "Datum"
  },
  "inbox.todo.dueDateClear": {
    es: "Quitar fecha",
    en: "Clear date",
    de: "Datum löschen"
  },
  "inbox.todo.dueToday": {
    es: "Hoy",
    en: "Today",
    de: "Heute"
  },
  "inbox.todo.dueOverdue": {
    es: "Atrasada ({n} d)",
    en: "Overdue ({n} d)",
    de: "Überfällig ({n} T)"
  },
  "inbox.todo.dueInDays": {
    es: "En {n} d",
    en: "In {n} d",
    de: "In {n} T"
  },
  "inbox.reminder.everyDay": {
    es: "Cada día",
    en: "Every day",
    de: "Jeden Tag"
  },
  "inbox.reminder.everyMonth": {
    es: "Cada mes",
    en: "Every month",
    de: "Jeden Monat"
  },
  "inbox.reminder.every3Months": {
    es: "Cada 3 meses",
    en: "Every 3 months",
    de: "Alle 3 Monate"
  },
  "inbox.contact": {
    es: "Persona / galería",
    en: "Person / gallery",
    de: "Person / Galerie"
  },
  "inbox.due": { es: "Toca hoy", en: "Due today", de: "Heute fällig" },
  "inbox.dueIn": {
    es: "En {n} días",
    en: "In {n} days",
    de: "In {n} Tagen"
  },
  "inbox.overdue": {
    es: "Atrasado {n} días",
    en: "{n} days late",
    de: "{n} Tage überfällig"
  },
  "inbox.overdueOne": {
    es: "Atrasado 1 día",
    en: "1 day late",
    de: "1 Tag überfällig"
  },
  "inbox.lastDone": {
    es: "Último contacto: {date}",
    en: "Last contact: {date}",
    de: "Letzter Kontakt: {date}"
  },
  "inbox.neverDone": {
    es: "Sin contacto todavía",
    en: "No contact yet",
    de: "Noch kein Kontakt"
  },
  "inbox.markDone": {
    es: "Ya lo hice",
    en: "Already did it",
    de: "Schon erledigt"
  },
  "inbox.markedDone": {
    es: "Anotado. Siguiente aviso: {interval}.",
    en: "Noted. Next reminder: {interval}.",
    de: "Notiert. Nächste Erinnerung: {interval}."
  },
  "inbox.openContact": {
    es: "Ver ficha",
    en: "Open contact",
    de: "Kontakt öffnen"
  },
  "inbox.notePlaceholder": {
    es: "Escribe una nota…",
    en: "Write a note…",
    de: "Notiz schreiben…"
  },
  "inbox.reminderNote": {
    es: "Nota (opcional)",
    en: "Note (optional)",
    de: "Notiz (optional)"
  },
  "inbox.saved": {
    es: "Guardado.",
    en: "Saved.",
    de: "Gespeichert."
  },
  "inbox.emptyReminders": {
    es: "Ningún recordatorio aún.",
    en: "No reminders yet.",
    de: "Noch keine Erinnerungen."
  },
  "inbox.emptyNotes": {
    es: "Ninguna nota aún.",
    en: "No notes yet.",
    de: "Noch keine Notizen."
  },
  "inbox.pickContact": {
    es: "Elige un contacto…",
    en: "Pick a contact…",
    de: "Kontakt wählen…"
  },
  "inbox.badgeTitle": {
    es: "{n} pendientes",
    en: "{n} pending",
    de: "{n} offen"
  },
  "examples.toast.saved": {
    es: "Biblioteca guardada.",
    en: "Library saved.",
    de: "Bibliothek gespeichert."
  },

  /* ── Text generator ─────────────────────────────────────────────────── */
  "textgen.eyebrow": {
    es: "Ayuda para redactar",
    en: "Writing help",
    de: "Schreibhilfe"
  },
  "textgen.title": {
    es: "Generador de texto",
    en: "Text generator",
    de: "Textgenerator"
  },
  "textgen.reset": {
    es: "Limpiar y reiniciar",
    en: "Clean and restart",
    de: "Leeren und neu starten"
  },
  "textgen.toast.reset": {
    es: "Generador reiniciado.",
    en: "Generator reset.",
    de: "Generator zurückgesetzt."
  },
  "textgen.lead": {
    es: "Elige obras, escribe qué quieres, copia al chat.",
    en: "Pick works, write what you want, copy to chat.",
    de: "Werke wählen, Wunsch schreiben, in den Chat kopieren."
  },
  "textgen.leadSimple": {
    es: "Elige obras, escribe qué quieres y copia el texto al chat. Lo demás está en «Más opciones».",
    en: "Pick works, write what you want, and copy the text to the chat. Everything else is under «More options».",
    de: "Werke wählen, Wunsch schreiben und Text in den Chat kopieren. Alles weitere unter «Mehr Optionen»."
  },
  "textgen.simple.works": {
    es: "1. Elige las obras",
    en: "1. Pick the works",
    de: "1. Werke wählen"
  },
  "textgen.simple.worksHint": {
    es: "Elige las obras de las que trata este texto.",
    en: "Choose the works this text is about.",
    de: "Wähle die Werke, um die es in diesem Text geht."
  },
  "textgen.simple.brief": {
    es: "2. Qué quieres escribir",
    en: "2. What you want written",
    de: "2. Was geschrieben werden soll"
  },
  "textgen.simple.briefPlaceholder": {
    es: "Pon aquí lo que quieres escribir, pueden ser ideas desordenadas.",
    en: "Put here what you want written — messy ideas are fine.",
    de: "Schreib hier, was du willst — unordentliche Ideen sind okay."
  },
  "textgen.tone.title": {
    es: "Tono de la respuesta",
    en: "Tone of the reply",
    de: "Ton der Antwort"
  },
  "textgen.tone.lead": {
    es: "Elige 1, 2 o 3 en cada barra.",
    en: "Pick 1, 2 or 3 on each bar.",
    de: "Wähle 1, 2 oder 3 auf jeder Leiste."
  },
  "textgen.tone.formality": {
    es: "Formalidad",
    en: "Formality",
    de: "Förmlichkeit"
  },
  "textgen.tone.formality.1": { es: "Informal", en: "Informal", de: "Locker" },
  "textgen.tone.formality.2": {
    es: "Equilibrada",
    en: "Balanced",
    de: "Ausgewogen"
  },
  "textgen.tone.formality.3": { es: "Formal", en: "Formal", de: "Formell" },
  "textgen.tone.firmness": {
    es: "Firmeza",
    en: "Firmness",
    de: "Bestimmtheit"
  },
  "textgen.tone.firmness.1": { es: "Suave", en: "Soft", de: "Sanft" },
  "textgen.tone.firmness.2": { es: "Clara", en: "Clear", de: "Klar" },
  "textgen.tone.firmness.3": { es: "Firme", en: "Firm", de: "Bestimmt" },
  "textgen.tone.warmth": { es: "Calidez", en: "Warmth", de: "Wärme" },
  "textgen.tone.warmth.1": { es: "Fría", en: "Cool", de: "Kühl" },
  "textgen.tone.warmth.2": { es: "Cordial", en: "Cordial", de: "Freundlich" },
  "textgen.tone.warmth.3": { es: "Cálida", en: "Warm", de: "Warm" },
  "textgen.email.add": {
    es: "+ Pegar historial de email",
    en: "+ Paste email history",
    de: "+ E-Mail-Verlauf einfügen"
  },
  "textgen.email.addShort": {
    es: "Añadir",
    en: "Add",
    de: "Hinzufügen"
  },
  "textgen.email.title": {
    es: "Historial de email",
    en: "Email history",
    de: "E-Mail-Verlauf"
  },
  "textgen.email.lead": {
    es: "Copia el hilo del correo y pégalo aquí. El borrador contestará en esa conversación.",
    en: "Copy the email thread and paste it here. The draft will reply in that conversation.",
    de: "Kopiere den E-Mail-Verlauf und füge ihn hier ein. Der Entwurf antwortet in diesem Gespräch."
  },
  "textgen.email.placeholder": {
    es: "Pega aquí el correo (de:, para:, mensajes anteriores…)",
    en: "Paste the email here (from:, to:, earlier messages…)",
    de: "E-Mail hier einfügen (von:, an:, frühere Nachrichten…)"
  },
  "textgen.email.remove": {
    es: "Quitar",
    en: "Remove",
    de: "Entfernen"
  },
  "textgen.email.closedHint": {
    es: "Si vas a contestar un correo, añade aquí el hilo.",
    en: "If you are answering an email, add the thread here.",
    de: "Wenn du eine E-Mail beantwortest, füge hier den Verlauf ein."
  },
  "textgen.simple.more": {
    es: "Más opciones",
    en: "More options",
    de: "Mehr Optionen"
  },
  "textgen.simple.exportLead": {
    es: "3. Llevar al chat",
    en: "3. Take it to the chat",
    de: "3. In den Chat übernehmen"
  },
  "textgen.simple.exportHint": {
    es: "Primero el texto, luego las fotos. Pégalos en ChatGPT u otro chat.",
    en: "Text first, then photos. Paste them into ChatGPT or another chat.",
    de: "Zuerst den Text, dann die Fotos. In ChatGPT oder einen anderen Chat einfügen."
  },
  "textgen.copy.text": {
    es: "Copiar el texto",
    en: "Copy the text",
    de: "Text kopieren"
  },
  "textgen.copy.photos": {
    es: "Copiar las fotos",
    en: "Copy the photos",
    de: "Fotos kopieren"
  },
  "textgen.chip.works": {
    es: "{n} obras",
    en: "{n} works",
    de: "{n} Werke"
  },
  "textgen.chip.photos": {
    es: "{n} fotos",
    en: "{n} photos",
    de: "{n} Fotos"
  },
  "textgen.chip.seriesTexts": {
    es: "{n} textos de serie",
    en: "{n} series texts",
    de: "{n} Serientexte"
  },
  "textgen.chip.examples": {
    es: "{n} ejemplos",
    en: "{n} examples",
    de: "{n} Beispiele"
  },
  "textgen.chip.noPhoto": {
    es: "sin foto",
    en: "no photo",
    de: "kein Foto"
  },
  "textgen.section.works": {
    es: "1. Obras",
    en: "1. Works",
    de: "1. Werke"
  },
  "textgen.section.seriesTexts": {
    es: "Textos de serie",
    en: "Series texts",
    de: "Serientexte"
  },
  "textgen.section.seriesTextsHint": {
    es: "Textos guardados en Series (metadatos) sobre cada colección.",
    en: "Texts saved under Series (metadata) about each collection.",
    de: "Texte aus Serien (Metadaten) zu jeder Sammlung."
  },
  "textgen.section.brief": {
    es: "3. Encargo / notas",
    en: "3. Brief / notes",
    de: "3. Auftrag / Notizen"
  },
  "textgen.resizeHint": {
    es: "Para agrandar el cuadro: arrastra la esquina inferior derecha ↓↘",
    en: "To enlarge the box: drag the bottom-right corner ↓↘",
    de: "Feld vergrößern: untere rechte Ecke ziehen ↓↘"
  },
  "textgen.section.examples": {
    es: "Ejemplos de estilo",
    en: "Style examples",
    de: "Stilbeispiele"
  },
  "textgen.section.examplesHint": {
    es: "Modelos de cómo escribe la artista (biblioteca de ejemplos).",
    en: "Models of how the artist writes (example library).",
    de: "Vorbilder, wie die Künstlerin schreibt (Beispielbibliothek)."
  },
  "textgen.section.system": {
    es: "Instrucciones fijas (sistema)",
    en: "Fixed instructions (system)",
    de: "Feste Anweisungen (System)"
  },
  "textgen.picker.works": {
    es: "Elegir obras para el generador",
    en: "Choose works for the generator",
    de: "Werke für den Generator wählen"
  },
  "textgen.picker.examples": {
    es: "Elegir ejemplos de estilo",
    en: "Choose style examples",
    de: "Stilbeispiele wählen"
  },
  "textgen.picker.showFlat": {
    es: "Ver todos sin sección",
    en: "Show all without sections",
    de: "Alle ohne Abschnitte zeigen"
  },
  "textgen.picker.showGrouped": {
    es: "Agrupar por sección",
    en: "Group by section",
    de: "Nach Abschnitt gruppieren"
  },
  "textgen.picker.useExamples": {
    es: "Usar {n} ejemplo(s)",
    en: "Use {n} example(s)",
    de: "{n} Beispiel(e) verwenden"
  },
  "textgen.toast.copied": {
    es: "Texto copiado.",
    en: "Text copied.",
    de: "Text kopiert."
  },
  "textgen.toast.photosCopied": {
    es: "Fotos listas para pegar.",
    en: "Photos ready to paste.",
    de: "Fotos bereit zum Einfügen."
  },
  "textgen.error.copy": {
    es: "No se pudo copiar.",
    en: "Could not copy.",
    de: "Kopieren fehlgeschlagen."
  },

  /* ── Applications / solicitudes ─────────────────────────────────────── */
  "applications.eyebrow": {
    es: "Presentaciones",
    en: "Submissions",
    de: "Einreichungen"
  },
  "applications.title": {
    es: "Solicitudes",
    en: "Applications",
    de: "Bewerbungen"
  },
  "applications.lead": {
    es: "Concursos, becas y residencias con PDF listo para enviar.",
    en: "Open calls, grants, and residencies with a ready-to-send PDF.",
    de: "Ausschreibungen, Stipendien und Residenzen mit fertigem PDF."
  },
  "applications.add": {
    es: "+ Nueva solicitud",
    en: "+ New application",
    de: "+ Neue Bewerbung"
  },
  "applications.filter.all": { es: "Todas", en: "All", de: "Alle" },
  "applications.filter.contests": {
    es: "Concursos",
    en: "Contests",
    de: "Wettbewerbe"
  },
  "applications.filter.grants": { es: "Becas", en: "Grants", de: "Stipendien" },
  "applications.filter.residencies": {
    es: "Residencias",
    en: "Residencies",
    de: "Residenzen"
  },
  "applications.filter.other": { es: "Otras", en: "Other", de: "Andere" },
  "applications.kind.contest": { es: "Concurso", en: "Contest", de: "Wettbewerb" },
  "applications.kind.grant": {
    es: "Beca / stipendio",
    en: "Grant / stipend",
    de: "Stipendium"
  },
  "applications.kind.residency": {
    es: "Residencia",
    en: "Residency",
    de: "Residenz"
  },
  "applications.kind.other": { es: "Otro", en: "Other", de: "Sonstiges" },
  "applications.empty": {
    es: "Aún no hay solicitudes.",
    en: "No applications yet.",
    de: "Noch keine Bewerbungen."
  },
  "applications.col.name": { es: "Nombre", en: "Name", de: "Name" },
  "applications.col.kind": { es: "Tipo", en: "Type", de: "Typ" },
  "applications.col.deadline": {
    es: "Fecha límite",
    en: "Deadline",
    de: "Frist"
  },
  "applications.col.works": { es: "Obras", en: "Works", de: "Werke" },
  "application.editor.block1": {
    es: "1. Ficha",
    en: "1. Details",
    de: "1. Steckbrief"
  },
  "application.editor.block2": {
    es: "2. Obras",
    en: "2. Works",
    de: "2. Werke"
  },
  "application.editor.block3": {
    es: "3. Portada e índice",
    en: "3. Cover and contents",
    de: "3. Titelseite und Inhalt"
  },
  "application.editor.block4": {
    es: "4. Tipografías y marco",
    en: "4. Fonts and frame",
    de: "4. Schriften und Rahmen"
  },
  "application.editor.block5": {
    es: "5. Textos",
    en: "5. Texts",
    de: "5. Texte"
  },
  "application.editor.generatePdf": {
    es: "Generar PDF",
    en: "Generate PDF",
    de: "PDF erstellen"
  },
  "application.error.needName": {
    es: "Pon un nombre a la solicitud antes de guardar.",
    en: "Give the application a name before saving.",
    de: "Gib der Bewerbung vor dem Speichern einen Namen."
  },
  "application.toast.saved": {
    es: "Solicitud guardada.",
    en: "Application saved.",
    de: "Bewerbung gespeichert."
  },
  "application.toast.pdfDone": {
    es: "PDF generado ({size}).",
    en: "PDF generated ({size}).",
    de: "PDF erstellt ({size})."
  },
  "application.toast.pdfDoneSimple": {
    es: "PDF generado.",
    en: "PDF generated.",
    de: "PDF erstellt."
  },
  "pdf.maxMb.label": {
    es: "Peso máximo (MB)",
    en: "Max size (MB)",
    de: "Max. Größe (MB)"
  },
  "pdf.maxMb.hint": {
    es: "Las fotos se comprimen al generar. Vacío = sin tope. Para email, 8 suele ir bien.",
    en: "Photos are compressed on export. Empty = no cap. For email, 8 usually works.",
    de: "Fotos werden beim Export komprimiert. Leer = kein Limit. Für E-Mail passt oft 8."
  },
  "pdf.maxMb.none": {
    es: "sin tope",
    en: "no cap",
    de: "kein Limit"
  },
  "pdf.toast.over": {
    es: "PDF guardado ({size}). No se pudo bajar de {max} MB.",
    en: "PDF saved ({size}). Could not get under {max} MB.",
    de: "PDF gespeichert ({size}). Unter {max} MB nicht möglich."
  },
  "application.pdf.works": { es: "Obras", en: "Works", de: "Werke" },
  "application.pdf.aboutWorks": {
    es: "Sobre las obras",
    en: "About the works",
    de: "Über die Werke"
  },
  "application.pdf.noSeries": {
    es: "sin serie",
    en: "no series",
    de: "keine Serie"
  },
  "application.pdf.toc": { es: "Índice", en: "Contents", de: "Inhalt" },
  "application.pdf.workCount": {
    es: "{n} cuadro(s)",
    en: "{n} work(s)",
    de: "{n} Werk(e)"
  },

  /* ── Price list / folleto ───────────────────────────────────────────── */
  "pricelist.eyebrow": { es: "Documentos", en: "Documents", de: "Dokumente" },
  "pricelist.title": {
    es: "Folleto de obras",
    en: "Works brochure",
    de: "Werkkatalog"
  },
  "pricelist.lead": {
    es: "Guarda cada folleto y vuelve a abrirlo cuando quieras.",
    en: "Save each brochure and open it again whenever you like.",
    de: "Speichere jeden Katalog und öffne ihn später wieder."
  },
  "pricelist.add": {
    es: "+ Nuevo folleto",
    en: "+ New brochure",
    de: "+ Neuer Katalog"
  },
  "pricelist.search": {
    es: "Buscar folleto…",
    en: "Search brochure…",
    de: "Katalog suchen…"
  },
  "pricelist.empty": {
    es: "Todavía no hay folletos guardados.",
    en: "No saved brochures yet.",
    de: "Noch keine gespeicherten Kataloge."
  },
  "pricelist.createFirst": {
    es: "Crear el primero",
    en: "Create the first one",
    de: "Ersten erstellen"
  },
  "pricelist.noMatch": {
    es: "Ningún folleto coincide con la búsqueda.",
    en: "No brochure matches the search.",
    de: "Kein Katalog passt zur Suche."
  },
  "pricelist.untitled": {
    es: "Folleto sin título",
    en: "Untitled brochure",
    de: "Katalog ohne Titel"
  },
  "pricelist.back": {
    es: "Todos los folletos",
    en: "All brochures",
    de: "Alle Kataloge"
  },
  "pricelist.col.name": { es: "Nombre", en: "Name", de: "Name" },
  "pricelist.col.mode": {
    es: "Origen",
    en: "Source",
    de: "Herkunft"
  },
  "pricelist.col.works": { es: "Obras", en: "Works", de: "Werke" },
  "pricelist.col.updated": {
    es: "Actualizado",
    en: "Updated",
    de: "Aktualisiert"
  },
  "pricelist.toast.saved": {
    es: "Folleto guardado.",
    en: "Brochure saved.",
    de: "Katalog gespeichert."
  },
  "pricelist.error.needTitle": {
    es: "Pon un encabezado o elige alguna obra antes de guardar.",
    en: "Add a header or choose some works before saving.",
    de: "Gib eine Überschrift ein oder wähle Werke vor dem Speichern."
  },
  "pricelist.generatePdf": {
    es: "Generar PDF",
    en: "Generate PDF",
    de: "PDF erstellen"
  },
  "pricelist.mode.free": {
    es: "Selección libre",
    en: "Free selection",
    de: "Freie Auswahl"
  },
  "pricelist.mode.exhibition": {
    es: "De una exposición",
    en: "From an exhibition",
    de: "Aus einer Ausstellung"
  },
  "pricelist.mode.series": {
    es: "De una serie",
    en: "From a series",
    de: "Aus einer Serie"
  },
  "pricelist.series.select": {
    es: "Serie",
    en: "Series",
    de: "Serie"
  },
  "pricelist.series.pickHint": {
    es: "Elige una serie para incluir todas sus obras.",
    en: "Choose a series to include all its works.",
    de: "Wähle eine Serie, um alle ihre Werke einzuschließen."
  },
  "pricelist.series.empty": {
    es: "Esa serie no tiene obras todavía.",
    en: "That series has no works yet.",
    de: "Diese Serie hat noch keine Werke."
  },
  "pricelist.price.set": {
    es: "Poner precio",
    en: "Set price",
    de: "Preis setzen"
  },
  "pricelist.price.setAll": {
    es: "Poner precios",
    en: "Set prices",
    de: "Preise setzen"
  },
  "pricelist.price.change": {
    es: "Cambiar precio",
    en: "Change price",
    de: "Preis ändern"
  },
  "pricelist.price.modalTitle": {
    es: "Precio de la obra",
    en: "Work price",
    de: "Werkpreis"
  },
  "pricelist.price.bulkTitle": {
    es: "Poner precios",
    en: "Set prices",
    de: "Preise setzen"
  },
  "pricelist.price.modeFree": {
    es: "Libre",
    en: "Free",
    de: "Frei"
  },
  "pricelist.price.modeFreeLong": {
    es: "Precio libre",
    en: "Free price",
    de: "Freier Preis"
  },
  "pricelist.price.modeFactors": {
    es: "Según factores",
    en: "By factors",
    de: "Nach Faktoren"
  },
  "pricelist.price.modeFactorsLong": {
    es: "Precio por factores",
    en: "Price by factors",
    de: "Preis nach Faktoren"
  },
  "pricelist.price.freeHint": {
    es: "Escribe el precio en euros (solo para este folleto).",
    en: "Enter the price in euros (for this brochure only).",
    de: "Preis in Euro eingeben (nur für diesen Katalog)."
  },
  "pricelist.price.bulkFreeHint": {
    es: "Escribe un precio por obra, o el mismo para todas. Solo afecta a este folleto.",
    en: "Enter a price per work, or the same for all. Only affects this brochure.",
    de: "Gib einen Preis pro Werk ein, oder denselben für alle. Betrifft nur diesen Katalog."
  },
  "pricelist.price.bulkFactorsHint": {
    es: "Calcula el precio con tus factores (o precio fijo de técnica) a la fecha elegida. Luego puedes ajustar cada obra.",
    en: "Calculates the price from your factors (or fixed technique price) on the chosen date. You can still adjust each work.",
    de: "Berechnet den Preis aus deinen Faktoren (oder Festpreis der Technik) zum gewählten Datum. Du kannst jedes Werk danach anpassen."
  },
  "pricelist.price.factorDate": {
    es: "Fecha de los factores",
    en: "Factor date",
    de: "Faktor-Datum"
  },
  "pricelist.price.fillAll": {
    es: "Mismo precio para todas",
    en: "Same price for all",
    de: "Gleicher Preis für alle"
  },
  "pricelist.price.fillAllApply": {
    es: "Rellenar",
    en: "Fill",
    de: "Ausfüllen"
  },
  "pricelist.price.freePlaceholder": {
    es: "ej. 1200",
    en: "e.g. 1200",
    de: "z. B. 1200"
  },
  "pricelist.price.factorsHint": {
    es: "Calculado con tus factores de precio (o precio fijo de técnica).",
    en: "Calculated from your price factors (or fixed technique price).",
    de: "Berechnet aus deinen Preisfaktoren (oder Festpreis der Technik)."
  },
  "pricelist.price.factorsNone": {
    es: "No se puede calcular: falta tamaño o factores.",
    en: "Cannot calculate: size or factors missing.",
    de: "Nicht berechenbar: Größe oder Faktoren fehlen."
  },
  "pricelist.price.factorsNoneShort": {
    es: "Sin cálculo",
    en: "N/A",
    de: "k. A."
  },
  "pricelist.price.factorsResult": {
    es: "Precio sugerido: {price}",
    en: "Suggested price: {price}",
    de: "Vorgeschlagener Preis: {price}"
  },
  "pricelist.price.apply": {
    es: "Usar este precio",
    en: "Use this price",
    de: "Diesen Preis verwenden"
  },
  "pricelist.price.applyAll": {
    es: "Aplicar precios",
    en: "Apply prices",
    de: "Preise übernehmen"
  },
  "pricelist.price.clear": {
    es: "Quitar precio",
    en: "Clear price",
    de: "Preis löschen"
  },
  "pricelist.price.none": {
    es: "Sin precio",
    en: "No price",
    de: "Kein Preis"
  },
  "pricelist.mode.exhibitionShort": {
    es: "Exposición",
    en: "Exhibition",
    de: "Ausstellung"
  },
  "pricelist.field.header": {
    es: "Encabezado",
    en: "Header",
    de: "Kopfzeile"
  },
  "pricelist.field.subtitle": {
    es: "Subtítulo",
    en: "Subtitle",
    de: "Untertitel"
  },
  "pricelist.field.left": { es: "Izquierda", en: "Left", de: "Links" },
  "pricelist.field.right": { es: "Derecha", en: "Right", de: "Rechts" },
  "pricelist.field.artTypeLang": {
    es: "Idioma de la técnica",
    en: "Language for technique",
    de: "Sprache für die Technik"
  },
  "pricelist.field.perPage": {
    es: "{n} por página",
    en: "{n} per page",
    de: "{n} pro Seite"
  },
  "pricelist.field.perPageLabel": {
    es: "Imágenes por página",
    en: "Images per page",
    de: "Bilder pro Seite"
  },
  "pricelist.field.showPrice": {
    es: "Mostrar precio",
    en: "Show price",
    de: "Preis anzeigen"
  },
  "pricelist.field.boldPrice": {
    es: "Precio en negrita",
    en: "Bold price",
    de: "Preis fett"
  },
  "pricelist.field.boldText": {
    es: "Texto en negrita",
    en: "Bold text",
    de: "Text fett"
  },
  "pricelist.style.letterSizes": {
    es: "Tamaños de letra",
    en: "Letter sizes",
    de: "Schriftgrößen"
  },
  "pricelist.field.titleSize": {
    es: "Título",
    en: "Title",
    de: "Titel"
  },
  "pricelist.field.textSize": {
    es: "Texto",
    en: "Text",
    de: "Text"
  },
  "pricelist.field.priceSize": {
    es: "Precio",
    en: "Price",
    de: "Preis"
  },
  "pricelist.preview.title": {
    es: "Vista previa · {title}",
    en: "Preview · {title}",
    de: "Vorschau · {title}"
  },
  "pricelist.preview.page": {
    es: "Página {n}",
    en: "Page {n}",
    de: "Seite {n}"
  },
  "pricelist.defaultHeader": {
    es: "Folleto de obras",
    en: "Artwork booklet",
    de: "Werkbroschüre"
  },
  "pricelist.datesRange": {
    es: "del {from} al {to}",
    en: "from {from} to {to}",
    de: "vom {from} bis {to}"
  },
  "pricelist.error.needWorks": {
    es: "Selecciona al menos una obra.",
    en: "Select at least one artwork.",
    de: "Wähle mindestens ein Werk."
  },
  "pricelist.toast.done": {
    es: "Lista generada ({size}).",
    en: "List generated ({size}).",
    de: "Liste erstellt ({size})."
  },
  "pricelist.toast.doneSimple": {
    es: "Lista generada.",
    en: "List generated.",
    de: "Liste erstellt."
  },
  "pricelist.error.generate": {
    es: "No se pudo generar la lista.",
    en: "Could not generate the list.",
    de: "Liste konnte nicht erstellt werden."
  },
  "pricelist.field.headerFull": {
    es: "Encabezado (título del documento)",
    en: "Header (document title)",
    de: "Kopfzeile (Dokumenttitel)"
  },
  "pricelist.headerPlaceholder": {
    es: "ej. Galería X · Obra reciente",
    en: "e.g. Gallery X · Recent work",
    de: "z. B. Galerie X · Neue Arbeiten"
  },
  "pricelist.field.subtitleOptional": {
    es: "Subtítulo (opcional)",
    en: "Subtitle (optional)",
    de: "Untertitel (optional)"
  },
  "pricelist.subtitlePlaceholder": {
    es: "ej. Madrid · Marzo 2026",
    en: "e.g. Madrid · March 2026",
    de: "z. B. Madrid · März 2026"
  },
  "pricelist.field.leftFull": {
    es: "Texto a la izquierda (sala y ciudad)",
    en: "Text on the left (venue and city)",
    de: "Text links (Ort und Stadt)"
  },
  "pricelist.leftPlaceholder": {
    es: "ej. Sala XYZ, Heidelberg",
    en: "e.g. Sala XYZ, Heidelberg",
    de: "z. B. Sala XYZ, Heidelberg"
  },
  "pricelist.field.rightFull": {
    es: "Texto a la derecha (fechas)",
    en: "Text on the right (dates)",
    de: "Text rechts (Daten)"
  },
  "pricelist.rightPlaceholder": {
    es: "ej. del 20/04/2000 al 31/05/2020",
    en: "e.g. from 20/04/2000 to 31/05/2020",
    de: "z. B. vom 20.04.2000 bis 31.05.2020"
  },
  "pricelist.field.showPriceEuros": {
    es: "Mostrar precio (en euros)",
    en: "Show price (in euros)",
    de: "Preis anzeigen (in Euro)"
  },
  "pricelist.field.imageGap": {
    es: "Espacio entre imagen y texto",
    en: "Space between image and text",
    de: "Abstand zwischen Bild und Text"
  },
  "pricelist.field.frameColor": {
    es: "Color del borde del marco",
    en: "Frame border colour",
    de: "Rahmenfarbe"
  },
  "pricelist.field.bodyFont": {
    es: "Tipografía del texto de las obras",
    en: "Font for the artwork text",
    de: "Schrift für den Werktext"
  },
  "pricelist.style.title": {
    es: "Estilo del título",
    en: "Title style",
    de: "Titelstil"
  },
  "pricelist.style.subtitle": {
    es: "Estilo del subtítulo",
    en: "Subtitle style",
    de: "Untertitelstil"
  },
  "pricelist.chosenWorks": {
    es: "Obras elegidas ({count})",
    en: "Chosen artworks ({count})",
    de: "Gewählte Werke ({count})"
  },
  "pricelist.addWorks": {
    es: "+ Añadir obras",
    en: "+ Add artworks",
    de: "+ Werke hinzufügen"
  },
  "pricelist.pickHint": {
    es: "Usa «Añadir obras» para elegirlas en una ventana con búsqueda.",
    en: "Use «Add artworks» to pick them in a window with search.",
    de: "Nutze «Werke hinzufügen», um sie in einem Fenster mit Suche zu wählen."
  },
  "pricelist.rowsTitle": {
    es: "Imagen, Precio y orden de cada obra",
    en: "Image, price and order of each artwork",
    de: "Bild, Preis und Reihenfolge jedes Werks"
  },
  "pricelist.rowsHint": {
    es: "Usa «Poner precios» para calcularlos todos a la vez. Luego ajusta cada precio y arrastra las obras para ordenarlas.",
    en: "Use «Set prices» to calculate them all at once. Then tweak each price and drag works to reorder.",
    de: "Mit «Preise setzen» berechnest du alle auf einmal. Danach Preise anpassen und Werke per Drag & Drop sortieren."
  },
  "pricelist.dragHandle": {
    es: "Arrastrar para ordenar",
    en: "Drag to reorder",
    de: "Ziehen zum Sortieren"
  },
  "pricelist.changeImage": {
    es: "Cambiar imagen",
    en: "Change image",
    de: "Bild ändern"
  },
  "pricelist.otherImage": {
    es: "Otra imagen",
    en: "Another image",
    de: "Anderes Bild"
  },
  "pricelist.imageShort": {
    es: "Imagen",
    en: "Image",
    de: "Bild"
  },
  "pricelist.preview.label": {
    es: "Vista previa del PDF ({n} obras)",
    en: "PDF preview ({n} works)",
    de: "PDF-Vorschau ({n} Werke)"
  },
  "pricelist.preview.lead": {
    es: "Vista previa · así saldrá el PDF ({count} obras)",
    en: "Preview · this is how the PDF will look ({count} artworks)",
    de: "Vorschau · so wird das PDF aussehen ({count} Werke)"
  },
  "pricelist.preview.resizeAria": {
    es: "Cambiar tamaño de la vista previa",
    en: "Resize the preview",
    de: "Vorschaugröße ändern"
  },
  "pricelist.preview.resizeTitle": {
    es: "Arrastra para dar más o menos espacio a la vista previa",
    en: "Drag to give the preview more or less space",
    de: "Ziehen, um der Vorschau mehr oder weniger Platz zu geben"
  },
  "pricelist.preview.pickExhibition": {
    es: "Selecciona una exposición con obras.",
    en: "Select an exhibition that has artworks.",
    de: "Wähle eine Ausstellung mit Werken."
  },
  "pricelist.preview.pickSeries": {
    es: "Selecciona una serie con obras.",
    en: "Select a series that has artworks.",
    de: "Wähle eine Serie mit Werken."
  },
  "pricelist.preview.addWorks": {
    es: "Añade obras para verlas aquí.",
    en: "Add artworks to see them here.",
    de: "Füge Werke hinzu, um sie hier zu sehen."
  },
  "pricelist.picker.title": {
    es: "Añadir obras a la lista",
    en: "Add artworks to the list",
    de: "Werke zur Liste hinzufügen"
  },

  /* ── Certificates ───────────────────────────────────────────────────── */
  "cert.modal.title": {
    es: "Generar certificado",
    en: "Generate certificate",
    de: "Zertifikat erstellen"
  },
  "cert.modal.langHint": {
    es: "El certificado se genera en el idioma elegido.",
    en: "The certificate is generated in the chosen language.",
    de: "Das Zertifikat wird in der gewählten Sprache erstellt."
  },
  "cert.modal.language": { es: "Idioma", en: "Language", de: "Sprache" },
  "cert.modal.spanish": { es: "Español", en: "Spanish", de: "Spanisch" },
  "cert.modal.english": { es: "Inglés", en: "English", de: "Englisch" },
  "cert.modal.german": { es: "Alemán", en: "German", de: "Deutsch" },
  "cert.modal.whichCopy": {
    es: "¿Qué ejemplar es este certificado?",
    en: "Which copy is this certificate for?",
    de: "Für welches Exemplar ist dieses Zertifikat?"
  },
  "cert.modal.generating": {
    es: "Generando…",
    en: "Generating…",
    de: "Wird erstellt…"
  },
  "cert.modal.generatePdf": {
    es: "Generar PDF",
    en: "Generate PDF",
    de: "PDF erstellen"
  },
  "cert.error.needCopy": {
    es: "Elige qué ejemplar es este certificado.",
    en: "Choose which copy this certificate is for.",
    de: "Wähle, für welches Exemplar das Zertifikat ist."
  },
  "cert.error.failed": {
    es: "No se pudo generar el certificado.",
    en: "Could not generate the certificate.",
    de: "Zertifikat konnte nicht erstellt werden."
  },
  "cert.toast.done": {
    es: "Certificado generado.",
    en: "Certificate generated.",
    de: "Zertifikat erstellt."
  },

  /* ── Unsaved changes ────────────────────────────────────────────────── */
  "unsaved.title": {
    es: "Tienes cambios sin guardar",
    en: "You have unsaved changes",
    de: "Du hast ungespeicherte Änderungen"
  },
  "unsaved.question": {
    es: "¿Qué quieres hacer con los cambios?",
    en: "What do you want to do with the changes?",
    de: "Was möchtest du mit den Änderungen tun?"
  },
  "unsaved.saveExit": {
    es: "Guardar y salir",
    en: "Save and leave",
    de: "Speichern und verlassen"
  },
  "unsaved.saveExit.hint": {
    es: "Guarda los cambios y continúa.",
    en: "Save the changes and continue.",
    de: "Änderungen speichern und weiter."
  },
  "unsaved.discard": {
    es: "Salir sin guardar",
    en: "Leave without saving",
    de: "Ohne Speichern verlassen"
  },
  "unsaved.discard.hint": {
    es: "Los cambios recientes se perderán.",
    en: "Recent changes will be lost.",
    de: "Die letzten Änderungen gehen verloren."
  },
  "unsaved.stay": {
    es: "Seguir editando",
    en: "Keep editing",
    de: "Weiter bearbeiten"
  },
  "unsaved.stay.hint": {
    es: "Vuelve al formulario sin salir.",
    en: "Return to the form without leaving.",
    de: "Zurück zum Formular, ohne zu verlassen."
  },

  /* ── Confirm dialogs ────────────────────────────────────────────────── */
  "confirm.checkbox": {
    es: "Sí, estoy segura de que quiero borrar esto.",
    en: "Yes, I am sure I want to delete this.",
    de: "Ja, ich bin sicher, dass ich das löschen will."
  },
  "confirm.typePrompt": {
    es: "Para confirmar, escribe:",
    en: "To confirm, type:",
    de: "Zum Bestätigen tippe:"
  },
  "confirm.phrase": {
    es: "Quiero borrar esto",
    en: "I want to delete this",
    de: "Ich will das löschen"
  },
  "confirm.artwork.title": {
    es: "Eliminar obra",
    en: "Delete artwork",
    de: "Werk löschen"
  },
  "confirm.artwork.message": {
    es: "Estás a punto de eliminar la obra «{title}» y todos sus movimientos asociados.",
    en: "You are about to delete the artwork «{title}» and all its associated movements.",
    de: "Du bist dabei, das Werk «{title}» und alle zugehörigen Bewegungen zu löschen."
  },
  "confirm.examplesBulk.title": {
    es: "Borrar ejemplos",
    en: "Delete examples",
    de: "Beispiele löschen"
  },
  "confirm.examplesBulk.message": {
    es: "Se borrarán {n} ejemplo(s) de «{section}». No se puede deshacer.",
    en: "{n} example(s) in «{section}» will be deleted. This cannot be undone.",
    de: "{n} Beispiel(e) in «{section}» werden gelöscht. Das lässt sich nicht rückgängig machen."
  },
  "confirm.contact.title": {
    es: "Eliminar {kind}",
    en: "Delete {kind}",
    de: "{kind} löschen"
  },
  "confirm.contact.message": {
    es: "Estás a punto de eliminar «{name}» de tus contactos.",
    en: "You are about to remove «{name}» from your contacts.",
    de: "Du bist dabei, «{name}» aus deinen Kontakten zu entfernen."
  },
  "confirm.exhibition.title": {
    es: "Eliminar exposición",
    en: "Delete exhibition",
    de: "Ausstellung löschen"
  },
  "confirm.exhibition.message": {
    es: "Estás a punto de eliminar la exposición «{title}» y los movimientos de exposición vinculados.",
    en: "You are about to delete the exhibition «{title}» and linked exhibition movements.",
    de: "Du bist dabei, die Ausstellung «{title}» und verknüpfte Ausstellungsbewegungen zu löschen."
  },
  "confirm.expense.title": {
    es: "¿Borrar este gasto?",
    en: "Delete this expense?",
    de: "Diese Ausgabe löschen?"
  },
  "confirm.expense.message": {
    es: "Se quitará de las cuentas.",
    en: "It will be removed from the accounts.",
    de: "Sie wird aus den Konten entfernt."
  },
  "confirm.expense.confirm": {
    es: "Sí, borrar",
    en: "Yes, delete",
    de: "Ja, löschen"
  },
  "confirm.lookup.title": {
    es: "Cambiar «{fromLabel}» antes de borrar",
    en: "Change «{fromLabel}» before deleting",
    de: "«{fromLabel}» vor dem Löschen ändern"
  },
  "confirm.lookup.usage": {
    es: "Se usa en {count} obra(s). Elige un valor de reemplazo.",
    en: "Used on {count} artwork(s). Choose a replacement value.",
    de: "Wird bei {count} Werk(en) verwendet. Wähle einen Ersatzwert."
  },
  "confirm.lookup.pick": {
    es: "Elegir nuevo valor…",
    en: "Choose new value…",
    de: "Neuen Wert wählen…"
  },
  "confirm.lookup.updateDelete": {
    es: "Actualizar y borrar",
    en: "Update and delete",
    de: "Aktualisieren und löschen"
  },
  "confirm.lookup.usageOne": {
    es: "Hay {count} registro que usa esta opción de «{label}». Elige un valor nuevo. Cuando tenga un valor, se borrará «{fromLabel}».",
    en: "There is {count} record using this «{label}» option. Choose a new value. Once it has one, «{fromLabel}» will be deleted.",
    de: "Es gibt {count} Eintrag mit dieser «{label}»-Option. Wähle einen neuen Wert. Sobald er gesetzt ist, wird «{fromLabel}» gelöscht."
  },
  "confirm.lookup.usageMany": {
    es: "Hay {count} registros que usan esta opción de «{label}». Elige un valor nuevo para cada uno. Cuando todos tengan un valor, se borrará «{fromLabel}».",
    en: "There are {count} records using this «{label}» option. Choose a new value for each one. Once they all have one, «{fromLabel}» will be deleted.",
    de: "Es gibt {count} Einträge mit dieser «{label}»-Option. Wähle für jeden einen neuen Wert. Sobald alle einen haben, wird «{fromLabel}» gelöscht."
  },
  "confirm.lookup.noAlternative": {
    es: "No hay otra opción disponible. Añade una opción nueva antes de borrar esta.",
    en: "No other option is available. Add a new option before deleting this one.",
    de: "Es gibt keine andere Option. Füge eine neue Option hinzu, bevor du diese löschst."
  },

  /* ── Lookups / picker / media helpers ───────────────────────────────── */
  "lookup.addOption": {
    es: "Añadir una opción nueva",
    en: "Add a new option",
    de: "Neue Option hinzufügen"
  },
  "lookup.removeOption": {
    es: "Quitar esta opción de la lista",
    en: "Remove this option from the list",
    de: "Diese Option aus der Liste entfernen"
  },
  "lookup.removeBuiltin": {
    es: "Solo se pueden quitar opciones añadidas por ti",
    en: "Only options you added can be removed",
    de: "Nur selbst hinzugefügte Optionen können entfernt werden"
  },
  "lookup.newPlaceholder": {
    es: "Nuevo: {label}",
    en: "New: {label}",
    de: "Neu: {label}"
  },
  "picker.addWorks": {
    es: "Añadir obras",
    en: "Add works",
    de: "Werke hinzufügen"
  },
  "picker.searchWork": {
    es: "Buscar obra...",
    en: "Search artwork...",
    de: "Werk suchen..."
  },
  "picker.addSelected": {
    es: "Añadir {n} obra(s) seleccionada(s)",
    en: "Add {n} selected artwork(s)",
    de: "{n} ausgewählte(s) Werk(e) hinzufügen"
  },
  "picker.selectVisible": {
    es: "Seleccionar visibles ({n})",
    en: "Select visible ({n})",
    de: "Sichtbare wählen ({n})"
  },
  "picker.clearSelection": {
    es: "Quitar selección",
    en: "Clear selection",
    de: "Auswahl leeren"
  },
  "picker.selectedCount": {
    es: "{n} seleccionadas",
    en: "{n} selected",
    de: "{n} ausgewählt"
  },
  "picker.sort.size": { es: "Tamaño", en: "Size", de: "Größe" },
  "media.addImage": {
    es: "+ Añadir imagen",
    en: "+ Add image",
    de: "+ Bild hinzufügen"
  },
  "media.saveCopy": {
    es: "Salvar copia",
    en: "Save copy",
    de: "Kopie speichern"
  },
  "media.saveCopyElsewhere": {
    es: "Guardar una copia en otra carpeta",
    en: "Save a copy to another folder",
    de: "Kopie in anderem Ordner speichern"
  },
  "media.openDocument": {
    es: "Abrir documento",
    en: "Open document",
    de: "Dokument öffnen"
  },
  "media.descPlaceholder": {
    es: "Descripción o comentario…",
    en: "Description or comment…",
    de: "Beschreibung oder Kommentar…"
  },
  "media.desc.label": {
    es: "Descripción",
    en: "Description",
    de: "Beschreibung"
  },
  "media.desc.editTitle": {
    es: "Descripción del documento",
    en: "Document description",
    de: "Dokumentbeschreibung"
  },
  "media.desc.viewTitle": {
    es: "Descripción",
    en: "Description",
    de: "Beschreibung"
  },
  "media.desc.empty": {
    es: "Sin descripción todavía.",
    en: "No description yet.",
    de: "Noch keine Beschreibung."
  },
  "media.imagesEmpty": {
    es: "Aún no hay imágenes adicionales.",
    en: "No additional images yet.",
    de: "Noch keine weiteren Bilder."
  },
  "media.docsEmpty": {
    es: "Aún no hay documentos.",
    en: "No documents yet.",
    de: "Noch keine Dokumente."
  },

  /* ── Common (extra) ─────────────────────────────────────────────────── */
  "common.hide": { es: "Ocultar", en: "Hide", de: "Ausblenden" },
  "common.noText": { es: "Sin texto", en: "No text", de: "Kein Text" },
  "common.gotIt": { es: "Entendido", en: "Got it", de: "Verstanden" },
  "common.workOne": { es: "obra", en: "work", de: "Werk" },
  "common.workMany": { es: "obras", en: "works", de: "Werke" },
  "common.thisYearWith": {
    es: "Este año ({year})",
    en: "This year ({year})",
    de: "Dieses Jahr ({year})"
  },
  "common.none": { es: "Ninguna", en: "None", de: "Keine" },
  "common.addFirst": {
    es: "Añadir el primero",
    en: "Add the first one",
    de: "Ersten hinzufügen"
  },
  "common.sale": { es: "Venta", en: "Sale", de: "Verkauf" },
  "common.zoomIn": { es: "Acercar", en: "Zoom in", de: "Vergrößern" },
  "common.zoomOut": { es: "Alejar", en: "Zoom out", de: "Verkleinern" },
  "common.zoomReset": {
    es: "Restablecer zoom",
    en: "Reset zoom",
    de: "Zoom zurücksetzen"
  },

  /* ── Rich text editor ───────────────────────────────────────────────── */
  "richtext.placeholder": {
    es: "Escribe aquí…",
    en: "Write here…",
    de: "Hier schreiben…"
  },
  "richtext.group.perLetter": {
    es: "Estilo por letra",
    en: "Per-character style",
    de: "Stil pro Buchstabe"
  },
  "richtext.bold": {
    es: "Negrita (selección)",
    en: "Bold (selection)",
    de: "Fett (Auswahl)"
  },
  "richtext.italic": {
    es: "Cursiva (selección)",
    en: "Italic (selection)",
    de: "Kursiv (Auswahl)"
  },
  "richtext.underline": {
    es: "Subrayado (selección)",
    en: "Underline (selection)",
    de: "Unterstrichen (Auswahl)"
  },
  "richtext.font": { es: "Fuente", en: "Font", de: "Schrift" },
  "richtext.size": { es: "Tamaño", en: "Size", de: "Größe" },
  "richtext.color": {
    es: "Color del texto",
    en: "Text colour",
    de: "Textfarbe"
  },
  "richtext.frameTitle": {
    es: "Editor de texto",
    en: "Text editor",
    de: "Texteditor"
  },

  /* ── Font / style tools ─────────────────────────────────────────────── */
  "format.fontOf": {
    es: "Fuente de {label}",
    en: "Font for {label}",
    de: "Schrift für {label}"
  },
  "format.sizeOf": {
    es: "Tamaño de {label}",
    en: "Size for {label}",
    de: "Größe für {label}"
  },
  "format.styleOf": {
    es: "Estilo de {label}",
    en: "Style for {label}",
    de: "Stil für {label}"
  },
  "format.boldBase": {
    es: "Negrita (base)",
    en: "Bold (base)",
    de: "Fett (Basis)"
  },
  "format.italicBase": {
    es: "Cursiva (base)",
    en: "Italic (base)",
    de: "Kursiv (Basis)"
  },
  "format.fontFor": {
    es: "Fuente · {label}",
    en: "Font · {label}",
    de: "Schrift · {label}"
  },
  "format.sizeFor": {
    es: "Tamaño · {label}",
    en: "Size · {label}",
    de: "Größe · {label}"
  },
  "format.fontDefault": {
    es: "Fuente pred.",
    en: "Default font",
    de: "Standardschrift"
  },
  "format.style": { es: "Estilo", en: "Style", de: "Stil" },
  "format.bold": { es: "Negrita", en: "Bold", de: "Fett" },
  "format.italic": { es: "Cursiva", en: "Italic", de: "Kursiv" },

  /* ── Example library (extra) ────────────────────────────────────────── */
  "examples.leadLong": {
    es: "Guarda aquí textos que te gusten (tuyos o de otros). En el Generador de texto podrás elegir cuáles usar como referencia de tono.",
    en: "Keep texts you like here (yours or by others). In the text generator you can pick which ones to use as a tone reference.",
    de: "Sammle hier Texte, die dir gefallen (eigene oder fremde). Im Textgenerator kannst du auswählen, welche als Tonvorlage dienen."
  },
  "examples.searchLong": {
    es: "Buscar por tema o por palabras del texto...",
    en: "Search by topic or by words in the text...",
    de: "Nach Thema oder Wörtern im Text suchen..."
  },
  "examples.countTotal": {
    es: "{n} ejemplos",
    en: "{n} examples",
    de: "{n} Beispiele"
  },
  "examples.emptyLong": {
    es: "Todavía no hay ejemplos. Pulsa «+ Nuevo ejemplo» y pega un texto que te guste.",
    en: "No examples yet. Press «+ New example» and paste a text you like.",
    de: "Noch keine Beispiele. Drücke «+ Neues Beispiel» und füge einen Text ein, der dir gefällt."
  },
  "examples.noMatch": {
    es: "Ningún ejemplo coincide con esa búsqueda.",
    en: "No example matches that search.",
    de: "Kein Beispiel passt zu dieser Suche."
  },
  "examples.topicPlaceholder": {
    es: "Tema (ej. declaración de artista)",
    en: "Topic (e.g. artist statement)",
    de: "Thema (z. B. Künstlerstatement)"
  },
  "examples.bodyPlaceholder": {
    es: "Pega aquí el texto de ejemplo…",
    en: "Paste the example text here…",
    de: "Beispieltext hier einfügen…"
  },
  "examples.noTextYet": {
    es: "Sin texto todavía.",
    en: "No text yet.",
    de: "Noch kein Text."
  },
  "examples.pickerEmpty": {
    es: "Todavía no hay ejemplos guardados. Añádelos en la Biblioteca de ejemplos.",
    en: "No examples saved yet. Add them in the example library.",
    de: "Noch keine Beispiele gespeichert. Füge sie in der Beispielbibliothek hinzu."
  },
  "examples.error.save": {
    es: "No se pudo guardar la biblioteca.",
    en: "Could not save the library.",
    de: "Bibliothek konnte nicht gespeichert werden."
  },

  /* ── Text generator (extra) ─────────────────────────────────────────── */
  "textgen.leadLong": {
    es: "Reúne obras, textos de series, notas y ejemplos. Después copia el texto y las fotos al chat, en dos pasos.",
    en: "Gather works, series texts, notes, and examples. Then copy the text and the photos into the chat, in two steps.",
    de: "Sammle Werke, Serientexte, Notizen und Beispiele. Kopiere dann Text und Fotos in zwei Schritten in den Chat."
  },
  "textgen.chip.worksOne": { es: "{n} obra", en: "{n} work", de: "{n} Werk" },
  "textgen.chip.photosOne": { es: "{n} foto", en: "{n} photo", de: "{n} Foto" },
  "textgen.chip.seriesTextsOne": {
    es: "{n} texto de serie",
    en: "{n} series text",
    de: "{n} Serientext"
  },
  "textgen.chip.examplesOne": {
    es: "{n} ejemplo",
    en: "{n} example",
    de: "{n} Beispiel"
  },
  "textgen.chip.worksNoPhoto": {
    es: "{n} obras sin foto",
    en: "{n} works without a photo",
    de: "{n} Werke ohne Foto"
  },
  "textgen.chip.worksNoPhotoOne": {
    es: "{n} obra sin foto",
    en: "{n} work without a photo",
    de: "{n} Werk ohne Foto"
  },
  "textgen.system.hint": {
    es: "Va al inicio de lo que copias. Queda guardado; no hace falta tocarlo cada vez.",
    en: "It goes at the start of whatever you copy. It stays saved; no need to touch it every time.",
    de: "Steht am Anfang von allem, was du kopierst. Bleibt gespeichert; du musst es nicht jedes Mal ändern."
  },
  "textgen.system.restore": {
    es: "Restaurar pred.",
    en: "Restore default",
    de: "Standard zurück"
  },
  "textgen.sortBySeries": {
    es: "Ordenar por serie",
    en: "Sort by series",
    de: "Nach Serie sortieren"
  },
  "textgen.pickWorks": {
    es: "+ Elegir obras",
    en: "+ Choose works",
    de: "+ Werke wählen"
  },
  "textgen.noWorksSelected": {
    es: "No hay obras seleccionadas.",
    en: "No works selected.",
    de: "Keine Werke ausgewählt."
  },
  "textgen.series.fromWorks": {
    es: "de las obras elegidas",
    en: "from the chosen works",
    de: "aus den gewählten Werken"
  },
  "textgen.series.other": {
    es: "otra serie",
    en: "another series",
    de: "andere Serie"
  },
  "textgen.series.noTexts": {
    es: "sin textos",
    en: "no texts",
    de: "keine Texte"
  },
  "textgen.series.textCount": {
    es: "{n} textos",
    en: "{n} texts",
    de: "{n} Texte"
  },
  "textgen.series.textCountOne": {
    es: "{n} texto",
    en: "{n} text",
    de: "{n} Text"
  },
  "textgen.series.checkedCount": {
    es: "{n} marcados",
    en: "{n} selected",
    de: "{n} markiert"
  },
  "textgen.series.checkedCountOne": {
    es: "{n} marcado",
    en: "{n} selected",
    de: "{n} markiert"
  },
  "textgen.series.emptyHint": {
    es: "Esta serie aún no tiene textos. Añádelos en la pestaña Series.",
    en: "This series has no texts yet. Add them in the Series tab.",
    de: "Diese Serie hat noch keine Texte. Füge sie im Tab Serien hinzu."
  },
  "textgen.series.viewText": {
    es: "Ver texto",
    en: "View text",
    de: "Text ansehen"
  },
  "textgen.series.collapsedHint": {
    es: "Cerrado. Ábrelo para revisar textos completos y marcar cuáles van al chat.",
    en: "Collapsed. Open it to read the full texts and tick the ones to send to the chat.",
    de: "Geschlossen. Öffne es, um ganze Texte zu lesen und auszuwählen, welche in den Chat gehen."
  },
  "textgen.series.noneHint": {
    es: "Todavía no hay series con metadatos. Créalos en la pestaña Series.",
    en: "No series with metadata yet. Create them in the Series tab.",
    de: "Noch keine Serien mit Metadaten. Lege sie im Tab Serien an."
  },
  "textgen.series.openHint": {
    es: "Pulsa Abrir para elegir textos de las series.",
    en: "Press Open to pick texts from the series.",
    de: "Öffnen tippen, um Serientexte auszuwählen."
  },
  "textgen.series.selectedCount": {
    es: "{n} texto(s) de serie marcados.",
    en: "{n} series text(s) selected.",
    de: "{n} Serientext(e) ausgewählt."
  },
  "textgen.series.missingInfo": {
    es: "No hay ficha de serie. Créala en Series para añadir textos.",
    en: "No series record yet. Create it in Series to add texts.",
    de: "Kein Serieneintrag. Lege ihn unter Serien an, um Texte hinzuzufügen."
  },
  "textgen.series.hideOthers": {
    es: "Ocultar otras series",
    en: "Hide other series",
    de: "Andere Serien ausblenden"
  },
  "textgen.series.showOthers": {
    es: "Mostrar otras series ({n})",
    en: "Show other series ({n})",
    de: "Andere Serien zeigen ({n})"
  },
  "textgen.dictate": {
    es: "Dictar con el Mac",
    en: "Dictate with the Mac",
    de: "Mit dem Mac diktieren"
  },
  "textgen.field.instruction": {
    es: "Qué quieres escribir",
    en: "What you want to write",
    de: "Was du schreiben möchtest"
  },
  "textgen.field.notes": {
    es: "Notas libres (escribe o pega)",
    en: "Free notes (type or paste)",
    de: "Freie Notizen (tippen oder einfügen)"
  },
  "textgen.field.notesPlaceholder": {
    es: "Ideas sueltas. No hace falta que estén ordenadas.",
    en: "Loose ideas. They don't have to be in order.",
    de: "Lose Ideen. Sie müssen nicht geordnet sein."
  },
  "textgen.dictation.title": {
    es: "El dictado lo hace tu Mac, no esta aplicación.",
    en: "Dictation is handled by your Mac, not by this app.",
    de: "Das Diktat übernimmt dein Mac, nicht diese App."
  },
  "textgen.dictation.lead": {
    es: "El cursor ya está en «Notas libres».",
    en: "The cursor is already in «Free notes».",
    de: "Der Cursor steht schon in «Freie Notizen»."
  },
  "textgen.dictation.step1": {
    es: "Pulsa dos veces la tecla 🎤 (o la que tengas configurada).",
    en: "Press the 🎤 key twice (or whichever key you set up).",
    de: "Drücke die 🎤-Taste zweimal (oder die von dir eingestellte Taste)."
  },
  "textgen.dictation.step2": {
    es: "Habla con calma; el texto se escribe solo.",
    en: "Speak calmly; the text types itself.",
    de: "Sprich ruhig; der Text schreibt sich selbst."
  },
  "textgen.dictation.step3": {
    es: "Pulsa la tecla otra vez o Intro para terminar.",
    en: "Press the key again or Enter to finish.",
    de: "Drücke die Taste erneut oder Enter, um zu beenden."
  },
  "textgen.dictation.help": {
    es: "¿No pasa nada? Actívalo en Ajustes del Sistema → Teclado → Dictado. También está en el menú Edit → Start Dictation.",
    en: "Nothing happens? Turn it on in System Settings → Keyboard → Dictation. It is also in the Edit → Start Dictation menu.",
    de: "Nichts passiert? Aktiviere es in Systemeinstellungen → Tastatur → Diktat. Es steht auch im Menü Edit → Start Dictation."
  },
  "textgen.field.responseLang": {
    es: "Idioma de la respuesta",
    en: "Language of the answer",
    de: "Sprache der Antwort"
  },
  "textgen.responseLangHint": {
    es: "El texto copiado pedirá a ChatGPT que responda en este idioma.",
    en: "The copied text will ask ChatGPT to answer in this language.",
    de: "Der kopierte Text bittet ChatGPT, in dieser Sprache zu antworten."
  },
  "textgen.links.title": {
    es: "Enlaces de referencia",
    en: "Reference links",
    de: "Referenz-Links"
  },
  "textgen.links.add": { es: "+ Enlace", en: "+ Link", de: "+ Link" },
  "textgen.links.hint": {
    es: "ChatGPT recibirá la instrucción de consultar estas direcciones.",
    en: "ChatGPT will be told to look up these addresses.",
    de: "ChatGPT wird angewiesen, diese Adressen aufzurufen."
  },
  "textgen.links.empty": {
    es: "Ningún enlace todavía.",
    en: "No links yet.",
    de: "Noch keine Links."
  },
  "textgen.links.notePlaceholder": {
    es: "Para qué sirve (opcional)",
    en: "What it is for (optional)",
    de: "Wofür es ist (optional)"
  },
  "textgen.openLibrary": {
    es: "Abrir biblioteca",
    en: "Open library",
    de: "Bibliothek öffnen"
  },
  "textgen.pickExamples": {
    es: "+ Elegir ejemplos",
    en: "+ Choose examples",
    de: "+ Beispiele wählen"
  },
  "textgen.examples.emptyLibrary": {
    es: "Tu biblioteca está vacía. Guarda ahí los textos que te gusten («Abrir biblioteca») y luego elígelos desde aquí.",
    en: "Your library is empty. Save texts you like there («Open library») and then pick them from here.",
    de: "Deine Bibliothek ist leer. Speichere dort Texte, die dir gefallen («Bibliothek öffnen»), und wähle sie dann hier aus."
  },
  "textgen.examples.nonePicked": {
    es: "Ningún ejemplo elegido. ChatGPT los usa como referencia de tono, nunca los copia.",
    en: "No example chosen. ChatGPT uses them as a tone reference, never copies them.",
    de: "Kein Beispiel gewählt. ChatGPT nutzt sie als Tonvorlage und kopiert sie nie."
  },
  "textgen.step1.title": {
    es: "Copia el texto",
    en: "Copy the text",
    de: "Text kopieren"
  },
  "textgen.step1.hint": {
    es: "Pégalo en ChatGPT con ⌘V.",
    en: "Paste it into ChatGPT with ⌘V.",
    de: "Füge ihn mit ⌘V in ChatGPT ein."
  },
  "textgen.step2.title": {
    es: "Copia las fotos",
    en: "Copy the photos",
    de: "Fotos kopieren"
  },
  "textgen.step2.noPhotos": {
    es: "Ninguna obra elegida tiene foto principal.",
    en: "None of the chosen works has a main photo.",
    de: "Keines der gewählten Werke hat ein Hauptfoto."
  },
  "textgen.step2.onePhoto": {
    es: "1 foto. Vuelve al mismo chat y pega otra vez con ⌘V.",
    en: "1 photo. Go back to the same chat and paste again with ⌘V.",
    de: "1 Foto. Geh in denselben Chat zurück und füge erneut mit ⌘V ein."
  },
  "textgen.step2.manyPhotos": {
    es: "{n} fotos. Al pegar solo entra una; para llevarlas todas usa el recuadro de abajo.",
    en: "{n} photos. Pasting only adds one; use the box below to take them all.",
    de: "{n} Fotos. Beim Einfügen kommt nur eines mit; nutze das Feld unten für alle."
  },
  "textgen.steps.note": {
    es: "El Mac solo guarda una cosa a la vez en el portapapeles, por eso van en dos pasos: primero el texto, después las fotos.",
    en: "The Mac only keeps one thing in the clipboard at a time, so it takes two steps: first the text, then the photos.",
    de: "Der Mac behält nur eine Sache in der Zwischenablage, darum zwei Schritte: erst der Text, dann die Fotos."
  },
  "textgen.drag.hint": {
    es: "Arrastra este recuadro hasta la ventana del chat y se adjuntan las {n} de una vez.",
    en: "Drag this box onto the chat window and all {n} are attached at once.",
    de: "Zieh dieses Feld auf das Chatfenster, dann werden alle {n} auf einmal angehängt."
  },
  "textgen.drag.tile": {
    es: "Arrastrar {n} fotos al chat",
    en: "Drag {n} photos into the chat",
    de: "{n} Fotos in den Chat ziehen"
  },
  "textgen.openPhotoFolder": {
    es: "O abrir la carpeta con las fotos",
    en: "Or open the folder with the photos",
    de: "Oder den Ordner mit den Fotos öffnen"
  },
  "textgen.preview.title": {
    es: "Texto preparado",
    en: "Prepared text",
    de: "Vorbereiteter Text"
  },
  "textgen.preview.hint": {
    es: "Solo incluye lo que hayas marcado a la izquierda.",
    en: "It only includes what you ticked on the left.",
    de: "Enthält nur, was du links markiert hast."
  },
  "textgen.preview.aria": {
    es: "Texto preparado para ChatGPT",
    en: "Text prepared for ChatGPT",
    de: "Für ChatGPT vorbereiteter Text"
  },
  "textgen.toast.systemSaved": {
    es: "Instrucciones fijas guardadas.",
    en: "Fixed instructions saved.",
    de: "Feste Anweisungen gespeichert."
  },
  "textgen.toast.copiedPaste": {
    es: "Texto copiado. Pégalo en ChatGPT con ⌘V.",
    en: "Text copied. Paste it into ChatGPT with ⌘V.",
    de: "Text kopiert. Füge ihn mit ⌘V in ChatGPT ein."
  },
  "textgen.toast.photoFolder": {
    es: "{count} fotos en la carpeta «Fotos para el chat». Arrástralas al chat desde ahí.",
    en: "{count} photos in the «Fotos para el chat» folder. Drag them into the chat from there.",
    de: "{count} Fotos im Ordner «Fotos para el chat». Zieh sie von dort in den Chat."
  },
  "textgen.toast.photoFolderOne": {
    es: "{count} foto en la carpeta «Fotos para el chat». Arrástrala al chat desde ahí.",
    en: "{count} photo in the «Fotos para el chat» folder. Drag it into the chat from there.",
    de: "{count} Foto im Ordner «Fotos para el chat». Zieh es von dort in den Chat."
  },
  "textgen.toast.photosCopiedCount": {
    es: "{count} fotos copiadas. Pega en el chat con ⌘V para adjuntarlas.",
    en: "{count} photos copied. Paste into the chat with ⌘V to attach them.",
    de: "{count} Fotos kopiert. Mit ⌘V in den Chat einfügen, um sie anzuhängen."
  },
  "textgen.toast.photoCopiedOne": {
    es: "{count} foto copiada. Pega en el chat con ⌘V para adjuntarla.",
    en: "{count} photo copied. Paste into the chat with ⌘V to attach it.",
    de: "{count} Foto kopiert. Mit ⌘V in den Chat einfügen, um es anzuhängen."
  },
  "textgen.error.systemSave": {
    es: "No se pudieron guardar las instrucciones.",
    en: "The instructions could not be saved.",
    de: "Die Anweisungen konnten nicht gespeichert werden."
  },
  "textgen.error.needSomething": {
    es: "Añade al menos una obra, una nota, un enlace, un texto de serie o un ejemplo.",
    en: "Add at least one work, note, link, series text, or example.",
    de: "Füge mindestens ein Werk, eine Notiz, einen Link, einen Serientext oder ein Beispiel hinzu."
  },
  "textgen.error.copyManual": {
    es: "No se pudo copiar. Selecciona el texto a la derecha y cópialo con ⌘C.",
    en: "Could not copy. Select the text on the right and copy it with ⌘C.",
    de: "Kopieren fehlgeschlagen. Markiere den Text rechts und kopiere ihn mit ⌘C."
  },
  "textgen.error.restartDrag": {
    es: "La app necesita reiniciarse para arrastrar las fotos. Cierra la ventana y vuelve a abrirla.",
    en: "The app needs a restart to drag the photos. Close the window and open it again.",
    de: "Die App muss neu starten, um Fotos zu ziehen. Schließe das Fenster und öffne es wieder."
  },
  "textgen.error.noPhotos": {
    es: "Ninguna de las obras elegidas tiene foto principal.",
    en: "None of the chosen works has a main photo.",
    de: "Keines der gewählten Werke hat ein Hauptfoto."
  },
  "textgen.error.openFolder": {
    es: "No se pudo abrir la carpeta.",
    en: "Could not open the folder.",
    de: "Ordner konnte nicht geöffnet werden."
  },
  "textgen.error.readPhotos": {
    es: "No se pudo leer ninguna de las fotos.",
    en: "None of the photos could be read.",
    de: "Keines der Fotos konnte gelesen werden."
  },
  "textgen.error.copyPhotos": {
    es: "No se pudieron copiar las fotos.",
    en: "The photos could not be copied.",
    de: "Die Fotos konnten nicht kopiert werden."
  },

  /* ── Applications list (extra) ──────────────────────────────────────── */
  "applications.leadRecent": {
    es: "Concursos, becas y residencias. Las más recientes arriba.",
    en: "Contests, grants, and residencies. Most recent first.",
    de: "Wettbewerbe, Stipendien und Residenzen. Die neuesten oben."
  },
  "applications.search": {
    es: "Buscar por título, organización…",
    en: "Search by title, organisation…",
    de: "Nach Titel oder Organisation suchen…"
  },
  "applications.noMatch": {
    es: "Ninguna solicitud con estos filtros.",
    en: "No application matches these filters.",
    de: "Keine Bewerbung passt zu diesen Filtern."
  },
  "applications.createFirst": {
    es: "Crear la primera",
    en: "Create the first one",
    de: "Erste anlegen"
  },
  "applications.col.application": {
    es: "Solicitud",
    en: "Application",
    de: "Bewerbung"
  },
  "applications.col.organization": {
    es: "Organización",
    en: "Organisation",
    de: "Organisation"
  },
  "applications.col.date": { es: "Fecha", en: "Date", de: "Datum" },

  /* ── Application editor (extra) ─────────────────────────────────────── */
  "application.error.pdf": {
    es: "No se pudo generar.",
    en: "Could not generate.",
    de: "Erstellen fehlgeschlagen."
  },
  "application.editor.eyebrow": {
    es: "Solicitud",
    en: "Application",
    de: "Bewerbung"
  },
  "application.editor.newTitle": {
    es: "Nueva solicitud",
    en: "New application",
    de: "Neue Bewerbung"
  },
  "application.block.details": {
    es: "1. Ficha (solo para ti)",
    en: "1. Details (just for you)",
    de: "1. Steckbrief (nur für dich)"
  },
  "application.block.detailsSummary": {
    es: "Nombre, tipo, fecha…",
    en: "Name, type, date…",
    de: "Name, Typ, Datum…"
  },
  "application.block.footer": {
    es: "2. Pie del PDF",
    en: "2. PDF footer",
    de: "2. PDF-Fußzeile"
  },
  "application.block.footerSummary": {
    es: "Artista y concurso al pie",
    en: "Artist and contest in the footer",
    de: "Künstlerin und Wettbewerb in der Fußzeile"
  },
  "application.footer.hint": {
    es: "Nombre a la izquierda, concurso a la derecha y número de página en el centro, abajo en cada página. El nombre se recuerda para las siguientes solicitudes.",
    en: "Name on the left, contest on the right, page number in the middle, at the bottom of every page. The name is remembered for later applications.",
    de: "Name links, Wettbewerb rechts, Seitenzahl in der Mitte — unten auf jeder Seite. Der Name wird für weitere Bewerbungen gespeichert."
  },
  "application.field.artistName": {
    es: "Nombre de la artista",
    en: "Artist's name",
    de: "Name der Künstlerin"
  },
  "application.field.artistNamePlaceholder": {
    es: "Tu nombre completo",
    en: "Your full name",
    de: "Dein vollständiger Name"
  },
  "application.field.competition": {
    es: "Concurso / convocatoria",
    en: "Contest / open call",
    de: "Wettbewerb / Ausschreibung"
  },
  "application.field.competitionPlaceholder": {
    es: "Ej. Concurso XYZ 2026",
    en: "E.g. XYZ Contest 2026",
    de: "Z. B. Wettbewerb XYZ 2026"
  },
  "application.field.listName": {
    es: "Nombre en la lista",
    en: "Name in the list",
    de: "Name in der Liste"
  },
  "application.field.listNamePlaceholder": {
    es: "Ej. Beca Berlin 2026 · borrador",
    en: "E.g. Berlin grant 2026 · draft",
    de: "Z. B. Stipendium Berlin 2026 · Entwurf"
  },
  "application.field.pdfLanguage": {
    es: "Idioma del PDF",
    en: "PDF language",
    de: "Sprache des PDFs"
  },
  "application.block.cover": {
    es: "3. Portada del PDF",
    en: "3. PDF cover",
    de: "3. PDF-Titelseite"
  },
  "application.block.coverSummary": {
    es: "Título y líneas de la portada",
    en: "Cover title and lines",
    de: "Titel und Zeilen der Titelseite"
  },
  "application.cover.hint": {
    es: "Cada bloque es una línea de la portada. Fuente y tamaño se eligen debajo del texto.",
    en: "Each block is one line of the cover. Font and size are set below the text.",
    de: "Jeder Block ist eine Zeile der Titelseite. Schrift und Größe stellst du unter dem Text ein."
  },
  "application.cover.showToc": {
    es: "Índice",
    en: "Contents",
    de: "Inhaltsverzeichnis"
  },
  "application.cover.above": {
    es: "Línea por encima",
    en: "Line above",
    de: "Zeile darüber"
  },
  "application.cover.aboveHint": {
    es: "Arriba del título",
    en: "Above the title",
    de: "Über dem Titel"
  },
  "application.cover.abovePlaceholder": {
    es: "Ej. Convocatoria 2026",
    en: "E.g. Open call 2026",
    de: "Z. B. Ausschreibung 2026"
  },
  "application.cover.title": { es: "Título", en: "Title", de: "Titel" },
  "application.cover.titleHint": {
    es: "Principal",
    en: "Main line",
    de: "Hauptzeile"
  },
  "application.cover.titlePlaceholder": {
    es: "Título que verá el jurado",
    en: "Title the jury will see",
    de: "Titel, den die Jury sieht"
  },
  "application.cover.below": {
    es: "Línea por debajo",
    en: "Line below",
    de: "Zeile darunter"
  },
  "application.cover.belowHint": {
    es: "Bajo el título",
    en: "Under the title",
    de: "Unter dem Titel"
  },
  "application.cover.belowPlaceholder": {
    es: "Organización o lugar",
    en: "Organisation or place",
    de: "Organisation oder Ort"
  },
  "application.cover.second": {
    es: "Segunda línea",
    en: "Second line",
    de: "Zweite Zeile"
  },
  "application.cover.secondHint": {
    es: "Debajo de todo",
    en: "At the very bottom",
    de: "Ganz unten"
  },
  "application.cover.secondPlaceholder": {
    es: "Nota extra, contacto…",
    en: "Extra note, contact…",
    de: "Zusatznotiz, Kontakt…"
  },
  "application.block.works": {
    es: "4. Obras (orden = PDF)",
    en: "4. Works (order = PDF)",
    de: "4. Werke (Reihenfolge = PDF)"
  },
  "application.block.worksSummary": {
    es: "Elegir obras del PDF",
    en: "Choose the works for the PDF",
    de: "Werke für das PDF wählen"
  },
  "application.works.sortSeries": {
    es: "Series A→Z",
    en: "Series A→Z",
    de: "Serien A→Z"
  },
  "application.works.sortSeriesTitle": {
    es: "Ordena los bloques de serie de A a Z. No cambia el orden de las obras dentro de cada serie.",
    en: "Sorts the series blocks from A to Z. It does not change the order of works inside each series.",
    de: "Sortiert die Serienblöcke von A bis Z. Die Reihenfolge der Werke innerhalb einer Serie bleibt."
  },
  "application.works.noneChosen": {
    es: "Todavía no has elegido obras.",
    en: "You haven't chosen any works yet.",
    de: "Du hast noch keine Werke gewählt."
  },
  "application.works.orderSeriesHint": {
    es: "Orden del PDF: primero las series (bloques), luego las obras dentro de cada serie.",
    en: "PDF order: first the series (blocks), then the works inside each series.",
    de: "PDF-Reihenfolge: erst die Serien (Blöcke), dann die Werke innerhalb jeder Serie."
  },
  "application.works.orderManualHint": {
    es: "Orden manual con ↑ ↓. Puedes mezclar series como quieras; así salen en el PDF.",
    en: "Manual order with ↑ ↓. You can mix series freely; that is how they appear in the PDF.",
    de: "Manuelle Reihenfolge mit ↑ ↓. Du kannst Serien frei mischen; so erscheinen sie im PDF."
  },
  "application.series.orderHint": {
    es: "Primero el orden de las series (bloques). Dentro de cada bloque, el orden de las obras. Así salen en el PDF.",
    en: "First the order of the series (blocks). Inside each block, the order of the works. That is how they appear in the PDF.",
    de: "Zuerst die Reihenfolge der Serien (Blöcke). Innerhalb jedes Blocks die Reihenfolge der Werke. So erscheinen sie im PDF."
  },
  "application.field.worksHeading": {
    es: "Etiqueta del grupo de obras",
    en: "Label for the group of works",
    de: "Bezeichnung der Werkgruppe"
  },
  "application.field.tocMode": {
    es: "Índice de obras (portada)",
    en: "Works index (cover)",
    de: "Werkverzeichnis (Titelseite)"
  },
  "application.toc.list": {
    es: "Una línea por obra",
    en: "One line per work",
    de: "Eine Zeile pro Werk"
  },
  "application.toc.bySeries": {
    es: "Agrupar por serie (N cuadros)",
    en: "Group by series (N works)",
    de: "Nach Serie gruppieren (N Werke)"
  },
  "application.toc.worksOnly": {
    es: "Solo «{label}» → primera página",
    en: "Only «{label}» → first page",
    de: "Nur «{label}» → erste Seite"
  },
  "application.block.textsSummary": {
    es: "Secciones de texto del PDF",
    en: "Text sections of the PDF",
    de: "Textabschnitte des PDFs"
  },
  "application.sections.count": {
    es: "{n} secciones",
    en: "{n} sections",
    de: "{n} Abschnitte"
  },
  "application.sections.countOne": {
    es: "{n} sección",
    en: "{n} section",
    de: "{n} Abschnitt"
  },
  "application.sections.add": {
    es: "+ Añadir sección",
    en: "+ Add section",
    de: "+ Abschnitt hinzufügen"
  },
  "application.sections.addFirst": {
    es: "+ Primera sección",
    en: "+ First section",
    de: "+ Erster Abschnitt"
  },
  "application.sections.emptyHint": {
    es: "Añade secciones (encabezado + texto).",
    en: "Add sections (heading + text).",
    de: "Füge Abschnitte hinzu (Überschrift + Text)."
  },
  "application.sections.remove": {
    es: "Quitar sección",
    en: "Remove section",
    de: "Abschnitt entfernen"
  },
  "application.sections.fallback": {
    es: "Sección {n}",
    en: "Section {n}",
    de: "Abschnitt {n}"
  },
  "application.format.headings": {
    es: "Formato de todos los encabezados",
    en: "Format of all headings",
    de: "Format aller Überschriften"
  },
  "application.format.headingsHint": {
    es: "Se aplica a cada sección a la vez",
    en: "Applies to every section at once",
    de: "Gilt für alle Abschnitte gleichzeitig"
  },
  "application.format.headingsAria": {
    es: "encabezados",
    en: "headings",
    de: "Überschriften"
  },
  "application.format.bodies": {
    es: "Formato de todos los textos",
    en: "Format of all texts",
    de: "Format aller Texte"
  },
  "application.format.bodiesHint": {
    es: "Base de todos los cuerpos · N/I por letra sigue en el editor",
    en: "Base for all bodies · bold/italic per character stays in the editor",
    de: "Basis für alle Textkörper · Fett/Kursiv pro Buchstabe bleibt im Editor"
  },
  "application.format.bodiesAria": {
    es: "textos",
    en: "texts",
    de: "Texte"
  },
  "application.block.fonts": {
    es: "Tipografías y marco",
    en: "Fonts and frame",
    de: "Schriften und Rahmen"
  },
  "application.field.fontWorks": {
    es: "Fichas de obra (título y datos)",
    en: "Work cards (title and details)",
    de: "Werkkarten (Titel und Angaben)"
  },
  "application.field.fontBody": {
    es: "Cuerpo de texto",
    en: "Body text",
    de: "Textkörper"
  },
  "application.field.noFrame": {
    es: "Sin marco gris alrededor de la pintura",
    en: "No grey frame around the painting",
    de: "Kein grauer Rahmen um das Bild"
  },
  "application.field.frameColor": {
    es: "Color del marco",
    en: "Frame colour",
    de: "Rahmenfarbe"
  },
  "application.field.frameWidth": {
    es: "Grosor del marco",
    en: "Frame thickness",
    de: "Rahmenstärke"
  },
  "application.field.framePadding": {
    es: "Espacio entre marco y pintura",
    en: "Space between frame and painting",
    de: "Abstand zwischen Rahmen und Bild"
  },
  "application.field.imagePadding": {
    es: "Espacio alrededor de la pintura",
    en: "Space around the painting",
    de: "Abstand um das Bild"
  },
  "application.frame.note": {
    es: "Cuadrado al 95% del ancho, centrado. La pintura queda inscrita. Grosor y espacio crecen hacia dentro (la pintura se hace más pequeña).",
    en: "Square at 95% of the width, centred. The painting is fitted inside. Thickness and spacing grow inwards (the painting gets smaller).",
    de: "Quadrat bei 95 % der Breite, zentriert. Das Bild wird eingepasst. Stärke und Abstand wachsen nach innen (das Bild wird kleiner)."
  },
  "application.preview.resizeAria": {
    es: "Cambiar tamaño de la vista previa",
    en: "Resize the preview",
    de: "Vorschaugröße ändern"
  },
  "application.preview.resizeTitle": {
    es: "Arrastra para dar más o menos espacio a la vista previa",
    en: "Drag to give the preview more or less space",
    de: "Ziehen, um der Vorschau mehr oder weniger Platz zu geben"
  },
  "application.preview.label": {
    es: "Vista previa del PDF ({n} obras)",
    en: "PDF preview ({n} works)",
    de: "PDF-Vorschau ({n} Werke)"
  },
  "application.preview.frameTitle": {
    es: "Vista previa de la solicitud",
    en: "Application preview",
    de: "Vorschau der Bewerbung"
  },
  "application.picker.works": {
    es: "Elegir obras para la solicitud",
    en: "Choose works for the application",
    de: "Werke für die Bewerbung wählen"
  },

  "common.documentOne": { es: "Documento", en: "Document", de: "Dokument" },
  "app.restart.api": {
    es: "La app necesita reiniciarse para usar esta función. Cierra la ventana y vuelve a abrir «npm run dev».",
    en: "The app needs to restart to use this feature. Close the window and run «npm run dev» again.",
    de: "Die App muss neu gestartet werden, um diese Funktion zu nutzen. Schließe das Fenster und starte «npm run dev» erneut."
  },

  "contact.form.linkedToFull": {
    es: "Vinculada a (galería / museo / colección)",
    en: "Linked to (gallery / museum / collection)",
    de: "Verknüpft mit (Galerie / Museum / Sammlung)"
  },
  "contact.detail.web": { es: "Web", en: "Website", de: "Website" },
  "contact.detail.firstContact": {
    es: "Primer contacto",
    en: "First contact",
    de: "Erster Kontakt"
  },
  "contact.detail.gallerist": {
    es: "Galerista",
    en: "Gallerist",
    de: "Galerist/in"
  },
  "contact.detail.linkedTo": {
    es: "Vinculada a",
    en: "Linked to",
    de: "Verknüpft mit"
  },
  "contact.detail.totalSales": {
    es: "Total de ventas",
    en: "Total sales",
    de: "Verkäufe insgesamt"
  },
  "contact.detail.afterCommission": {
    es: "Tras comisión",
    en: "After commission",
    de: "Nach Provision"
  },
  "contact.detail.noLinkedPeople": {
    es: "Aún no hay personas vinculadas a {name}.",
    en: "No people linked to {name} yet.",
    de: "Noch keine Personen mit {name} verknüpft."
  },
  "contact.detail.exhibitionsCount": {
    es: "Exposiciones ({count})",
    en: "Exhibitions ({count})",
    de: "Ausstellungen ({count})"
  },
  "contact.detail.emptyExhibitions": {
    es: "Sin exposiciones asociadas.",
    en: "No linked exhibitions.",
    de: "Keine verknüpften Ausstellungen."
  },
  "contact.detail.worksCount": {
    es: "{count} obras",
    en: "{count} works",
    de: "{count} Werke"
  },
  "contact.detail.salesCount": {
    es: "{count} ventas",
    en: "{count} sales",
    de: "{count} Verkäufe"
  },
  "contact.detail.shownWorksCount": {
    es: "Cuadros expuestos ({count})",
    en: "Works shown ({count})",
    de: "Ausgestellte Werke ({count})"
  },
  "contact.detail.salesViaGalleryCount": {
    es: "Ventas por la galería ({count})",
    en: "Sales via the gallery ({count})",
    de: "Verkäufe über die Galerie ({count})"
  },
  "contact.detail.galleryPaymentCount": {
    es: "Pago a galerista ({count})",
    en: "Gallery payment ({count})",
    de: "Zahlung an Galerie ({count})"
  },
  "contact.detail.emptyPayments": {
    es: "Aún no hay obras entregadas como pago a esta galería.",
    en: "No works given as payment to this gallery yet.",
    de: "Noch keine Werke als Zahlung an diese Galerie übergeben."
  },
  "contact.detail.delete.body": {
    es: "Se borrará «{name}» de la lista de contactos. No se puede deshacer.",
    en: "«{name}» will be removed from your contact list. This cannot be undone.",
    de: "«{name}» wird aus der Kontaktliste gelöscht. Das kann nicht rückgängig gemacht werden."
  },

  "exhibition.field.titleFull": {
    es: "Título de la exposición",
    en: "Exhibition title",
    de: "Titel der Ausstellung"
  },
  "exhibition.works.hint": {
    es: "Cada obra tendrá un movimiento de «Exposición» (vuelve al estudio por defecto). Puedes anotar el precio de lista de cada obra, aunque no se venda.",
    en: "Each work gets an «Exhibition» movement (it returns to the studio by default). You can note a list price for every work, even if it is not sold.",
    de: "Jedes Werk erhält eine «Ausstellung»-Bewegung (kehrt standardmäßig ins Atelier zurück). Du kannst für jedes Werk einen Listenpreis notieren, auch wenn es nicht verkauft wird."
  },
  "exhibition.works.empty": {
    es: "Aún no hay obras. Usa «Añadir obra».",
    en: "No works yet. Use «Add work».",
    de: "Noch keine Werke. Nutze «Werk hinzufügen»."
  },
  "exhibition.works.soldNotice": {
    es: "No aparecen las obras vendidas antes de la fecha de inicio de esta exposición.",
    en: "Works sold before this exhibition's start date are not shown.",
    de: "Werke, die vor dem Startdatum dieser Ausstellung verkauft wurden, erscheinen nicht."
  },
  "exhibition.docs.hint": {
    es: "Fotos de la sala, catálogos, videos (.mov, .mp4…), PDF o Word. Cada archivo puede llevar una descripción.",
    en: "Room photos, catalogues, videos (.mov, .mp4…), PDF or Word. Each file can carry a description.",
    de: "Raumfotos, Kataloge, Videos (.mov, .mp4…), PDF oder Word. Jede Datei kann eine Beschreibung haben."
  },
  "exhibition.docs.saveFirst": {
    es: "Guarda la exposición para poder añadir documentos y ventas.",
    en: "Save the exhibition to add documents and sales.",
    de: "Speichere die Ausstellung, um Dokumente und Verkäufe hinzuzufügen."
  },
  "exhibition.sales.empty": {
    es: "Todavía no hay ventas registradas aquí.",
    en: "No sales recorded here yet.",
    de: "Hier sind noch keine Verkäufe erfasst."
  },
  "exhibition.sales.addTitle": {
    es: "Añadir venta en {title}",
    en: "Add sale at {title}",
    de: "Verkauf bei {title} hinzufügen"
  },
  "exhibition.sales.pickWork": {
    es: "— Seleccionar obra —",
    en: "— Select artwork —",
    de: "— Werk auswählen —"
  },
  "exhibition.delete.title": {
    es: "Eliminar esta exposición",
    en: "Delete this exhibition",
    de: "Diese Ausstellung löschen"
  },
  "exhibition.delete.body": {
    es: "Se borrará «{title}» y los movimientos de exposición vinculados. No se puede deshacer.",
    en: "«{title}» and its linked exhibition movements will be deleted. This cannot be undone.",
    de: "«{title}» und die verknüpften Ausstellungsbewegungen werden gelöscht. Das kann nicht rückgängig gemacht werden."
  },
  "exhibition.delete.button": {
    es: "Eliminar exposición…",
    en: "Delete exhibition…",
    de: "Ausstellung löschen…"
  },

  "series.error.create": {
    es: "No se pudo crear la serie.",
    en: "Could not create the series.",
    de: "Serie konnte nicht erstellt werden."
  },
  "series.texts.hint": {
    es: "Cada texto tiene un tema. Solo ves el tema y el principio; ábrelo para editar.",
    en: "Each text has a topic. You only see the topic and the beginning; open it to edit.",
    de: "Jeder Text hat ein Thema. Du siehst nur Thema und Anfang; zum Bearbeiten öffnen."
  },
  "series.texts.empty": {
    es: "Todavía no hay textos en esta serie.",
    en: "No texts in this series yet.",
    de: "Noch keine Texte in dieser Serie."
  },
  "series.texts.topicPlaceholder": {
    es: "Ej. Idea principal, contexto histórico…",
    en: "E.g. Main idea, historical context…",
    de: "Z. B. Hauptidee, historischer Kontext…"
  },
  "series.texts.bodyPlaceholder": {
    es: "Escribe aquí…",
    en: "Write here…",
    de: "Hier schreiben…"
  },
  "series.works.empty": {
    es: "Ninguna obra usa este nombre todavía.",
    en: "No artwork uses this name yet.",
    de: "Noch kein Werk nutzt diesen Namen."
  }
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof strings;

export function translate(
  lang: Lang,
  key: StringKey,
  vars?: Record<string, string | number>
): string {
  const entry = strings[key] as Entry | undefined;
  if (!entry) return String(key);
  const raw = entry[lang] || entry.es || String(key);
  return interpolate(raw, vars);
}

export type Translate = (
  key: StringKey,
  vars?: Record<string, string | number>
) => string;

const LanguageContext = createContext<{ lang: Lang; t: Translate }>({
  lang: "es",
  t: (key, vars) => translate("es", key, vars)
});

export const LanguageProvider = LanguageContext.Provider;

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useT(): Translate {
  return useContext(LanguageContext).t;
}

/** Built-in lookup labels from schema DEFAULT_LOOKUPS, keyed as "category:value". */
export const LOOKUP_LABELS = {
  "artworkType:oil_canvas": {
    es: "Óleo sobre lienzo",
    en: "Oil on canvas",
    de: "Öl auf Leinwand"
  },
  "artworkType:acrylic_canvas": {
    es: "Acrílico sobre lienzo",
    en: "Acrylic on canvas",
    de: "Acryl auf Leinwand"
  },
  "artworkType:painting": { es: "Pintura", en: "Painting", de: "Malerei" },
  "artworkType:watercolor": {
    es: "Acuarela",
    en: "Watercolor",
    de: "Aquarell"
  },
  "artworkType:sculpture": {
    es: "Escultura",
    en: "Sculpture",
    de: "Skulptur"
  },
  "artworkType:drawing": { es: "Dibujo", en: "Drawing", de: "Zeichnung" },
  "artworkType:print": {
    es: "Grabado / impresión",
    en: "Print / engraving",
    de: "Druck / Gravur"
  },
  "artworkType:mixed_media": {
    es: "Técnica mixta",
    en: "Mixed media",
    de: "Mischtechnik"
  },
  "artworkType:ipad_drawing": {
    es: "Ipad Drawings",
    en: "Ipad Drawings",
    de: "Ipad Drawings"
  },
  "artworkType:plexiglass": {
    es: "Plexiglass",
    en: "Plexiglass",
    de: "Plexiglas"
  },
  "artworkType:other": { es: "Otro", en: "Other", de: "Sonstiges" },

  "status:not_made": { es: "No generada", en: "Not made", de: "Nicht angefertigt" },
  "status:in_studio": { es: "En estudio", en: "In studio", de: "Im Atelier" },
  "status:sold": { es: "Vendida", en: "Sold", de: "Verkauft" },
  "status:lost": { es: "Perdida", en: "Lost", de: "Verloren" },
  "status:gifted": { es: "Regalada", en: "Gifted", de: "Verschenkt" },
  "status:loaned": { es: "Prestada", en: "Loaned", de: "Verliehen" },
  "status:consigned": {
    es: "En galería",
    en: "At gallery",
    de: "In der Galerie"
  },
  "status:in_exhibition": {
    es: "En exposición",
    en: "In exhibition",
    de: "In Ausstellung"
  },
  "status:post_show_gallery": {
    es: "Tras exposición",
    en: "After exhibition",
    de: "Nach Ausstellung"
  },
  "status:payment_gallery": {
    es: "Entregada como pago",
    en: "Given as payment",
    de: "Als Zahlung übergeben"
  },
  "status:per_copy": {
    es: "Ver cada copia",
    en: "See each copy",
    de: "Pro Exemplar"
  },
  "status:archived": { es: "Archivada", en: "Archived", de: "Archiviert" },

  "movementType:sale": { es: "Venta", en: "Sale", de: "Verkauf" },
  "movementType:gift": { es: "Regalo", en: "Gift", de: "Geschenk" },
  "movementType:loan": { es: "Préstamo", en: "Loan", de: "Leihgabe" },
  "movementType:exhibition": {
    es: "Exposición",
    en: "Exhibition",
    de: "Ausstellung"
  },
  "movementType:payment": {
    es: "Pago a galerista",
    en: "Gallery payment",
    de: "Zahlung an Galerie"
  },
  "movementType:lost": { es: "Perdida", en: "Lost", de: "Verlust" },

  "contactMethod:call": {
    es: "Llamar por teléfono",
    en: "Phone call",
    de: "Anrufen"
  },
  "contactMethod:whatsapp": { es: "WhatsApp", en: "WhatsApp", de: "WhatsApp" },
  "contactMethod:text": {
    es: "Mensaje de texto",
    en: "Text message",
    de: "SMS / Nachricht"
  },
  "contactMethod:email": {
    es: "Correo electrónico",
    en: "Email",
    de: "E-Mail"
  },
  "contactMethod:letter": { es: "Carta", en: "Letter", de: "Brief" },
  "contactMethod:visit": {
    es: "Visita en persona",
    en: "Visit in person",
    de: "Persönlicher Besuch"
  },
  "contactMethod:other": { es: "Otro", en: "Other", de: "Sonstiges" },

  "exhibitionType:single": {
    es: "Individual",
    en: "Solo",
    de: "Einzelausstellung"
  },
  "exhibitionType:group": {
    es: "Colectiva",
    en: "Group",
    de: "Gruppenausstellung"
  },

  "country:spain": { es: "España", en: "Spain", de: "Spanien" },
  "country:france": { es: "Francia", en: "France", de: "Frankreich" },
  "country:germany": { es: "Alemania", en: "Germany", de: "Deutschland" }
} satisfies Record<string, Entry>;

export type LookupLabelKey = keyof typeof LOOKUP_LABELS;

export function lookupLabel(
  lang: Lang,
  category: string,
  value: string,
  fallback?: string
): string {
  const key = `${category}:${value}` as LookupLabelKey;
  const entry = (LOOKUP_LABELS as Record<string, Entry | undefined>)[key];
  if (!entry) return fallback ?? value;
  return entry[lang] || entry.es || fallback || value;
}
