---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
"@ifc-lite/drawing-2d": minor
---

Cut-away axonometric views on sheets (#97). "Add a drawing → Cut-away axonometric" makes a 3D view cut at a storey (its default plan cut height, or one typed) and seen from a corner; a 3D view can also carry a section box. The model is clipped to the cut and the box, drawn as hidden-line vectors along the camera, and the faces the cut leaves are filled with the plan's own cut polygons, so it prints in vector on the sheet, in the PDF and in the DXF. A cut-away is drawn at its nominal scale: a vertical edge measures 1:N on paper (seen from an isometric corner, all three axes do). The drawing is made by the engine (`@bimvoice/ifcsheet/axonometric`), which the app, its generation worker and the headless set all call, so they draw the same view. `GeneratorOptions` gains `extraOccluders` (meshes that hide but draw nothing) and `clipPlanes` (open edges along a clip are the caller's to draw); plans, sections, elevations and plain axonometrics leave both off and draw as before.
