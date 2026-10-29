---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

The door and window schedule can be edited from its sheet, as the tables from the Lists engine can. Click a cell of a type's row on the sheet, type another text over the model's, and the cell prints that text in the sheet, the PDF, the SVG, the CSV and the XLSX; "Reset to model value" takes it back, and the editor marks the cell (the print carries no mark). A joinery schedule has one column per type, so a typed text is kept by the type's identity (the GlobalId of its IfcTypeObject when the model has one, else the type's own key) and the row, saved with the project, and printed for that type in every joinery schedule, by the engine too (`scheduleOf`, `readProjectFile`). The name, opening, sill, U value and fire rating rows can be typed over; counts and sizes are measured and cannot. Rows can be removed and added back from the viewport card with the same column choice the list schedules offer. A type that is no longer in the model after an update is listed in "What is missing", where "Delete" drops its typed texts.
