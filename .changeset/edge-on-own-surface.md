---
"@ifc-lite/drawing-2d": patch
"@bimvoice/ifcsheet": patch
---

An edge that lies on the outline of a surface in front of it is drawn whole. A gable wall's top edge sits on the bottom of the edge-on verge of its roof, and the hidden-line test sampled one pixel, which landed in a verge pixel about half the time, so the gable printed as dashes across the roof of an elevation (the north elevation of the Bonsai house). A sample that is covered is now still visible when a pixel beside it shows a surface at the line's own depth. A pixel that is merely deeper does not count, so a wall top tucked under an eave stays hidden.
