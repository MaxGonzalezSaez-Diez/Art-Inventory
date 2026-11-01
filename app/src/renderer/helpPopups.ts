/**
 * «Ayuda» pressed while a popup is open: what that popup is for and how to
 * finish it. Keys match `data-help-modal` on each popup. Spots: "@popup" is
 * the whole popup, "@actions" its bottom buttons, anything else a
 * `data-help` inside the popup. Button names «like this» match the UI.
 */
import type { Lang } from "./i18n";
import type { HelpStep } from "./helpContent";

type Row = [spot: string, title: string, body: string];

function popup(name: string, rows: Row[]): HelpStep[] {
  return rows.map(([spot, title, body]) => ({ chapter: name, view: null, spot, title, body }));
}

const es: Record<string, HelpStep[]> = {
  generic: popup("Esta ventana", [
    ["@popup", "Una ventana", "Se abrió una ventana encima de la pantalla. El título de arriba dice para qué sirve. Rellena lo que necesites."],
    ["@actions", "Terminar", "El botón verde guarda o confirma. «Cancelar» o ✕ cierran la ventana sin cambiar nada."]
  ]),
  unsaved: popup("Cambios sin guardar", [
    ["@popup", "Tienes cambios sin guardar", "Ibas a salir de una pantalla con cambios que aún no están guardados."],
    ["@actions", "Elige", "«Guardar y salir» guarda y continúa. «Salir sin guardar» pierde los cambios. «Seguir editando» te deja donde estabas. Si dudas: «Guardar y salir»."]
  ]),
  returned: popup("¿Ha vuelto al estudio?", [
    ["@popup", "¿Ha vuelto al estudio?", "La obra seguía en una galería o prestada y la fecha ya pasó. El programa pregunta si ya la tienes."],
    ["@actions", "Contestar", "«Sí, está en el estudio» la vuelve a poner en estudio. «Todavía no» lo deja como está."]
  ]),
  movement: popup("Añadir movimiento", [
    ["@popup", "Un movimiento", "Aquí apuntas qué pasó con la obra: una venta, un préstamo, un regalo, una exposición…"],
    ["mv-type", "Tipo y fecha", "Elige el «Tipo de movimiento» y la «Fecha». Según el tipo aparecen más casillas: para una venta, «Precio» y «Comprador/a (opcional)»."],
    ["@actions", "Guardar", "Pulsa «Salvar». Después, pulsa también «Guardar» en la obra; si no, no se guarda."]
  ]),
  movementDetail: popup("Un movimiento", [
    ["@popup", "Detalle del movimiento", "Aquí ves los datos de este movimiento. Para cambiarlo, edita la obra y ve a «Movimientos»."]
  ]),
  imageExport: popup("Salvar foto", [
    ["@popup", "Guardar una copia de la foto", "Sigue los pasos de arriba abajo: «1 · Elige la foto», luego «2 · ¿Para qué la quieres?» («Email / web» o «Imprimir»). La ficha de la obra no cambia."],
    ["@actions", "Guardar", "Pulsa «Guardar copia…» y elige dónde guardarla."]
  ]),
  bulkExport: popup("Salvar múltiple", [
    ["@popup", "Guardar varias fotos", "Pulsa «Elegir obras…», marca las obras y elige para qué son. Se guarda la foto principal de cada una."],
    ["@actions", "Guardar", "Pulsa el botón verde para guardar todas las fotos."]
  ]),
  cert: popup("Generar certificado", [
    ["@popup", "Certificado de autenticidad", "Elige el «Idioma» del certificado. Si la obra tiene copias, elige también qué ejemplar es."],
    ["@actions", "Crear", "Pulsa «Generar PDF» y elige dónde guardarlo."]
  ]),
  lookupReassign: popup("Cambiar antes de borrar", [
    ["@popup", "Antes de borrar esta opción", "Hay obras que usan esta opción. Elige en «Elegir nuevo valor…» cuál deben usar a partir de ahora."],
    ["@actions", "Confirmar", "«Actualizar y borrar» cambia esas obras y borra la opción. «Cancelar» no toca nada."]
  ]),
  contact: popup("Contacto", [
    ["@popup", "Datos del contacto", "Rellena lo que sepas; casi todo es opcional. Puedes completarlo más tarde."],
    ["@actions", "Guardar", "Pulsa «Guardar». «Cancelar» cierra sin guardar."]
  ]),
  artworkPicker: popup("Elegir obras", [
    ["@popup", "Elegir obras", "Marca las obras que quieras pulsando sobre ellas."],
    ["picker-search", "Buscar", "Escribe parte del título en «Buscar obra...» para encontrarla antes. «Seleccionar visibles» marca todas las de la lista."],
    ["@actions", "Añadir", "Pulsa el botón verde («Añadir … obra(s) seleccionada(s)») para usarlas."]
  ]),
  docDescription: popup("Descripción del documento", [
    ["@popup", "Descripción", "Escribe un comentario sobre este documento, para saber qué es."],
    ["@actions", "Guardar", "Pulsa «Guardar». «Cancelar» o «Cerrar» salen sin cambios."]
  ]),
  docPick: popup("Documento", [
    ["@popup", "Elegir documento", "Elige el documento que quieres usar. «Cancelar» cierra la ventana."]
  ]),
  exhibitionSale: popup("Venta en la exposición", [
    ["@popup", "Apuntar una venta", "Elige la obra en «— Seleccionar obra —», escribe el «Precio», la «Fecha» y, si quieres, el comprador."],
    ["@actions", "Guardar", "Pulsa «Salvar venta». Queda guardada como venta de la obra."]
  ]),
  exhibitionNew: popup("Nueva exposición", [
    ["@popup", "Nueva exposición", "Escribe el título, el lugar, la ciudad y las fechas. Las obras se añaden después."],
    ["@actions", "Guardar", "Pulsa «Guardar»."]
  ]),
  confirmDelete: popup("Borrar", [
    ["@popup", "¿Seguro?", "Vas a borrar algo y no se puede deshacer. Para confirmar, escribe la palabra que te pide."],
    ["@actions", "Si no quieres borrar", "Pulsa «Cancelar» y no se borra nada."]
  ]),
  sizeType: popup("Tamaño", [
    ["@popup", "Un tamaño", "Pon el nombre y el rango en cm (alto + ancho). Abajo están los factores: cada tarjeta dice «a partir de esta fecha, el factor es este»."],
    ["@actions", "Guardar", "Para cambiar el factor, pulsa «+ Cambiar el factor (nueva fecha)». Al terminar, «Guardar»."]
  ]),
  taxCountry: popup("Impuesto del país", [
    ["@popup", "Impuesto de un país", "Cada tarjeta es un periodo con su %. Si el impuesto cambia, añade otro periodo con «+ Cambió el impuesto (nueva fecha)»."],
    ["@actions", "Guardar", "Pulsa «Guardar»."]
  ]),
  pricingExport: popup("Hoja de precios", [
    ["@popup", "Hoja de precios", "Contesta las preguntas de arriba abajo: con o sin impuesto, qué obras y con el factor de qué fecha."],
    ["@actions", "Crear", "Pulsa «Generar Excel»."]
  ]),
  fixedPriceAdd: popup("Técnica con precio fijo", [
    ["@popup", "Precio fijo", "Elige una técnica de la lista. Después podrás ponerle el precio."],
    ["@actions", "Añadir", "Pulsa «Añadir»."]
  ]),
  fixedPriceEdit: popup("Precio fijo", [
    ["@popup", "Precio de una técnica", "Cada tarjeta dice «a partir de esta fecha, el precio es este». Si cambia, pulsa «+ Cambió el precio (nueva fecha)»."],
    ["@actions", "Guardar", "Pulsa «Guardar»."]
  ]),
  expense: popup("Gasto", [
    ["@popup", "Apuntar un gasto", "Contesta de arriba abajo: «¿De qué tipo es?», cuánto y cuándo, en qué se gastó. Si quieres, añade la foto del ticket."],
    ["@actions", "Guardar", "Pulsa «Guardar gasto»."]
  ]),
  financialExport: popup("Resumen en Excel", [
    ["@popup", "Resumen en Excel", "Elige el periodo (o «Todo el tiempo») y, si quieres, una sola exposición. Si no tocas nada, entra todo."],
    ["@actions", "Crear", "Pulsa «Crear Excel»."]
  ]),
  expensesList: popup("Gastos", [
    ["@popup", "Lista de gastos", "Aquí están tus gastos. Pulsa uno para cambiarlo, o «+ Añadir un gasto»."],
    ["@actions", "Cerrar", "«Cerrar» vuelve a Cuentas."]
  ]),
  paymentsList: popup("Pagos a galerista", [
    ["@popup", "Pagos a galerista", "Obras entregadas a galerías como pago. Cuentan como gasto."],
    ["@actions", "Cerrar", "«Cerrar» vuelve a Cuentas."]
  ]),
  expenseDelete: popup("Borrar gasto", [
    ["@popup", "¿Borrar este gasto?", "Se quitará de las cuentas."],
    ["@actions", "Elegir", "«Sí, borrar» lo borra. «Cancelar» lo deja."]
  ]),
  seriesText: popup("Texto de la serie", [
    ["@popup", "Un texto", "Escribe el «Tema» (de qué trata) y el «Texto»."],
    ["@actions", "Guardar", "Pulsa «Guardar»."]
  ]),
  examplesMove: popup("Mover textos", [
    ["@popup", "Mover a otra categoría", "Elige la «Categoría destino» (o crea una nueva)."],
    ["@actions", "Mover", "Pulsa «Mover aquí»."]
  ]),
  exampleView: popup("Ejemplo", [
    ["@popup", "Un ejemplo", "Aquí lees el ejemplo entero. «Editar» para cambiarlo, «Cerrar» para salir."]
  ]),
  notesFind: popup("Buscar notas", [
    ["@popup", "Buscar y ordenar", "Escribe en «Buscar en las notas…» y elige cómo ordenarlas."],
    ["@actions", "Terminar", "Pulsa «Listo»."]
  ]),
  note: popup("Nota", [
    ["@popup", "Una nota", "Escribe lo que quieras apuntar."],
    ["@actions", "Guardar", "Pulsa el botón verde («Añadir» o «Guardar»). «Cancelar» sale sin guardar."]
  ]),
  reminder: popup("Recordatorio", [
    ["@popup", "Un recordatorio", "Elige la «Persona / galería», cómo contactarla y cada cuánto («Cada» y días o meses)."],
    ["@actions", "Empezar", "Pulsa «Empezar». Cuando toque, aparecerá en «Toca contactar»."]
  ]),
  todoHistory: popup("Tareas finalizadas", [
    ["@popup", "Tareas finalizadas", "Las tareas que ya hiciste. «Devolver a la lista» la recupera."]
  ]),
  examplePicker: popup("Elegir ejemplos", [
    ["@popup", "Ejemplos de estilo", "Marca los textos tuyos que sirvan de modelo. Puedes buscar arriba."],
    ["@actions", "Usar", "Pulsa el botón verde («Usar … ejemplo(s)»)."]
  ]),
  pricelistPrices: popup("Poner precios", [
    ["@popup", "Precios del dossier", "«Precio libre»: escribes cada precio (o el mismo para todas con «Rellenar»). «Precio por factores»: se calcula solo. Solo afecta a este dossier."],
    ["@actions", "Aplicar", "Pulsa «Aplicar precios»."]
  ]),
  photoStraighten: popup("Foto del cuadro", [
    ["photo-stage", "Ajustar el cuadro", "Arrastra las esquinas verdes hasta las esquinas del cuadro. Si tocas el cuadro, el programa intenta encontrarlo solo."],
    ["photo-full", "Sin recortar", "«Toda la foto (sin recortar)» deja la foto entera."],
    ["@actions", "Seguir", "«Usar esta foto» pasa al siguiente paso. «Saltar» sigue sin enderezar."]
  ]),
  photoEdit: popup("Editar foto", [
    ["photo-controls", "Girar, recortar y color", "«Girar foto» si está de lado. «Activar recorte» para quitar bordes. Las barras ajustan la luz y el color."],
    ["@actions", "Guardar", "Pulsa «Guardar foto». «Cancelar» sale sin cambiar la foto."]
  ])
};

const en: Record<string, HelpStep[]> = {
  generic: popup("This window", [
    ["@popup", "A window", "A window opened on top of the screen. The title at the top says what it's for. Fill in what you need."],
    ["@actions", "Finish", "The green button saves or confirms. «Cancel» or ✕ close the window without changing anything."]
  ]),
  unsaved: popup("Unsaved changes", [
    ["@popup", "You have unsaved changes", "You were leaving a screen with changes that aren't saved yet."],
    ["@actions", "Choose", "«Save and leave» saves and moves on. «Leave without saving» loses the changes. «Keep editing» keeps you where you were. If unsure: «Save and leave»."]
  ]),
  returned: popup("Back in the studio?", [
    ["@popup", "Back in the studio?", "The work was still at a gallery or on loan and the date has passed. The app asks whether you have it back."],
    ["@actions", "Answer", "«Yes, it's in the studio» puts it back in the studio. «Not yet» leaves it as it is."]
  ]),
  movement: popup("Add movement", [
    ["@popup", "A movement", "Here you note what happened to the work: a sale, a loan, a gift, an exhibition…"],
    ["mv-type", "Type and date", "Choose the «Movement type» and the «Date». More boxes appear depending on the type: for a sale, «Price» and «Buyer (optional)»."],
    ["@actions", "Save", "Press «Save». Then also press «Save» on the work; otherwise it isn't saved."]
  ]),
  movementDetail: popup("A movement", [
    ["@popup", "Movement details", "These are the details of this movement. To change it, edit the work and go to «Movements»."]
  ]),
  imageExport: popup("Save photo", [
    ["@popup", "Save a copy of the photo", "Follow the steps from top to bottom: «1 · Choose the photo», then «2 · What is it for?» («Email / web» or «Print»). The work's record doesn't change."],
    ["@actions", "Save", "Press «Save copy…» and choose where to save it."]
  ]),
  bulkExport: popup("Save multiple", [
    ["@popup", "Save several photos", "Press «Choose artworks…», tick the works and choose what they're for. The main photo of each is saved."],
    ["@actions", "Save", "Press the green button to save all the photos."]
  ]),
  cert: popup("Generate certificate", [
    ["@popup", "Certificate of authenticity", "Choose the certificate's «Language». If the work has copies, also choose which copy."],
    ["@actions", "Create", "Press «Generate PDF» and choose where to save it."]
  ]),
  lookupReassign: popup("Change before deleting", [
    ["@popup", "Before deleting this option", "Some works use this option. In «Choose new value…», pick what they should use from now on."],
    ["@actions", "Confirm", "«Update and delete» changes those works and deletes the option. «Cancel» touches nothing."]
  ]),
  contact: popup("Contact", [
    ["@popup", "Contact details", "Fill in what you know; almost everything is optional. You can complete it later."],
    ["@actions", "Save", "Press «Save». «Cancel» closes without saving."]
  ]),
  artworkPicker: popup("Choose works", [
    ["@popup", "Choose works", "Tick the works you want by clicking them."],
    ["picker-search", "Search", "Type part of the title in «Search artwork...» to find it faster. «Select visible» ticks every work in the list."],
    ["@actions", "Add", "Press the green button («Add … selected artwork(s)») to use them."]
  ]),
  docDescription: popup("Document description", [
    ["@popup", "Description", "Write a comment about this document so you know what it is."],
    ["@actions", "Save", "Press «Save». «Cancel» or «Close» leave without changes."]
  ]),
  docPick: popup("Document", [
    ["@popup", "Choose a document", "Choose the document you want to use. «Cancel» closes the window."]
  ]),
  exhibitionSale: popup("Sale at the exhibition", [
    ["@popup", "Note a sale", "Pick the work in «— Select artwork —», type the «Price», the «Date» and, if you like, the buyer."],
    ["@actions", "Save", "Press «Save sale». It's saved as a sale of the work."]
  ]),
  exhibitionNew: popup("New exhibition", [
    ["@popup", "New exhibition", "Type the title, venue, city and dates. Works are added afterwards."],
    ["@actions", "Save", "Press «Save»."]
  ]),
  confirmDelete: popup("Delete", [
    ["@popup", "Are you sure?", "You're about to delete something and it can't be undone. To confirm, type the word it asks for."],
    ["@actions", "If you don't want to delete", "Press «Cancel» and nothing is deleted."]
  ]),
  sizeType: popup("Size", [
    ["@popup", "A size", "Give it a name and the range in cm (height + width). Below are the factors: each card says «from this date, the factor is this»."],
    ["@actions", "Save", "To change the factor, press «+ Change the factor (new date)». When done, «Save»."]
  ]),
  taxCountry: popup("Country tax", [
    ["@popup", "A country's tax", "Each card is a period with its %. If the tax changes, add another period with «+ The tax changed (new date)»."],
    ["@actions", "Save", "Press «Save»."]
  ]),
  pricingExport: popup("Price sheet", [
    ["@popup", "Price sheet", "Answer the questions from top to bottom: with or without tax, which works and with the factor of which date."],
    ["@actions", "Create", "Press «Generate Excel»."]
  ]),
  fixedPriceAdd: popup("Technique with fixed price", [
    ["@popup", "Fixed price", "Pick a technique from the list. You can set its price afterwards."],
    ["@actions", "Add", "Press «Add»."]
  ]),
  fixedPriceEdit: popup("Fixed price", [
    ["@popup", "A technique's price", "Each card says «from this date, the price is this». If it changes, press «+ Price changed (new date)»."],
    ["@actions", "Save", "Press «Save»."]
  ]),
  expense: popup("Expense", [
    ["@popup", "Note an expense", "Answer from top to bottom: «What type is it?», how much and when, what it was for. If you like, add a photo of the receipt."],
    ["@actions", "Save", "Press «Save expense»."]
  ]),
  financialExport: popup("Excel summary", [
    ["@popup", "Excel summary", "Choose the period (or «All time») and, if you like, a single exhibition. If you change nothing, everything is included."],
    ["@actions", "Create", "Press «Create Excel»."]
  ]),
  expensesList: popup("Expenses", [
    ["@popup", "List of expenses", "Your expenses are here. Click one to change it, or «+ Add an expense»."],
    ["@actions", "Close", "«Close» goes back to Accounts."]
  ]),
  paymentsList: popup("Gallery payments", [
    ["@popup", "Gallery payments", "Works given to galleries as payment. They count as expenses."],
    ["@actions", "Close", "«Close» goes back to Accounts."]
  ]),
  expenseDelete: popup("Delete expense", [
    ["@popup", "Delete this expense?", "It will be removed from the accounts."],
    ["@actions", "Choose", "«Yes, delete» deletes it. «Cancel» keeps it."]
  ]),
  seriesText: popup("Series text", [
    ["@popup", "A text", "Write the «Topic» (what it's about) and the «Text»."],
    ["@actions", "Save", "Press «Save»."]
  ]),
  examplesMove: popup("Move texts", [
    ["@popup", "Move to another category", "Choose the «Destination category» (or create a new one)."],
    ["@actions", "Move", "Press «Move here»."]
  ]),
  exampleView: popup("Example", [
    ["@popup", "An example", "Read the whole example here. «Edit» to change it, «Close» to leave."]
  ]),
  notesFind: popup("Find notes", [
    ["@popup", "Search and sort", "Type in «Search notes…» and choose how to sort them."],
    ["@actions", "Finish", "Press «Done»."]
  ]),
  note: popup("Note", [
    ["@popup", "A note", "Write whatever you want to note down."],
    ["@actions", "Save", "Press the green button («Add» or «Save»). «Cancel» leaves without saving."]
  ]),
  reminder: popup("Reminder", [
    ["@popup", "A reminder", "Choose the «Person / gallery», how to contact them and how often («Every» and days or months)."],
    ["@actions", "Start", "Press «Start». When it's due, it shows under «Time to contact»."]
  ]),
  todoHistory: popup("Finished tasks", [
    ["@popup", "Finished tasks", "Tasks you already did. «Put back on to-do» brings one back."]
  ]),
  examplePicker: popup("Choose examples", [
    ["@popup", "Style examples", "Tick your own texts that should serve as models. You can search at the top."],
    ["@actions", "Use", "Press the green button («Use … example(s)»)."]
  ]),
  pricelistPrices: popup("Set prices", [
    ["@popup", "Dossier prices", "«Free price»: type each price (or the same for all with «Fill»). «Price by factors»: calculated for you. Only affects this dossier."],
    ["@actions", "Apply", "Press «Apply prices»."]
  ]),
  photoStraighten: popup("Photo of the painting", [
    ["photo-stage", "Fit the painting", "Drag the green corners onto the painting's corners. If you click the painting, the app tries to find it by itself."],
    ["photo-full", "No crop", "«Toda la foto (sin recortar)» keeps the whole photo."],
    ["@actions", "Continue", "«Usar esta foto» goes to the next step. «Saltar» continues without straightening."]
  ]),
  photoEdit: popup("Edit photo", [
    ["photo-controls", "Rotate, crop and colour", "«Girar foto» if it's sideways. «Activar recorte» to trim the edges. The sliders adjust light and colour."],
    ["@actions", "Save", "Press «Guardar foto». «Cancelar» leaves without changing the photo."]
  ])
};

const de: Record<string, HelpStep[]> = {
  generic: popup("Dieses Fenster", [
    ["@popup", "Ein Fenster", "Über dem Bildschirm hat sich ein Fenster geöffnet. Der Titel oben sagt, wofür es ist. Fülle aus, was du brauchst."],
    ["@actions", "Abschließen", "Der grüne Knopf speichert oder bestätigt. «Abbrechen» oder ✕ schließen das Fenster, ohne etwas zu ändern."]
  ]),
  unsaved: popup("Ungespeicherte Änderungen", [
    ["@popup", "Ungespeicherte Änderungen", "Du wolltest einen Bildschirm mit noch nicht gespeicherten Änderungen verlassen."],
    ["@actions", "Wählen", "«Speichern und verlassen» speichert und geht weiter. «Ohne Speichern verlassen» verwirft die Änderungen. «Weiter bearbeiten» bleibt, wo du warst. Im Zweifel: «Speichern und verlassen»."]
  ]),
  returned: popup("Zurück im Atelier?", [
    ["@popup", "Zurück im Atelier?", "Das Werk war noch in einer Galerie oder verliehen, und das Datum ist vorbei. Das Programm fragt, ob du es wiederhast."],
    ["@actions", "Antworten", "«Ja, es ist im Atelier» setzt es zurück ins Atelier. «Noch nicht» lässt es, wie es ist."]
  ]),
  movement: popup("Bewegung hinzufügen", [
    ["@popup", "Eine Bewegung", "Hier trägst du ein, was mit dem Werk passiert ist: ein Verkauf, eine Leihgabe, ein Geschenk, eine Ausstellung…"],
    ["mv-type", "Art und Datum", "Wähle die «Bewegungsart» und das «Datum». Je nach Art erscheinen weitere Felder: bei einem Verkauf «Preis» und «Käufer/in (optional)»."],
    ["@actions", "Speichern", "Drücke «Speichern». Danach auch «Speichern» beim Werk, sonst wird nichts gespeichert."]
  ]),
  movementDetail: popup("Eine Bewegung", [
    ["@popup", "Details der Bewegung", "Hier siehst du die Angaben zu dieser Bewegung. Zum Ändern das Werk bearbeiten und zu «Bewegungen» gehen."]
  ]),
  imageExport: popup("Foto speichern", [
    ["@popup", "Eine Kopie des Fotos speichern", "Gehe die Schritte von oben nach unten durch: «1 · Foto wählen», dann «2 · Wofür brauchst du sie?» («E-Mail / Web» oder «Drucken»). Die Angaben zum Werk ändern sich nicht."],
    ["@actions", "Speichern", "Drücke «Kopie speichern…» und wähle, wo sie gespeichert wird."]
  ]),
  bulkExport: popup("Mehrere speichern", [
    ["@popup", "Mehrere Fotos speichern", "Drücke «Werke wählen…», hake die Werke an und wähle, wofür sie sind. Gespeichert wird jeweils das Hauptfoto."],
    ["@actions", "Speichern", "Drücke den grünen Knopf, um alle Fotos zu speichern."]
  ]),
  cert: popup("Zertifikat erstellen", [
    ["@popup", "Echtheitszertifikat", "Wähle die «Sprache» des Zertifikats. Hat das Werk Exemplare, wähle auch, welches."],
    ["@actions", "Erstellen", "Drücke «PDF erstellen» und wähle, wo es gespeichert wird."]
  ]),
  lookupReassign: popup("Vor dem Löschen ändern", [
    ["@popup", "Bevor du diese Option löschst", "Einige Werke benutzen diese Option. Wähle unter «Neuen Wert wählen…», was sie ab jetzt benutzen sollen."],
    ["@actions", "Bestätigen", "«Aktualisieren und löschen» ändert diese Werke und löscht die Option. «Abbrechen» ändert nichts."]
  ]),
  contact: popup("Kontakt", [
    ["@popup", "Kontaktdaten", "Fülle aus, was du weißt; fast alles ist freiwillig. Du kannst es später ergänzen."],
    ["@actions", "Speichern", "Drücke «Speichern». «Abbrechen» schließt ohne Speichern."]
  ]),
  artworkPicker: popup("Werke wählen", [
    ["@popup", "Werke wählen", "Hake die gewünschten Werke durch Anklicken an."],
    ["picker-search", "Suchen", "Tippe einen Teil des Titels in «Werk suchen...», um es schneller zu finden. «Sichtbare wählen» hakt alle Werke der Liste an."],
    ["@actions", "Hinzufügen", "Drücke den grünen Knopf («… ausgewählte(s) Werk(e) hinzufügen»), um sie zu verwenden."]
  ]),
  docDescription: popup("Beschreibung des Dokuments", [
    ["@popup", "Beschreibung", "Schreibe einen Kommentar zu diesem Dokument, damit du weißt, was es ist."],
    ["@actions", "Speichern", "Drücke «Speichern». «Abbrechen» oder «Schließen» gehen ohne Änderungen."]
  ]),
  docPick: popup("Dokument", [
    ["@popup", "Ein Dokument wählen", "Wähle das Dokument, das du verwenden willst. «Abbrechen» schließt das Fenster."]
  ]),
  exhibitionSale: popup("Verkauf in der Ausstellung", [
    ["@popup", "Einen Verkauf eintragen", "Wähle das Werk unter «— Werk auswählen —», tippe «Preis», «Datum» und, wenn du willst, den Käufer ein."],
    ["@actions", "Speichern", "Drücke «Verkauf speichern». Er wird als Verkauf des Werks gespeichert."]
  ]),
  exhibitionNew: popup("Neue Ausstellung", [
    ["@popup", "Neue Ausstellung", "Gib Titel, Ort, Stadt und Daten ein. Die Werke kommen danach dazu."],
    ["@actions", "Speichern", "Drücke «Speichern»."]
  ]),
  confirmDelete: popup("Löschen", [
    ["@popup", "Sicher?", "Du bist dabei, etwas zu löschen, und das lässt sich nicht rückgängig machen. Zum Bestätigen das verlangte Wort eintippen."],
    ["@actions", "Wenn du nicht löschen willst", "Drücke «Abbrechen», dann wird nichts gelöscht."]
  ]),
  sizeType: popup("Größe", [
    ["@popup", "Eine Größe", "Gib einen Namen und den Bereich in cm (Höhe + Breite) an. Darunter die Faktoren: Jede Karte sagt «ab diesem Datum gilt dieser Faktor»."],
    ["@actions", "Speichern", "Um den Faktor zu ändern, drücke «+ Faktor ändern (neues Datum)». Danach «Speichern»."]
  ]),
  taxCountry: popup("Steuer des Landes", [
    ["@popup", "Steuer eines Landes", "Jede Karte ist ein Zeitraum mit seinem %. Ändert sich die Steuer, füge mit «+ Steuer geändert (neues Datum)» einen Zeitraum hinzu."],
    ["@actions", "Speichern", "Drücke «Speichern»."]
  ]),
  pricingExport: popup("Preistabelle", [
    ["@popup", "Preistabelle", "Beantworte die Fragen von oben nach unten: mit oder ohne Steuer, welche Werke und mit dem Faktor welchen Datums."],
    ["@actions", "Erstellen", "Drücke «Excel erzeugen»."]
  ]),
  fixedPriceAdd: popup("Technik mit Festpreis", [
    ["@popup", "Festpreis", "Wähle eine Technik aus der Liste. Den Preis setzt du danach."],
    ["@actions", "Hinzufügen", "Drücke «Hinzufügen»."]
  ]),
  fixedPriceEdit: popup("Festpreis", [
    ["@popup", "Preis einer Technik", "Jede Karte sagt «ab diesem Datum gilt dieser Preis». Ändert er sich, drücke «+ Preis geändert (neues Datum)»."],
    ["@actions", "Speichern", "Drücke «Speichern»."]
  ]),
  expense: popup("Ausgabe", [
    ["@popup", "Eine Ausgabe eintragen", "Von oben nach unten: «Um welche Art handelt es sich?», wie viel und wann, wofür. Wenn du willst, ein Foto vom Beleg."],
    ["@actions", "Speichern", "Drücke «Ausgabe speichern»."]
  ]),
  financialExport: popup("Excel-Übersicht", [
    ["@popup", "Excel-Übersicht", "Wähle den Zeitraum (oder «Gesamte Zeit») und, wenn du willst, nur eine Ausstellung. Änderst du nichts, kommt alles hinein."],
    ["@actions", "Erstellen", "Drücke «Excel erstellen»."]
  ]),
  expensesList: popup("Ausgaben", [
    ["@popup", "Liste der Ausgaben", "Hier sind deine Ausgaben. Klicke eine an, um sie zu ändern, oder «+ Ausgabe hinzufügen»."],
    ["@actions", "Schließen", "«Schließen» geht zurück zu den Konten."]
  ]),
  paymentsList: popup("Zahlungen an Galerien", [
    ["@popup", "Zahlungen an Galerien", "Werke, die Galerien als Zahlung bekommen haben. Sie zählen als Ausgabe."],
    ["@actions", "Schließen", "«Schließen» geht zurück zu den Konten."]
  ]),
  expenseDelete: popup("Ausgabe löschen", [
    ["@popup", "Diese Ausgabe löschen?", "Sie wird aus den Konten entfernt."],
    ["@actions", "Wählen", "«Ja, löschen» löscht sie. «Abbrechen» behält sie."]
  ]),
  seriesText: popup("Text zur Serie", [
    ["@popup", "Ein Text", "Schreibe das «Thema» (worum es geht) und den «Text»."],
    ["@actions", "Speichern", "Drücke «Speichern»."]
  ]),
  examplesMove: popup("Texte verschieben", [
    ["@popup", "In eine andere Kategorie", "Wähle die «Zielkategorie» (oder lege eine neue an)."],
    ["@actions", "Verschieben", "Drücke «Hierher verschieben»."]
  ]),
  exampleView: popup("Beispiel", [
    ["@popup", "Ein Beispiel", "Hier liest du das ganze Beispiel. «Bearbeiten» zum Ändern, «Schließen» zum Verlassen."]
  ]),
  notesFind: popup("Notizen suchen", [
    ["@popup", "Suchen und sortieren", "Tippe in «Notizen suchen…» und wähle, wie sortiert wird."],
    ["@actions", "Abschließen", "Drücke «Fertig»."]
  ]),
  note: popup("Notiz", [
    ["@popup", "Eine Notiz", "Schreibe auf, was du festhalten willst."],
    ["@actions", "Speichern", "Drücke den grünen Knopf («Hinzufügen» oder «Speichern»). «Abbrechen» geht ohne Speichern."]
  ]),
  reminder: popup("Erinnerung", [
    ["@popup", "Eine Erinnerung", "Wähle «Person / Galerie», wie du sie kontaktierst und wie oft («Alle» und Tage oder Monate)."],
    ["@actions", "Start", "Drücke «Start». Wenn es so weit ist, steht sie unter «Jetzt kontaktieren»."]
  ]),
  todoHistory: popup("Erledigte Aufgaben", [
    ["@popup", "Erledigte Aufgaben", "Aufgaben, die du schon gemacht hast. «Zurück auf die Liste» holt eine zurück."]
  ]),
  examplePicker: popup("Beispiele wählen", [
    ["@popup", "Stilbeispiele", "Hake eigene Texte an, die als Vorlage dienen sollen. Oben kannst du suchen."],
    ["@actions", "Verwenden", "Drücke den grünen Knopf («… Beispiel(e) verwenden»)."]
  ]),
  pricelistPrices: popup("Preise setzen", [
    ["@popup", "Preise des Dossiers", "«Freier Preis»: du tippst jeden Preis (oder mit «Ausfüllen» den gleichen für alle). «Preis nach Faktoren»: wird berechnet. Gilt nur für dieses Dossier."],
    ["@actions", "Übernehmen", "Drücke «Preise übernehmen»."]
  ]),
  photoStraighten: popup("Foto des Bildes", [
    ["photo-stage", "Das Bild einpassen", "Ziehe die grünen Ecken auf die Ecken des Bildes. Klickst du auf das Bild, sucht das Programm es selbst."],
    ["photo-full", "Nicht zuschneiden", "«Toda la foto (sin recortar)» behält das ganze Foto."],
    ["@actions", "Weiter", "«Usar esta foto» geht zum nächsten Schritt. «Saltar» macht ohne Begradigen weiter."]
  ]),
  photoEdit: popup("Foto bearbeiten", [
    ["photo-controls", "Drehen, zuschneiden, Farbe", "«Girar foto», wenn es seitlich liegt. «Activar recorte», um Ränder abzuschneiden. Die Regler ändern Licht und Farbe."],
    ["@actions", "Speichern", "Drücke «Guardar foto». «Cancelar» geht, ohne das Foto zu ändern."]
  ])
};

export const POPUP_HELP: Record<Lang, Record<string, HelpStep[]>> = { es, en, de };
