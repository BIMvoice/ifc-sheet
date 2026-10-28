---
"@ifc-lite/wasm": patch
"@ifc-lite/viewer": patch
---

A Bonsai drawing (an `IfcAnnotation` with `ObjectType` `DRAWING`, carrying an `EPset_Drawing` and the camera's extent as a box body) is no longer meshed, so its camera extent no longer shows as a large grey block over plans, sections, elevations, 3D views, sheets and exports, and no longer widens the model's extent. Every other `IfcAnnotation` (grid lines, texts, markup) draws as before.
