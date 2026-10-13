---
"@ifc-lite/viewer": patch
---

Tagging everything no longer fails on a plan of more than about 120 000 elements: the extent of the view is found by folding the boxes, not by spreading them into one call.
