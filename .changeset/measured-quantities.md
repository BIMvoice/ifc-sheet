---
"@bimvoice/ifcsheet": minor
"@ifc-lite/viewer": minor
---

Quantities measured from geometry (#74): when an element states no volume or area in its Qto sets, the material takeoff and the quantities by type measure it from the element's mesh: the volume of a closed solid (opened or inconsistently wound meshes are refused and counted, never guessed), one side face of a wall with its openings removed, the top face of a slab. Measured figures carry a `*` on the sheet with a note explaining them, and a CSV and XLSX column names them; a declared figure always wins. The engine exports `measureElement` and `withMeasured`.
