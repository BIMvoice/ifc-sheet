---
"@ifc-lite/viewer": minor
"@ifc-lite/drawing-2d": minor
---

3D views can be placed on sheets. An axonometric (from a corner of the model, or a saved orthographic camera) is drawn as vector hidden-line work at a true scale, through the same camera-plane projection the 3D-view PDF uses, and prints as paths. A perspective, or an axonometric asked to be shaded, prints as a raster capture of the 3D viewport, taken from its preset corner or saved camera and placed by its box in millimetres; the capture has the pixels the 3D view has on screen (up to 300 dpi, never enlarged) and the card reports the dpi it gives on paper. The image is kept out of the browser's autosave slot (in IndexedDB) and is carried in the project file; a DXF export or issue says which raster views it leaves out. `GeneratorOptions` gains `includeFeatureEdges` and `hiddenLineEdgeTolerancePx`; plans, sections and elevations leave both off and draw as before.
