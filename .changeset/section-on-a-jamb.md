---
"@ifc-lite/drawing-2d": patch
---

A section that lies on a face of an opening, such as a window jamb, to within the plane tolerance now cuts every material layer of the wall alike. A vertex on the plane counts on the side the drawing does not look at, and one tolerance holds for all of an element's meshes, so a face on the plane is cut once and the layers no longer close some solid across the opening and some open (#749).
