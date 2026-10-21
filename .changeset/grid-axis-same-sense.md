---
"@ifc-lite/create": patch
---

`extractGridAxesForStorey` honours `IfcGridAxis.SameSense`: an axis whose SameSense is FALSE now reports its ends swapped, so `a` is the start of the axis in its authored sense rather than the start of its curve.
