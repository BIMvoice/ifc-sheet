---
"@bimvoice/ifcsheet": minor
---

A plan has an overhead range of its own (#490): `overheadHeight` on a plan view (absent: what lies above the cut is drawn dashed up to the next storey's floor, or the model's top on the top storey; a height in metres above the cut; 0: nothing overhead), read through `viewOverheadHeight` and taken by `planProjectionBands` (`overhead`), so the app and the engine's sheets draw the same overhead lines.
