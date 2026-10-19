---
"@ifc-lite/viewer": minor
"@ifc-lite/drawing-2d": minor
---

3D views can be placed on sheets. An axonometric (from a corner of the model, or a saved orthographic camera) is drawn as vector hidden-line work at a true scale, through the same camera-plane projection the 3D-view PDF uses, and prints as paths. A perspective, or an axonometric asked to be shaded, prints as a raster capture of the 3D viewport sized for its box at 300 dpi. `GeneratorOptions` gains `includeFeatureEdges` and `hiddenLineEdgeTolerancePx`; plans, sections and elevations leave both off and draw as before.
