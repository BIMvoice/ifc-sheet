---
"@ifc-lite/drawing-2d": patch
---

A whole-model elevation is drawn in about a third of the time, with the same visible lines (#863). An outline line that the depth raster shows hidden behind other elements all along, at any depth its own element can give it, is no longer split by the depth of its own surface first: it is classified hidden as it is (`refineOutlineDepths` takes `hiddenAtOrBehind`, `HiddenLineClassifier.hiddenAtOrBehind`). `clipMeshToHalfSpace` gives back a mesh that lies wholly on one side without building a corner per triangle. The hidden-line raster tests only the pixels of each row near a triangle, not its whole bounding box (the same pixels; one mesh of 6,907 long slivers went from 103 s to 2.4 s), and calls `onTick` every 64 triangles within one mesh. A view that shows hidden lines draws the same hidden lines, of the same number and length; a few are split at a different point along them.
