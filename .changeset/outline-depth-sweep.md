---
"@ifc-lite/drawing-2d": patch
"@bimvoice/ifcsheet": patch
---

The depth of a long outline over a finely meshed element costs in proportion to the faces it meets, not their square: its faces are swept in order and its breakpoints thinned against running bounds, with the same result (#863). `clipMeshesToHalfSpace` and the line merger's grouping call the drawing's `onTick`, and a 3D view (`drawAxonometricView`, `generateCameraDrawing`, `generateCutawayDrawing`) takes an `onTick` and calls it in every stage, so the drawing worker hears from a 3D view while it is drawn.
