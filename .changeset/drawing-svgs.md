---
"@bimvoice/ifcsheet": minor
---

Bonsai drawings come with their SVG (#548). `exportSvg` (in `@bimvoice/ifcsheet/headless`) writes a sheet, or one viewport of it, as SVG from the same layout the PDF and DXF use. `buildAnnotatedIfc` takes an `svg` on a view and on a sheet and returns them as `files`, at the exact `Location` the `IfcDocumentReference` of the drawing or the sheet layout names, so Bonsai opens the drawing without regenerating it.
