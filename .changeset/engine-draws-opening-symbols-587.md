---
'@bimvoice/ifcsheet': minor
---

The headless build draws the door and window symbols of a plan as the app does: door swings with their operation types and flips, window opening lines, the configured types of the project (and of the model) with their leaves, sill, transom and glazing bars, and DXF block symbols. They are on `SYMBOLS` pens in the sheets, the PDF and the DXF, in place of the doors' and windows' cut (`planOpeningSymbols`, `openingSheetPens`). Elevation and section symbols are not drawn by the engine yet (Refs #587).
