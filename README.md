# Art Inventory

A small desktop app for artists to keep track of their work.

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

## Your data

The app creates one folder (`ArtInventory` by default) containing `inventory.xlsx`, an
`images` folder and dated backups. Copy it, move it or back it up like any other folder;
the Excel file is readable on its own if you ever stop using the app.

## Languages

The setup screen and the menus are available in **Spanish, English and German**. The rest
of the interface is still Spanish — translating the remaining screens is in progress.

## About this project

This app was written end to end by AI. There are no warranties: read the licence, keep backups of your folder.

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
