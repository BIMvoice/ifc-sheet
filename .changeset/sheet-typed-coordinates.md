---
"@ifc-lite/viewer": patch
---

Typed absolute coordinates on a sheet now count from the lower-left corner of the paper, with y up, so `20,30` puts a point 20 mm from the left and 30 mm above the bottom edge. Before, y was measured upward from the top edge and the point landed above the paper. Views are unchanged.
