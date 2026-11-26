---
"@ifc-lite/drawing-2d": patch
"@bimvoice/ifcsheet": patch
---

A plan draws the part of an element above its cut dashed, as overhead, and no longer as a solid line across the room below. The wall over a wide opening (a folding wall, a glazed wall) printed as two solid lines running through the room, like a wall that is cut: the piece clipped to the band above the cut has its lowest vertex on the cut, and the Rust outline reads it back in f32 a few micrometres below it, so it was classified as spanning the cut. The generator now keeps which band each clipped piece is (`projectionBandPieces`) and a piece of the band above is dashed. Plans at other heights, where the rounding fell the other way, already drew it dashed.
