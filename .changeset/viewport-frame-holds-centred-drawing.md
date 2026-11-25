---
"@bimvoice/ifcsheet": minor
---

New `boundsAbout(bounds, centre, scale)`: a drawing's bounds made even about the point its viewport puts at the viewport's position. A plan of the set is centred on the model's extent (`viewCentre`), not on its own bounds, so a box fitted to its bounds (`fitViewportBox`, centred on that position) cut an off-centre storey off at its frame; fitted to these bounds it holds the drawing where it lands. Bounds off-centre by no more than the box's margin are returned as they are.

New `boundsInRoom(view, center, bounds, extent)`: the part of a plan's drawing bounds inside the room the layout made for it (`viewExtent` about `center`), the box the engine's sheet clips the drawing to. A sheet that fits a plan's frame to these bounds frames it on the building, leaving out an element the framing left out of the extent (a far survey marker), as the engine's sheet does. `crossRefAnnotations` takes the set's `extent` and places a centred plan's elevation marks round these bounds. Elevations, sections, details and site plans are returned as they are.
