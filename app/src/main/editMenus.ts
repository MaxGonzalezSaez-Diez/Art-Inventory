/**
 * Menu bar and right-click menu in the app's language.
 *
 * Electron has no right-click menu of its own, so «Pegar» with the mouse did
 * nothing, and its default menu bar is in English ("Edit → Paste") with
 * "Reload", which throws away unsaved changes without asking.
 */
import {
  app,
  Menu,
  type MenuItemConstructorOptions,
  type WebContents
} from "electron";
import type { AppLanguage } from "./preferences";

const LABELS = {
  es: {
    about: "Acerca de Inventario de Arte",
    services: "Servicios",
    hide: "Ocultar Inventario de Arte",
    hideOthers: "Ocultar otros",
    showAll: "Mostrar todo",
    quit: "Salir de Inventario de Arte",
    edit: "Edición",
    undo: "Deshacer",
    redo: "Rehacer",
    cut: "Cortar",
    copy: "Copiar",
    paste: "Pegar",
    selectAll: "Seleccionar todo",
    view: "Ver",
    actualSize: "Tamaño real",
    zoomIn: "Ampliar",
    zoomOut: "Reducir",
    fullScreen: "Pantalla completa",
    window: "Ventana",
    minimize: "Minimizar",
    zoom: "Zoom",
    close: "Cerrar ventana",
    front: "Traer todo al frente"
  },
  en: {
    about: "About Inventario de Arte",
    services: "Services",
    hide: "Hide Inventario de Arte",
    hideOthers: "Hide Others",
    showAll: "Show All",
    quit: "Quit Inventario de Arte",
    edit: "Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    view: "View",
    actualSize: "Actual Size",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    fullScreen: "Full Screen",
    window: "Window",
    minimize: "Minimize",
    zoom: "Zoom",
    close: "Close Window",
    front: "Bring All to Front"
  },
  de: {
    about: "Über Inventario de Arte",
    services: "Dienste",
    hide: "Inventario de Arte ausblenden",
    hideOthers: "Andere ausblenden",
    showAll: "Alle einblenden",
    quit: "Inventario de Arte beenden",
    edit: "Bearbeiten",
    undo: "Widerrufen",
    redo: "Wiederholen",
    cut: "Ausschneiden",
    copy: "Kopieren",
    paste: "Einsetzen",
    selectAll: "Alles auswählen",
    view: "Darstellung",
    actualSize: "Originalgröße",
    zoomIn: "Vergrößern",
    zoomOut: "Verkleinern",
    fullScreen: "Vollbild",
    window: "Fenster",
    minimize: "Im Dock ablegen",
    zoom: "Zoomen",
    close: "Fenster schließen",
    front: "Alle nach vorne bringen"
  }
} satisfies Record<AppLanguage, Record<string, string>>;

let language: AppLanguage = "es";

function labels() {
  return LABELS[language] ?? LABELS.es;
}

/** Rebuild the menu bar; call on launch and whenever the language changes. */
export function setMenuLanguage(next: AppLanguage): void {
  language = next in LABELS ? next : "es";
  const l = labels();
  const view: MenuItemConstructorOptions[] = [
    { role: "resetZoom", label: l.actualSize },
    { role: "zoomIn", label: l.zoomIn },
    { role: "zoomOut", label: l.zoomOut },
    { type: "separator" },
    { role: "togglefullscreen", label: l.fullScreen }
  ];
  // Reload and developer tools only while developing.
  if (!app.isPackaged) {
    view.push({ type: "separator" }, { role: "reload" }, { role: "toggleDevTools" });
  }
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about", label: l.about },
              { type: "separator" },
              { role: "services", label: l.services },
              { type: "separator" },
              { role: "hide", label: l.hide },
              { role: "hideOthers", label: l.hideOthers },
              { role: "unhide", label: l.showAll },
              { type: "separator" },
              { role: "quit", label: l.quit }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: l.edit,
      submenu: [
        { role: "undo", label: l.undo },
        { role: "redo", label: l.redo },
        { type: "separator" },
        { role: "cut", label: l.cut },
        { role: "copy", label: l.copy },
        { role: "paste", label: l.paste },
        { role: "selectAll", label: l.selectAll }
      ]
    },
    { label: l.view, submenu: view },
    {
      label: l.window,
      submenu: [
        { role: "minimize", label: l.minimize },
        { role: "zoom", label: l.zoom },
        { role: "close", label: l.close },
        ...(process.platform === "darwin"
          ? ([{ type: "separator" }, { role: "front", label: l.front }] as MenuItemConstructorOptions[])
          : [])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Cortar / Copiar / Pegar on right-click, plus spelling suggestions. */
export function attachContextMenu(contents: WebContents): void {
  contents.on("context-menu", (_event, params) => {
    const l = labels();
    const items: MenuItemConstructorOptions[] = [];
    if (params.isEditable && params.misspelledWord) {
      for (const word of params.dictionarySuggestions.slice(0, 5)) {
        items.push({ label: word, click: () => contents.replaceMisspelling(word) });
      }
      if (items.length) items.push({ type: "separator" });
    }
    // Direct calls on this page (not menu roles), so they always reach the
    // field that was right-clicked.
    if (params.isEditable) {
      const flags = params.editFlags;
      items.push(
        { label: l.cut, enabled: flags.canCut, click: () => contents.cut() },
        { label: l.copy, enabled: flags.canCopy, click: () => contents.copy() },
        { label: l.paste, enabled: flags.canPaste, click: () => contents.paste() },
        { type: "separator" },
        { label: l.selectAll, enabled: flags.canSelectAll, click: () => contents.selectAll() }
      );
    } else if (params.selectionText.trim()) {
      items.push({ label: l.copy, click: () => contents.copy() });
    }
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
}
