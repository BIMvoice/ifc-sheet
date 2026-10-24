---
"@bimvoice/ifcsheet": patch
"@ifc-lite/viewer": patch
---

Plans lie where the building's extent puts them on the sheet, not where their own drawing is centred. A plan viewport now carries the extent's centre, so a storey that fills only part of the building, or a plan that includes an element framing left out, is no longer shifted against its box and clipped (Skolebygg's Plan 01 kept 242 of its 3198 cut outlines). The PDF and DXF also mirror plans and east/west elevations the way the sheet does: one `paperSigns` for both.
