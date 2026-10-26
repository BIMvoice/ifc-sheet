---
"@bimvoice/ifcsheet": minor
"@ifc-lite/viewer": minor
---

Quantities measured from geometry (#74): when an element states no volume or area in its Qto sets, the material takeoff and the quantities by type measure it from the element's mesh: the volume of a closed solid (open or inconsistently wound meshes, and shells that overlap, are refused and counted, never guessed; a void inside a body is subtracted), one side face of a straight wall with its openings removed (other walls get no area), the top face of a slab. Measured figures carry a `*` on the sheet with a note explaining them, and a CSV and XLSX column names them; a declared figure always wins. The engine exports `measureElement` and `withMeasured`.
