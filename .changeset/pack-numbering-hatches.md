---
"@bimvoice/ifcsheet": minor
"@ifc-lite/viewer": minor
---

The Romanian and German standards packs now set the sheet numbering and the material hatches. Installing a pack writes its numbering scheme (the default A-001 / A-101 pattern, stated outright, because no standard prescribes one) and its material rows (which hatch each named material draws with where a view cuts it, by Romanian or German names) in the same undo step as the pens and the title block, and "Reset" puts the project's own scheme and table back. `ifcsheet build --standard` numbers the sheets with the pack's scheme, and `ifcsheet materials --standard ro|de` reports the table with the pack's rows laid over it. The hatch patterns are the engine's conventional indications and are not checked against STAS or DIN 1356-1.
