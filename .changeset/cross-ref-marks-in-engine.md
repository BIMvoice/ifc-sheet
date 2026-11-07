---
"@bimvoice/ifcsheet": minor
---

The section reference marks ("1 / A-301" under a section symbol's letter) and the elevation marks round the ground plan are now made by the engine, from the project's views and sheets, and drawn on the sheet: the PDF, the DXF and `ifcsheet build` carry them as the app's sheet does. The app calls the same code (`crossReferenceMarks`, `sectionReferenceDrafts`, `elevationMarkDrafts`, `viewReference`, `drawingNumbers`, exported from `@bimvoice/ifcsheet`) and its own copy is gone. Marks are never stored.
