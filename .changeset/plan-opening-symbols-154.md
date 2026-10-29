---
"@ifc-lite/viewer": patch
---

The Wall stays more responsive while it draws the floor plans of a large model: the door and window symbols of a plan read each door's footprint without sorting the vertices inside it, and the height of every door and window is read once per model instead of once per plan. On a 56 MB sample, styling the largest plans drops from about 110 ms to about 75 ms. The drawings are unchanged.
