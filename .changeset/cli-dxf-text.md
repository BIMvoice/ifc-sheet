---
"@bimvoice/ifcsheet": patch
"@ifc-lite/drawing-2d": patch
---

`ifcsheet build --dxf` writes the sheet's text: the title block, the view titles and the notes are TEXT entities on `SHEET-TEXT`, where the DXF had linework only. A letter windows-1252 has no byte for (ă, ș, ț) is written as a `\U+XXXX` escape, not `?`; `DXFExporter` takes a `texts` option and the DXF writer escapes TEXT values. The layer names still differ from the app's DXF.
