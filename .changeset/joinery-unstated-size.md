---
"@bimvoice/ifcsheet": patch
"@ifc-lite/viewer": patch
---

The joinery schedule prints a dash for a configured door or window type whose IFC states no OverallWidth or OverallHeight, instead of the 1200 x 1500 (or the door default) the symbol is drawn at: a size the model does not state is never invented. The sheet, the CSV and the XLSX agree.
