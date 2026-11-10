---
"@ifc-lite/drawing-2d": patch
"@bimvoice/ifcsheet": patch
---

A plan keeps the geometry that sits exactly on the edge of its projection band. The app's cut position is computed from a percentage and carried a rounding error (1.2000000000000002 for a 1.2 m cut), so the ground slab's edges, exactly 1.2 m below the cut, fell just outside the band and one floor edge disappeared at the default cut height. The generator now allows the band edge a tolerance of 1 nanometre plus a few ulps of the cut position (under 10 nm up to 5e6 m); geometry beyond that stays out.
