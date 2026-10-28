---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

Dimension ergonomics. DIMALL now stands its first string 20 mm (paper) from the walls, leaving a row for tags, and the distance is a dimension-style setting ("DIMALL first string from wall"). A dimension line placed or dragged near another dimension line snaps onto it, with a glyph and the shared line shown; the ALIGN keyword of DIMALIGNED / DIMLINEAR turns this off and on. Chains of dimensions can be edited as one: DIMADDPOINT adds a point, DIMREMOVEPOINT removes a witness point, DIMSPLIT splits the chain in two, each one undo step.
