# Data Model

The app stores its data in the user-chosen library folder (`ArtInventory` by default, or the legacy `MumArtLibrary` path). The user edits data through the desktop UI; Excel is a best-effort mirror and should not be treated as the primary editing interface.

## Workbook Sheets

- `Artworks`: one row per artwork or artwork concept.
- `Editions`: one row per individual print, proof, practice copy, or numbered copy.
- `Images`: relative file paths for artwork and edition images.
- `PeopleAndOrganizations`: galleries, sellers, buyers, collectors, framers, and other contacts.
- `Transactions`: sales, consignments, loans, gifts, losses, returns, and movements.
- `Locations`: studio, home, galleries, storage, buyers, and other physical locations.
- `Series`: named bodies of work.
- `Lookups`: controlled dropdown values used by the UI.
- `CustomFields`: fields the user adds from the app.
- `CustomFieldValues`: values for custom fields, linked to artworks or editions.
- `AuditLog`: reserved for future automatic history.

## Important Rules

- Every important record has a stable ID, such as `ART-000001`, `ED-000001`, or `CON-000001`.
- Images are stored as files beside the workbook. Excel stores relative paths only.
- Custom fields are not random Excel columns. They are stored in `CustomFields` and `CustomFieldValues`.
- The app creates a backup copy before writing the workbook.
- Notes are always available as a forgiving free-text field.

## Edition Tracking

Prints are represented as one artwork plus many edition rows. For example, a print with 20 sale copies and 2 practice copies becomes:

- One row in `Artworks`.
- Twenty numbered rows in `Editions`.
- Two practice/proof rows in `Editions`.

Each edition can have its own status, location, sale price, contact, and notes.
