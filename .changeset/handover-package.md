---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

Hand over: "Hand over (ZIP)" next to "Issue the set" issues the set and packs it in one ZIP with the issued PDF, a DXF per sheet, the IFC as loaded (byte for byte), every schedule as XLSX through the one schedule writer, and the issue's drawing list as XLSX. Files are named by a pattern kept with the project (`{project} {number} {sheet} {revision} {date} {issue}`, default `{number} {sheet}`, the names an issue always had): plain ASCII, no path separators, at most 100 characters, a repeated name gets (2). `ifcsheet build --handover package.zip [--pattern ...]` writes the PDF, DXFs and IFC with the same builder (`@bimvoice/ifcsheet/handover`). DWG follows with the DWG export (#52); the package carries DXF until then.
