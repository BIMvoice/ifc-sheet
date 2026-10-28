---
"@ifc-lite/viewer": patch
"@bimvoice/ifcsheet": patch
---

Door symbols follow every operation the model states, not only the single swing. IfcDoor.OperationType (or the door type's) now draws SLIDING_TO_LEFT / RIGHT as a leaf bar with an arrow along the wall, DOUBLE_DOOR_SLIDING as two leaves sliding apart, FOLDING_TO_LEFT / RIGHT and DOUBLE_DOOR_FOLDING as zig-zag leaves from the jamb, REVOLVING as a circle with a cross, and the DOUBLE_SWING values with a second, dashed arc to the other side. DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_LEFT / RIGHT swings its two leaves to opposite sides (the named leaf opens to +Y), and a lifting or rolling-up door's bar follows the leaf-side flip. Elevations and sections draw the opening lines of a door without a configured type on the side the model states (mirrored placements included), following the project's opening-line setting and the drawing's flips; a configured joinery type still wins. The DXF, sheet and PDF print the same symbols.
