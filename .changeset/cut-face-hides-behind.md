---
"@ifc-lite/drawing-2d": patch
"@bimvoice/ifcsheet": patch
---

A cut face hides what lies behind it (#749). The hidden-line depth buffer has no face on the section plane (a cut solid has no cap there), so an edge a few centimetres behind the plane inside a cut wall, such as a window frame or the sill and head of an opening just past the cut, printed as a visible line over the wall's cut fill and read as the wall drawn across a window. The generator now leaves out the part of each projected line strictly inside a cut face, in every view: it is not dashed even where the view shows hidden lines, since dashes over a cut fill printed as stray marks. A line on the outline of the cut stays as it was; one on a seam between two cut faces (the layers of a wall, a wall against a slab) is inside the cut and is left out. A room tag also keeps half its text height clear of the notes and tags already on the view wherever it goes, as a tag that does not fit already did. Plans and sections change where such lines lay inside cut walls, and the golden sheets are updated for it.
