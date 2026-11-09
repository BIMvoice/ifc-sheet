---
"@ifc-lite/drawing-2d": patch
---

An element drawn from its mesh outline (roofs, members, stairs, anything without an extruded profile) is now hidden behind what lies in front of it along its whole length. Each outline line takes the depth of the element's own nearest surface under it, split where that surface changes, instead of one depth for the whole element (its nearest point), and that depth sits one raster pixel in front of the surface, so an element is never hidden by itself. On AC20-FZK-Haus the 42 rafters under the roof slabs no longer show as vertical lines through the roof of the South and North elevations, nor as solid lines through the roof of the Dachgeschoss plan.

Two faults of the hidden-line raster that the old single depth masked are fixed with it. A face seen edge-on no longer fills a broken column of pixels at arbitrary depths (its zero area came out as rounding noise), and a point on the far edge of the raster reads the last pixel that can hold anything, so a purlin ending at the verge of the roof no longer shows through it (Refs #557).
