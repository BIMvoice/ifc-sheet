---
"@ifc-lite/drawing-2d": patch
"@bimvoice/ifcsheet": patch
---

Two hidden-line steps of a large elevation or section no longer cost the square of what they meet, with the same result (#863): the depth of a long outline over a finely meshed element (its faces swept in order, its breakpoints thinned against running bounds), and the test whether a piece of line lies inside a cut face of many edges (the face's edges filed in a grid). `clipMeshesToHalfSpace`, the line merger's grouping and the classifier's split lines call the drawing's `onTick`, and a 3D view (`drawAxonometricView`, `generateCameraDrawing`, `generateCutawayDrawing`) takes an `onTick` and calls it in every stage, so the drawing worker hears from a 3D view while it is drawn.
