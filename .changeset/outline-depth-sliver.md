---
"@ifc-lite/drawing-2d": patch
---

A mesh outline line takes the depth of a face only where it comes within one raster pixel of it, whichever cell of the face grid it lies in: a line just across a cell edge from a thin face no longer takes the wrong depth, so FZK's rafter tails end where the roof slab hides them (Refs #557).
