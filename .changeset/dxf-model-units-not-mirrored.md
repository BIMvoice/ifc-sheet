---
"@bimvoice/ifcsheet": minor
---

A sheet's DXF in model units (#831) is no longer mirrored: a plan is written at the IFC's own x and y (it was at x, -y), and an east or west elevation or a section along x reads left to right as on the paper. Every view is the paper's drawing at true size, only scaled and moved, so arcs turn the same way and text and hatches read as on the sheet. `ModelFrame` drops `kx` and `ky`: `modelPoint` no longer reads the cut's signs. The paper-units DXF is unchanged.
