---
"@ifc-lite/viewer": patch
---

Tagging everything on a large plan is quick and no longer fails on a very large one. Every place a label could take was tested against the outline of every element the drawing shows; the places are now tested against the ones near them. 500 labels among 50 000 elements took 15 seconds and take under half a second. A plan of more than about 120 000 elements no longer overflows the call stack when the extent of the view is taken.
