---
"@ifc-lite/drawing-2d": patch
---

Where an edge stops being hidden behind what lies in front of it, the drawing now finds the point to within a raster pixel instead of halfway between two of its ten samples. On a 2.7 m wall edge the old point was up to 0.135 m off, so a wall's corner edges and a door's frame were drawn down over the slab in front of them, and the edges of a wall's inner layers stood as ticks at its head, in the elevations of a Bonsai house (Refs #557).
