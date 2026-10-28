---
"@bimvoice/ifcsheet": minor
"@ifc-lite/viewer": minor
---

An office's own title block can be imported from a DXF or an SVG. Its line work and fixed text become the project's title block layout (the one the app edits and the PDF, the DXF and `ifcsheet build --project` print), at true size from the DXF's units (millimetres when it states none), shrunk only when larger than the 180 x 50 mm block. The named title block fields are placed on it, and the result can be saved as a library item a standards pack carries.
