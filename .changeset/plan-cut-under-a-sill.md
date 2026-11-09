---
"@ifc-lite/drawing-2d": patch
---

A plan cut a hair below the sill of an opening draws the cut wall whole again. The plane tolerance is now at least 10 µm, so the points the geometry kernel places inside a flat face a few µm off its height fall on the same side of the plane as the face's corners, and that face is no longer cut along the diagonals of its triangles (#759, #749).
