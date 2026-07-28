# Art Inventory

A small desktop app for artists to keep track of their work: artworks, photos, series,
exhibitions, contacts, prices and the paperwork that goes with them. Everything is stored
in a normal folder on your own computer — one Excel file plus your images. No account,
no cloud, no internet needed.

[![Download for macOS](https://img.shields.io/badge/Download%20for%20macOS-.dmg-2f6b4f?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/MaxGonzalezSaez-Diez/Mum-tools/releases/latest/download/ArtInventory-mac.dmg)

macOS only, Apple Silicon and Intel.

## Opening it the first time

1. Open the downloaded `.dmg` and drag **Inventario de Arte** into Applications.
2. The first launch shows a warning, because the app is not signed with a paid Apple
   developer certificate. Right-click the app and choose **Open**, then confirm.
3. If macOS still refuses, run this once in Terminal:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Inventario de Arte.app"
   ```

On first open the app asks two things: the language, and where to keep your library
folder (Documents, Desktop, or anywhere you choose). Both can be changed later from the
sidebar.

## What it does

- **Artworks** — title, series, technique, size, year, status, photos and notes.
- **Exhibitions and movements** — where each piece is, where it has been, and when it is due back.
- **People and galleries** — contacts linked to the works they hold.
- **Prices** — size factors and price lists, kept per exhibition.
- **Documents** — artwork booklets, competition applications and certificates of authenticity, exported as PDF.
- **Text generator** — collects the works, notes and sample texts you pick into a prompt you can paste into ChatGPT.

## Your data

The app creates one folder (`ArtInventory` by default) containing `inventory.xlsx`, an
`images` folder and dated backups. Copy it, move it or back it up like any other folder;
the Excel file is readable on its own if you ever stop using the app.

## Languages

The setup screen and the menus are available in **Spanish, English and German**. The rest
of the interface is still Spanish — translating the remaining screens is in progress.

## About this project

This app was written end to end by AI (GPT models driving Cursor), from the first line to
this README. I reviewed and shipped it, and I take responsibility for what it does. It is
a personal tool built for my mother, shared in case it is useful to someone else. There
are no warranties: read the licence, keep backups of your folder.

## Building from source

```bash
cd app
npm install
npm run dev     # development
npm run dist:mac  # produces release/ArtInventory-mac.dmg
```

## Licence

[GNU General Public License v3.0 or later](LICENSE) — copyleft. You may use, study, share
and modify this app, as long as anything you distribute stays under the same licence.
