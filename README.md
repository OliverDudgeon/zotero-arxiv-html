<img src="assets/icon.svg" width="64" height="64" alt="">

# arXiv HTML for Zotero

The Zotero Connector saves the PDF and abstract page of an arXiv paper, but not
the [experimental HTML version](https://info.arxiv.org/about/accessible_HTML.html).
This plugin adds an **Attach arXiv HTML** item context menu entry that saves
`https://arxiv.org/html/<id>` as a self-contained snapshot (stylesheets, fonts
and figures embedded), so it can be read and annotated offline in Zotero's reader.

Requires Zotero 8–10.

## Usage

Select one or more items, right-click, and choose **Attach arXiv HTML**. The
entry only appears when a selected item has an arXiv ID.

- The arXiv ID is read from Extra (`arXiv:<id>`, as written by the arXiv
  translator), then Archive ID, a `10.48550/arXiv.<id>` DOI, then an arxiv.org URL.
- The HTML is saved at the same version as the item's arXiv PDF attachment when
  one exists; otherwise the latest version is used.
- Items that already have an arXiv HTML attachment are skipped.
- Zotero's reader doesn't run page scripts, so arXiv's in-page toggles are
  removed. The page follows your system light/dark theme, and the contents
  sidebar shows when the reader is at least 1280px wide.
- Items are processed one at a time, at most one request every 3 seconds, as
  arXiv asks.

## Development

Built on [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template).

```sh
cp .env.example .env   # set ZOTERO_PLUGIN_ZOTERO_BIN_PATH and ZOTERO_PLUGIN_PROFILE_PATH
npm install
npm start              # run Zotero with the plugin, hot reload
npm test               # run tests inside Zotero
npm run build          # build .scaffold/build/*.xpi
```

Releases: bump the version and push a `v*` tag (`npm run release`); the release
workflow publishes the `.xpi` and `update.json` used for auto-updates.
