---
"@bimvoice/ifcsheet": minor
"@ifc-lite/viewer": minor
---

Elevations and sections are Bonsai drawings too (Refs #548). `buildAnnotatedIfc` takes a `targetView` per view (`PLAN_VIEW`, `ELEVATION_VIEW`, `SECTION_VIEW`, written as `EPset_Drawing.TargetView`) and, for an elevation or section, a `vertical` crop (look direction, centre, width, height, depth) that becomes the camera, placed as Bonsai places it: looking along the view's direction, up the world's Z. It returns `drawings`, one per view, so a view with no annotations still gets a drawing. In the app the camera covers the view's real crop (the interior elevation's wall, a detail's area, the sheet viewport's crop box, else the model's box on the view's plane) and its depth, not the annotations' bounds plus a metre.
