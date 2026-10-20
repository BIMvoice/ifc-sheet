---
"@ifc-lite/drawing-2d": patch
---

Sections and elevations no longer draw terrain and roof surfaces triangle by triangle. Triangles that repeat a corner are now recognised as neighbours, so a smooth surface shows only its outline and its sharp edges.
