---
"@bimvoice/ifcsheet": minor
---

An element with several materials that is cut in one piece takes the hatch of its thickest layer's material: `dominantMaterialOf` reads a layer set (thickest layer, never a ventilated or empty one), a constituent set (greatest fraction, else the first) and a material list (the first).
