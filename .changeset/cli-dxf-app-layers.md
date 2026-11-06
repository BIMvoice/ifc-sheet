---
"@bimvoice/ifcsheet": minor
---

`ifcsheet build --dxf` (and the MCP DXF and handover) write the sheet DXF the way the app does: DXF R2000, with the app's layers (`FRAME`, `TITLEBLOCK`, `CUT`, `SEEN`, `HIDDEN`, `SYMBOLS`, `VIEWPORT-LABELS`, `SITE-SYMBOLS`), through the project's CAD layer standard and line types when `--project` gives them. The R2000 writer and the CAD layer resolver moved into the engine (`@bimvoice/ifcsheet/dxf`) and the app calls them. `exportDxf` is replaced by `sheetGraphicToDxf(sheet, options)`, which returns the file's bytes (windows-1252); `SheetText` has an optional `layer`, and `@bimvoice/ifcsheet/cli` exports `run`.
