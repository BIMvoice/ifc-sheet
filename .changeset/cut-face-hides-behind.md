---
"@ifc-lite/drawing-2d": patch
"@bimvoice/ifcsheet": patch
---

A cut face hides what lies behind it (#749). The hidden-line depth buffer has no face on the section plane (a cut solid has no cap there), so an edge a few centimetres behind the plane inside a cut wall, such as a window frame or the sill and head of an opening just past the cut, printed as a visible line over the wall's cut fill and read as the wall drawn across a window. The generator now marks the part of each projected line strictly inside a cut face as hidden (dashed where the view shows hidden lines, left out where it does not); a line on a cut face's outline stays as it was. Plans and sections change where such lines lay inside cut walls, and the golden sheets are updated for it.
