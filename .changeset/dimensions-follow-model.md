---
"@ifc-lite/viewer": minor
---

A dimension snapped to the corner of a model element now stays on that corner when a new version of the model is opened. Lengthen a wall by 500 mm in the new version and its dimension reads the new length, the dimension line keeping its distance. A dimension whose wall is gone is kept where it was and listed in What is missing. A dimension drawn in the open, or one whose end you have moved by hand, is left as it is. Only axis-aligned corners and edge middles are attached; a turned element's corner is not.
