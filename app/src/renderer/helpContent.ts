/**
 * Steps of the «Ayuda» walk-through. Each step opens `view` and outlines the
 * element tagged `data-help="<spot>"`. Button names are written «like this»
 * and must match the UI labels exactly (the photo editor is Spanish-only, so
 * its buttons stay in Spanish in every language).
 */
import type { Lang } from "./i18n";
import { POPUP_HELP } from "./helpPopups";

/** Sidebar sections (highlighted while the guide talks about them). */
export type HelpTarget =
  | "library"
  | "inbox"
  | "series"
  | "contacts"
  | "exhibitions"
  | "pricelist"
  | "pricing"
  | "financials"
  | "applications"
  | "textGenerator"
  | "examples";

/** Screens the guide can open. Artwork screens use the selected or first work. */
export type TourView =
  | HelpTarget
  | "artworkDetail"
  | "artworkEdit"
  | "artworkMovements"
  | "pricelistNew";

export const TOUR_VIEWS_NEEDING_ARTWORK = new Set<TourView>([
  "artworkDetail",
  "artworkEdit",
  "artworkMovements"
]);

export function tourViewSection(view: TourView): HelpTarget {
  if (view === "artworkDetail" || view === "artworkEdit" || view === "artworkMovements") {
    return "library";
  }
  if (view === "pricelistNew") return "pricelist";
  return view;
}

export interface HelpStep {
  chapter: string;
  view: TourView | null;
  spot?: string;
  title: string;
  body: string;
}

const es: HelpStep[] = [
  {
    chapter: "Bienvenida",
    view: null,
    spot: "help-button",
    title: "Bienvenida",
    body: "Te enseño el programa pantalla por pantalla. En cada paso marco en amarillo de qué hablo. Pulsa «Siguiente →» para seguir. Esta guía se abre otra vez con «? Ayuda»."
  },
  {
    chapter: "Bienvenida",
    view: null,
    spot: "sidebar-nav",
    title: "Las secciones",
    body: "Aquí a la izquierda están todas las partes del programa. Pulsa una para ir a ella."
  },
  {
    chapter: "Lista de obras",
    view: "library",
    spot: "library-table",
    title: "Lista de obras",
    body: "Todas tus obras: foto, serie, técnica, año y estado. Pulsa una fila para abrir su ficha."
  },
  {
    chapter: "Lista de obras",
    view: "library",
    spot: "library-add",
    title: "Añadir una obra",
    body: "«+ Añadir obra» abre una ficha nueva: pones la foto, rellenas los datos y pulsas «Guardar»."
  },
  {
    chapter: "Lista de obras",
    view: "library",
    spot: "library-filters",
    title: "Buscar y filtrar",
    body: "«▶ Filtros» abre el buscador y los filtros: por técnica, estado, serie, año…"
  },
  {
    chapter: "Ficha de una obra",
    view: "artworkDetail",
    spot: "detail-tabs",
    title: "La ficha de una obra",
    body: "Esta es la ficha de una de tus obras. Tiene tres pestañas: «Información», «Movimientos» (ventas, préstamos, exposiciones) y «Precio histórico»."
  },
  {
    chapter: "Ficha de una obra",
    view: "artworkDetail",
    spot: "detail-photo-actions",
    title: "La foto",
    body: "«Cambiar foto (elegir otra)» pone otra foto. «Retocar foto actual» la gira, la recorta o ajusta el color. «Salvar foto…» guarda una copia para un email o para imprimir."
  },
  {
    chapter: "Ficha de una obra",
    view: "artworkDetail",
    spot: "detail-cert",
    title: "Certificado",
    body: "«Generar certificado» crea el certificado de autenticidad en PDF."
  },
  {
    chapter: "Ficha de una obra",
    view: "artworkDetail",
    spot: "detail-edit",
    title: "Cambiar datos",
    body: "Para cambiar algo, o para registrar una venta, pulsa «Editar»."
  },
  {
    chapter: "Editar y vender",
    view: "artworkEdit",
    spot: "form-photo",
    title: "Editar una obra",
    body: "Así se ve una obra al pulsar «Editar». Pulsa la foto para cambiarla."
  },
  {
    chapter: "Editar y vender",
    view: "artworkEdit",
    spot: "form-status",
    title: "El estado",
    body: "Se calcula solo a partir de los movimientos. Para cambiarlo, apunta lo que pasó en la pestaña «Movimientos»: una venta, un préstamo, una exposición… o márcala como «Ya devuelta al estudio»."
  },
  {
    chapter: "Editar y vender",
    view: "artworkEdit",
    spot: "form-save",
    title: "Guardar",
    body: "Después de cambiar algo, pulsa siempre «Guardar». Si no, no se guarda."
  },
  {
    chapter: "Editar y vender",
    view: "artworkEdit",
    spot: "form-movements-tab",
    title: "Movimientos",
    body: "En la pestaña «Movimientos» se apuntan las ventas, los préstamos, los regalos y las exposiciones."
  },
  {
    chapter: "Editar y vender",
    view: "artworkMovements",
    spot: "movement-add",
    title: "Registrar una venta",
    body: "Pulsa «+ Añadir movimiento», elige el tipo (por ejemplo «Venta»), la fecha y el precio, y pulsa «Salvar». Después, «Guardar» en la obra."
  },
  {
    chapter: "Editar y vender",
    view: "artworkMovements",
    spot: "back",
    title: "Volver",
    body: "«← Volver» te lleva a la pantalla anterior. Si no has cambiado nada, no se pierde nada."
  },
  {
    chapter: "Exposiciones",
    view: "exhibitions",
    spot: "exhibitions-add",
    title: "Exposiciones",
    body: "Aquí apuntas cada exposición. «+ Añadir exposición»: pones título, lugar y fechas, y luego «Añadir obras a la exposición». Las obras pasan solas a «En exposición» mientras dura."
  },
  {
    chapter: "Dossier de obras",
    view: "pricelist",
    spot: "pricelist-add",
    title: "Dossier de obras",
    body: "Un PDF con fotos y precios para enviar a galerías o coleccionistas. Aquí están los dossiers guardados; «+ Nuevo dossier» crea uno. Para borrar uno, ábrelo y pulsa abajo «Eliminar dossier…»."
  },
  {
    chapter: "Dossier de obras",
    view: "pricelistNew",
    spot: "pricelist-mode",
    title: "Elegir las obras",
    body: "Así es un dossier nuevo. Primero eliges las obras: «Selección libre», «De una exposición» o «De una serie»."
  },
  {
    chapter: "Dossier de obras",
    view: "pricelistNew",
    spot: "pricelist-header",
    title: "El encabezado",
    body: "Escribe el título del dossier y, si quieres, un subtítulo."
  },
  {
    chapter: "Dossier de obras",
    view: "pricelistNew",
    spot: "pricelist-intro",
    title: "Texto introductorio",
    body: "Aquí puedes contar cómo surgió la serie. Sale bajo el encabezado, antes de las obras."
  },
  {
    chapter: "Dossier de obras",
    view: "pricelistNew",
    spot: "pricelist-preview",
    title: "Vista previa",
    body: "A la derecha ves el PDF tal y como saldrá."
  },
  {
    chapter: "Dossier de obras",
    view: "pricelistNew",
    spot: "pricelist-generate",
    title: "Generar el PDF",
    body: "«Guardar» guarda el dossier y «Generar PDF» crea el archivo. Si sales sin guardar, el dossier no se guarda."
  },
  {
    chapter: "Personas y galerías",
    view: "contacts",
    spot: "contacts-add",
    title: "Personas y galerías",
    body: "Coleccionistas, compradores, galerías y museos. En «Añadir» eliges «+ Nuevo…» para crear uno. Pulsa un contacto para ver lo que ha comprado o expuesto."
  },
  {
    chapter: "Recordatorios",
    view: "inbox",
    spot: "inbox-todo",
    title: "Tareas",
    body: "Pulsa «To Do» para abrir las tareas. Escribe una y pulsa «Añadir»; cuando la termines, «Hecho». Todo aquí se guarda solo."
  },
  {
    chapter: "Recordatorios",
    view: "inbox",
    spot: "inbox-reminder",
    title: "Contactar a alguien",
    body: "Abre «Recordatorios» y pulsa «+ Nuevo recordatorio»: te avisa cada cierto tiempo de que toca contactar a una persona o galería."
  },
  {
    chapter: "Recordatorios",
    view: "inbox",
    spot: "inbox-note",
    title: "Notas",
    body: "Abre «Notas» y pulsa «+ Nueva nota» para apuntar cualquier cosa."
  },
  {
    chapter: "Cuentas",
    view: "financials",
    spot: "financials-actions",
    title: "Cuentas",
    body: "«+ Añadir un gasto» apunta un gasto. «Hacer resumen en Excel» prepara el resumen para el gestor. Lo cobrado sale solo de las ventas."
  },
  {
    chapter: "Cuentas",
    view: "financials",
    spot: "financials-hide",
    title: "Ocultar importes",
    body: "Tapa las cifras si alguien está mirando la pantalla."
  },
  {
    chapter: "Factores y precios",
    view: "pricing",
    spot: "pricing-sizes",
    title: "Factores y precios",
    body: "Aquí decides cómo se calculan los precios según el tamaño; más abajo, los precios fijos por técnica y los impuestos. Pulsa «Guardar» después de cambiar algo."
  },
  {
    chapter: "Factores y precios",
    view: "pricing",
    spot: "pricing-sheet",
    title: "Hoja de precios",
    body: "«Generar hoja» crea la lista de precios."
  },
  {
    chapter: "Solicitudes",
    view: "applications",
    spot: "applications-add",
    title: "Solicitudes",
    body: "Para concursos, becas y residencias. «+ Nueva solicitud», rellenas los bloques del 1 al 5 y pulsas «Generar PDF»."
  },
  {
    chapter: "Series",
    view: "series",
    spot: "series-list",
    title: "Series",
    body: "Cada serie con sus textos y documentos. Elige una serie aquí y añade textos con «+ Añadir texto»."
  },
  {
    chapter: "Generador de texto",
    view: "textGenerator",
    spot: "textgen-works",
    title: "Generador de texto",
    body: "Prepara un texto (un email a una galería, por ejemplo) para pegarlo en ChatGPT. Primero eliges las obras aquí…"
  },
  {
    chapter: "Generador de texto",
    view: "textGenerator",
    spot: "textgen-copy",
    title: "Copiar al chat",
    body: "…escribes qué quieres, pulsas «Copiar el texto» y lo pegas en el chat."
  },
  {
    chapter: "Biblioteca de ejemplos",
    view: "examples",
    spot: "examples-save",
    title: "Biblioteca de ejemplos",
    body: "Textos tuyos que sirven de modelo para el generador. Esta página no se guarda sola: pulsa «Guardar cambios»."
  },
  {
    chapter: "Copia de seguridad",
    view: null,
    spot: "backup-box",
    title: "Copia de seguridad",
    body: "Aquí guardas una copia de todo (datos y fotos) en iCloud o en otra carpeta. Se hace sola cada día. Si se rompe el ordenador: instala el programa, copia la carpeta «Inventario de Arte - copia» de iCloud a «Documentos» y elígela con «Cambiar carpeta»."
  },
  {
    chapter: "Fin",
    view: null,
    spot: "help-button",
    title: "Ya está",
    body: "Si te pierdes, «? Ayuda» abre esta guía otra vez. Con el menú de arriba de esta ventana puedes saltar a cualquier tema."
  }
];

const en: HelpStep[] = [
  {
    chapter: "Welcome",
    view: null,
    spot: "help-button",
    title: "Welcome",
    body: "I'll show you the app screen by screen. At each step I outline in yellow what I'm talking about. Press «Next →» to continue. Open this guide again with «? Help»."
  },
  {
    chapter: "Welcome",
    view: null,
    spot: "sidebar-nav",
    title: "The sections",
    body: "All parts of the app are here on the left. Click one to go there."
  },
  {
    chapter: "Artworks",
    view: "library",
    spot: "library-table",
    title: "Artworks",
    body: "All your works: photo, series, technique, year and status. Click a row to open its page."
  },
  {
    chapter: "Artworks",
    view: "library",
    spot: "library-add",
    title: "Add a work",
    body: "«+ Add artwork» opens a new record: add the photo, fill in the details and press «Save»."
  },
  {
    chapter: "Artworks",
    view: "library",
    spot: "library-filters",
    title: "Search and filter",
    body: "«▶ Filters» opens search and filters: by technique, status, series, year…"
  },
  {
    chapter: "An artwork's page",
    view: "artworkDetail",
    spot: "detail-tabs",
    title: "An artwork's page",
    body: "This is the page of one of your works. It has three tabs: «Information», «Movements» (sales, loans, exhibitions) and «Price history»."
  },
  {
    chapter: "An artwork's page",
    view: "artworkDetail",
    spot: "detail-photo-actions",
    title: "The photo",
    body: "«Change photo (pick another)» puts in another photo. «Retouch current photo» rotates, crops or adjusts colour. «Save photo…» saves a copy for an email or for printing."
  },
  {
    chapter: "An artwork's page",
    view: "artworkDetail",
    spot: "detail-cert",
    title: "Certificate",
    body: "«Generate certificate» makes the certificate of authenticity as a PDF."
  },
  {
    chapter: "An artwork's page",
    view: "artworkDetail",
    spot: "detail-edit",
    title: "Change details",
    body: "To change something, or to record a sale, press «Edit»."
  },
  {
    chapter: "Edit and sell",
    view: "artworkEdit",
    spot: "form-photo",
    title: "Editing a work",
    body: "This is a work after pressing «Edit». Click the photo to change it."
  },
  {
    chapter: "Edit and sell",
    view: "artworkEdit",
    spot: "form-status",
    title: "The status",
    body: "It's calculated from the movements only. To change it, note what happened in the «Movements» tab: a sale, a loan, an exhibition… or tick «Already returned to the studio»."
  },
  {
    chapter: "Edit and sell",
    view: "artworkEdit",
    spot: "form-save",
    title: "Save",
    body: "After changing something, always press «Save». Otherwise it isn't saved."
  },
  {
    chapter: "Edit and sell",
    view: "artworkEdit",
    spot: "form-movements-tab",
    title: "Movements",
    body: "The «Movements» tab is where sales, loans, gifts and exhibitions are recorded."
  },
  {
    chapter: "Edit and sell",
    view: "artworkMovements",
    spot: "movement-add",
    title: "Record a sale",
    body: "Press «+ Add movement», pick the type (for example «Sale»), the date and the price, and press «Save». Then «Save» on the work."
  },
  {
    chapter: "Edit and sell",
    view: "artworkMovements",
    spot: "back",
    title: "Back",
    body: "«← Back» takes you to the previous screen. If you didn't change anything, nothing is lost."
  },
  {
    chapter: "Exhibitions",
    view: "exhibitions",
    spot: "exhibitions-add",
    title: "Exhibitions",
    body: "Note each exhibition here. «+ Add exhibition»: add title, venue and dates, then «Add works to the exhibition». Works switch to «In exhibition» by themselves while it runs."
  },
  {
    chapter: "Works dossier",
    view: "pricelist",
    spot: "pricelist-add",
    title: "Works dossier",
    body: "A PDF with photos and prices to send to galleries or collectors. Saved dossiers are listed here; «+ New dossier» makes one. To delete one, open it and press «Delete dossier…» at the bottom."
  },
  {
    chapter: "Works dossier",
    view: "pricelistNew",
    spot: "pricelist-mode",
    title: "Choose the works",
    body: "This is a new dossier. First choose the works: «Free selection», «From an exhibition» or «From a series»."
  },
  {
    chapter: "Works dossier",
    view: "pricelistNew",
    spot: "pricelist-header",
    title: "The header",
    body: "Type the dossier's title and, if you like, a subtitle."
  },
  {
    chapter: "Works dossier",
    view: "pricelistNew",
    spot: "pricelist-intro",
    title: "Introduction",
    body: "Here you can tell how the series began. It appears under the header, before the works."
  },
  {
    chapter: "Works dossier",
    view: "pricelistNew",
    spot: "pricelist-preview",
    title: "Preview",
    body: "On the right you see the PDF exactly as it will come out."
  },
  {
    chapter: "Works dossier",
    view: "pricelistNew",
    spot: "pricelist-generate",
    title: "Make the PDF",
    body: "«Save» saves the dossier and «Generate PDF» makes the file. If you leave without saving, the dossier isn't saved."
  },
  {
    chapter: "People and galleries",
    view: "contacts",
    spot: "contacts-add",
    title: "People and galleries",
    body: "Collectors, buyers, galleries and museums. In «Add», choose «+ New…» to create one. Click a contact to see what they bought or showed."
  },
  {
    chapter: "Reminders",
    view: "inbox",
    spot: "inbox-todo",
    title: "Tasks",
    body: "Click «To Do» to open the tasks. Type one and press «Add»; when it's finished, «Done». Everything here saves by itself."
  },
  {
    chapter: "Reminders",
    view: "inbox",
    spot: "inbox-reminder",
    title: "Contact someone",
    body: "Open «Reminders» and press «+ New reminder»: it tells you regularly when it's time to contact a person or gallery."
  },
  {
    chapter: "Reminders",
    view: "inbox",
    spot: "inbox-note",
    title: "Notes",
    body: "Open «Notes» and press «+ New note» to jot anything down."
  },
  {
    chapter: "Accounts",
    view: "financials",
    spot: "financials-actions",
    title: "Accounts",
    body: "«+ Add an expense» notes an expense. «Make Excel summary» prepares the summary for your accountant. Income comes from sales by itself."
  },
  {
    chapter: "Accounts",
    view: "financials",
    spot: "financials-hide",
    title: "Hide amounts",
    body: "Covers the figures if someone is looking at the screen."
  },
  {
    chapter: "Factors and prices",
    view: "pricing",
    spot: "pricing-sizes",
    title: "Factors and prices",
    body: "Here you decide how prices are calculated from size; further down, fixed prices by technique and taxes. Press «Save» after changing something."
  },
  {
    chapter: "Factors and prices",
    view: "pricing",
    spot: "pricing-sheet",
    title: "Price sheet",
    body: "«Generate sheet» makes the price list."
  },
  {
    chapter: "Applications",
    view: "applications",
    spot: "applications-add",
    title: "Applications",
    body: "For competitions, grants and residencies. «+ New application», fill in blocks 1 to 5 and press «Generate PDF»."
  },
  {
    chapter: "Series",
    view: "series",
    spot: "series-list",
    title: "Series",
    body: "Each series with its texts and documents. Pick a series here and add texts with «+ Add text»."
  },
  {
    chapter: "Text generator",
    view: "textGenerator",
    spot: "textgen-works",
    title: "Text generator",
    body: "Prepares a text (an email to a gallery, for example) to paste into ChatGPT. First choose the works here…"
  },
  {
    chapter: "Text generator",
    view: "textGenerator",
    spot: "textgen-copy",
    title: "Copy to the chat",
    body: "…type what you want, press «Copy the text» and paste it into the chat."
  },
  {
    chapter: "Example library",
    view: "examples",
    spot: "examples-save",
    title: "Example library",
    body: "Your own texts, used as models for the generator. This page doesn't save by itself: press «Save changes»."
  },
  {
    chapter: "Backup",
    view: null,
    spot: "backup-box",
    title: "Backup",
    body: "Here you keep a copy of everything (data and photos) in iCloud or another folder. It runs by itself every day. If the computer breaks: install the app, copy the «Inventario de Arte - copia» folder from iCloud into «Documents» and pick it with «Change folder»."
  },
  {
    chapter: "End",
    view: null,
    spot: "help-button",
    title: "That's it",
    body: "If you get lost, «? Help» opens this guide again. The menu at the top of this window jumps to any topic."
  }
];

const de: HelpStep[] = [
  {
    chapter: "Willkommen",
    view: null,
    spot: "help-button",
    title: "Willkommen",
    body: "Ich zeige dir das Programm Bildschirm für Bildschirm. Bei jedem Schritt rahme ich gelb ein, worum es geht. Drücke «Weiter →». Diese Anleitung öffnest du wieder mit «? Hilfe»."
  },
  {
    chapter: "Willkommen",
    view: null,
    spot: "sidebar-nav",
    title: "Die Bereiche",
    body: "Hier links sind alle Teile des Programms. Klicke einen an, um hinzugehen."
  },
  {
    chapter: "Werkliste",
    view: "library",
    spot: "library-table",
    title: "Werkliste",
    body: "Alle deine Werke: Foto, Serie, Technik, Jahr und Status. Klicke eine Zeile an, um die Seite des Werks zu öffnen."
  },
  {
    chapter: "Werkliste",
    view: "library",
    spot: "library-add",
    title: "Ein Werk hinzufügen",
    body: "«+ Werk hinzufügen» öffnet ein neues Werk: Foto einsetzen, Angaben ausfüllen und «Speichern» drücken."
  },
  {
    chapter: "Werkliste",
    view: "library",
    spot: "library-filters",
    title: "Suchen und filtern",
    body: "«▶ Filter» öffnet Suche und Filter: nach Technik, Status, Serie, Jahr…"
  },
  {
    chapter: "Die Seite eines Werks",
    view: "artworkDetail",
    spot: "detail-tabs",
    title: "Die Seite eines Werks",
    body: "Das ist die Seite eines deiner Werke. Sie hat drei Reiter: «Informationen», «Bewegungen» (Verkäufe, Leihgaben, Ausstellungen) und «Preisverlauf»."
  },
  {
    chapter: "Die Seite eines Werks",
    view: "artworkDetail",
    spot: "detail-photo-actions",
    title: "Das Foto",
    body: "«Foto ändern (andere wählen)» setzt ein anderes Foto ein. «Aktuelles Foto nachbearbeiten» dreht, schneidet zu oder passt die Farbe an. «Foto speichern…» speichert eine Kopie für eine E-Mail oder zum Drucken."
  },
  {
    chapter: "Die Seite eines Werks",
    view: "artworkDetail",
    spot: "detail-cert",
    title: "Zertifikat",
    body: "«Zertifikat erstellen» erstellt das Echtheitszertifikat als PDF."
  },
  {
    chapter: "Die Seite eines Werks",
    view: "artworkDetail",
    spot: "detail-edit",
    title: "Angaben ändern",
    body: "Um etwas zu ändern oder einen Verkauf einzutragen, drücke «Bearbeiten»."
  },
  {
    chapter: "Bearbeiten und verkaufen",
    view: "artworkEdit",
    spot: "form-photo",
    title: "Ein Werk bearbeiten",
    body: "So sieht ein Werk nach «Bearbeiten» aus. Klicke auf das Foto, um es zu ändern."
  },
  {
    chapter: "Bearbeiten und verkaufen",
    view: "artworkEdit",
    spot: "form-status",
    title: "Der Status",
    body: "Er ergibt sich nur aus den Bewegungen. Um ihn zu ändern, trage im Reiter «Bewegungen» ein, was passiert ist: ein Verkauf, eine Leihgabe, eine Ausstellung… oder hake «Bereits zurück im Atelier» an."
  },
  {
    chapter: "Bearbeiten und verkaufen",
    view: "artworkEdit",
    spot: "form-save",
    title: "Speichern",
    body: "Nach jeder Änderung immer «Speichern» drücken. Sonst wird nichts gespeichert."
  },
  {
    chapter: "Bearbeiten und verkaufen",
    view: "artworkEdit",
    spot: "form-movements-tab",
    title: "Bewegungen",
    body: "Im Reiter «Bewegungen» werden Verkäufe, Leihgaben, Geschenke und Ausstellungen eingetragen."
  },
  {
    chapter: "Bearbeiten und verkaufen",
    view: "artworkMovements",
    spot: "movement-add",
    title: "Einen Verkauf eintragen",
    body: "Drücke «+ Bewegung hinzufügen», wähle die Art (zum Beispiel «Verkauf»), das Datum und den Preis und drücke «Speichern». Danach «Speichern» beim Werk."
  },
  {
    chapter: "Bearbeiten und verkaufen",
    view: "artworkMovements",
    spot: "back",
    title: "Zurück",
    body: "«← Zurück» bringt dich zum vorigen Bildschirm. Wenn du nichts geändert hast, geht nichts verloren."
  },
  {
    chapter: "Ausstellungen",
    view: "exhibitions",
    spot: "exhibitions-add",
    title: "Ausstellungen",
    body: "Hier trägst du jede Ausstellung ein. «+ Ausstellung hinzufügen»: Titel, Ort und Daten, dann «Werke zur Ausstellung hinzufügen». Die Werke stehen während der Ausstellung von selbst auf «In Ausstellung»."
  },
  {
    chapter: "Werkdossier",
    view: "pricelist",
    spot: "pricelist-add",
    title: "Werkdossier",
    body: "Ein PDF mit Fotos und Preisen für Galerien oder Sammler. Hier stehen die gespeicherten Dossiers; «+ Neues Dossier» erstellt eins. Zum Löschen eins öffnen und unten «Dossier löschen…» drücken."
  },
  {
    chapter: "Werkdossier",
    view: "pricelistNew",
    spot: "pricelist-mode",
    title: "Die Werke wählen",
    body: "So sieht ein neues Dossier aus. Zuerst die Werke wählen: «Freie Auswahl», «Aus einer Ausstellung» oder «Aus einer Serie»."
  },
  {
    chapter: "Werkdossier",
    view: "pricelistNew",
    spot: "pricelist-header",
    title: "Die Kopfzeile",
    body: "Schreibe den Titel des Dossiers und, wenn du willst, einen Untertitel."
  },
  {
    chapter: "Werkdossier",
    view: "pricelistNew",
    spot: "pricelist-intro",
    title: "Einleitungstext",
    body: "Hier kannst du erzählen, wie die Serie entstand. Er steht unter der Kopfzeile, vor den Werken."
  },
  {
    chapter: "Werkdossier",
    view: "pricelistNew",
    spot: "pricelist-preview",
    title: "Vorschau",
    body: "Rechts siehst du das PDF genau so, wie es herauskommt."
  },
  {
    chapter: "Werkdossier",
    view: "pricelistNew",
    spot: "pricelist-generate",
    title: "Das PDF erstellen",
    body: "«Speichern» speichert das Dossier, «PDF erstellen» erstellt die Datei. Ohne Speichern geht das Dossier beim Verlassen verloren."
  },
  {
    chapter: "Personen und Galerien",
    view: "contacts",
    spot: "contacts-add",
    title: "Personen und Galerien",
    body: "Sammler, Käufer, Galerien und Museen. Unter «Hinzufügen» wählst du «+ Neu…». Klicke einen Kontakt an, um zu sehen, was er gekauft oder ausgestellt hat."
  },
  {
    chapter: "Erinnerungen",
    view: "inbox",
    spot: "inbox-todo",
    title: "Aufgaben",
    body: "Klicke auf «To Do», um die Aufgaben zu öffnen. Tippe eine ein und drücke «Hinzufügen»; wenn sie erledigt ist, «Fertig». Hier speichert sich alles selbst."
  },
  {
    chapter: "Erinnerungen",
    view: "inbox",
    spot: "inbox-reminder",
    title: "Jemanden kontaktieren",
    body: "Öffne «Erinnerungen» und drücke «+ Neue Erinnerung»: Sie sagt dir regelmäßig, wann du eine Person oder Galerie kontaktieren solltest."
  },
  {
    chapter: "Erinnerungen",
    view: "inbox",
    spot: "inbox-note",
    title: "Notizen",
    body: "Öffne «Notizen» und drücke «+ Neue Notiz», um irgendetwas aufzuschreiben."
  },
  {
    chapter: "Konten",
    view: "financials",
    spot: "financials-actions",
    title: "Konten",
    body: "«+ Ausgabe hinzufügen» trägt eine Ausgabe ein. «Excel-Übersicht erstellen» bereitet die Übersicht für die Steuerberatung vor. Einnahmen kommen von selbst aus den Verkäufen."
  },
  {
    chapter: "Konten",
    view: "financials",
    spot: "financials-hide",
    title: "Beträge ausblenden",
    body: "Verdeckt die Zahlen, wenn jemand auf den Bildschirm schaut."
  },
  {
    chapter: "Faktoren und Preise",
    view: "pricing",
    spot: "pricing-sizes",
    title: "Faktoren und Preise",
    body: "Hier legst du fest, wie Preise aus der Größe berechnet werden; weiter unten Festpreise nach Technik und Steuern. Nach Änderungen «Speichern» drücken."
  },
  {
    chapter: "Faktoren und Preise",
    view: "pricing",
    spot: "pricing-sheet",
    title: "Preistabelle",
    body: "«Tabelle erzeugen» erstellt die Preisliste."
  },
  {
    chapter: "Bewerbungen",
    view: "applications",
    spot: "applications-add",
    title: "Bewerbungen",
    body: "Für Wettbewerbe, Stipendien und Residenzen. «+ Neue Bewerbung», Blöcke 1 bis 5 ausfüllen und «PDF erstellen» drücken."
  },
  {
    chapter: "Serien",
    view: "series",
    spot: "series-list",
    title: "Serien",
    body: "Jede Serie mit ihren Texten und Dokumenten. Wähle hier eine Serie und füge Texte mit «+ Text hinzufügen» hinzu."
  },
  {
    chapter: "Textgenerator",
    view: "textGenerator",
    spot: "textgen-works",
    title: "Textgenerator",
    body: "Bereitet einen Text vor (eine E-Mail an eine Galerie, zum Beispiel), den du in ChatGPT einfügst. Zuerst hier die Werke wählen…"
  },
  {
    chapter: "Textgenerator",
    view: "textGenerator",
    spot: "textgen-copy",
    title: "In den Chat kopieren",
    body: "…schreiben, was du willst, «Text kopieren» drücken und in den Chat einfügen."
  },
  {
    chapter: "Beispielbibliothek",
    view: "examples",
    spot: "examples-save",
    title: "Beispielbibliothek",
    body: "Eigene Texte als Vorlagen für den Generator. Diese Seite speichert nicht von selbst: «Änderungen speichern» drücken."
  },
  {
    chapter: "Sicherung",
    view: null,
    spot: "backup-box",
    title: "Sicherung",
    body: "Hier speicherst du eine Kopie von allem (Daten und Fotos) in iCloud oder einem anderen Ordner. Das passiert jeden Tag von selbst. Geht der Computer kaputt: Programm installieren, den Ordner «Inventario de Arte - copia» aus iCloud nach «Dokumente» kopieren und mit «Ordner ändern» wählen."
  },
  {
    chapter: "Ende",
    view: null,
    spot: "help-button",
    title: "Fertig",
    body: "Wenn du dich verirrst, öffnet «? Hilfe» diese Anleitung wieder. Mit dem Menü oben in diesem Fenster springst du zu jedem Thema."
  }
];

export const HELP_STEPS: Record<Lang, HelpStep[]> = { es, en, de };

/** Steps for the popup tagged `data-help-modal={key}` (generic if unknown). */
export function popupSteps(lang: Lang, key: string): HelpStep[] {
  const set = POPUP_HELP[lang] ?? POPUP_HELP.es;
  return set[key] ?? set.generic;
}
