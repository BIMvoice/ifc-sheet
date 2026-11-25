---
"@bimvoice/ifcsheet": minor
---

`fitViewportBox` takes the viewport's `center` as an optional third argument. A drawing centred on a point other than the middle of its bounds (a plan of the set, centred on the model's extent by `viewCentre`) lands off the box's middle; the box now widens on both sides by that offset, past the margin, so it holds the drawing where it lands. A drawing off-centre by no more than the margin keeps the box it had, and a call without `center` returns what it did.

New `boundsInRoom(view, center, bounds, extent)`: the part of a plan's drawing bounds inside the room the layout made for it (`viewExtent` about `center`), the box the engine's sheet clips the drawing to. A sheet that fits a plan's frame to these bounds frames it on the building, leaving out an element the framing left out of the extent (a far survey marker), as the engine's sheet does. Elevations, sections, details and site plans are returned as they are.
