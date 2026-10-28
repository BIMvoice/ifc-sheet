---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

A table built from the Lists engine can be edited from its sheet. Click a cell to pick it, type another value over the model's, and the cell prints that value in the sheet, the PDF, the SVG, the CSV and the XLSX; "Reset to model value" takes it back, and the editor marks the cell (the print carries no mark). Columns can be added and removed from the viewport card, with the same choice the builder offers. A typed value is kept by the element's GlobalId and the column's property, saved with the project, printed by the command line and the MCP tools too, and follows its element when a model update moves the rows. A value typed for an element that is no longer in the model is listed in "What is missing", where "Delete" drops it. A grouped table has no element rows, so its cells cannot be typed over.
