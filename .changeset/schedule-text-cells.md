---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

A joinery schedule takes rows of text typed by hand (#186): a manufacturer, a remark, a note per type. A cell belongs to the type, not to a column, so it stays with its type when types are added or reordered or the model is updated. The text is kept with the project, printed on the sheet (shrunk to fit its card, cut only beyond the smallest caption height), and added to the CSV and XLSX. A sub-report prints the text of the schedule it was cut from. The text of a type that has left the model is kept, listed on the schedule's card and removed from there. Projects saved before text cells open unchanged.
