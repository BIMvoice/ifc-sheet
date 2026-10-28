---
"@ifc-lite/viewer": patch
---

The default set draws its elevation marks and section lines on the ground-floor plan. A model whose lowest storey is a foundation or basement (the duplex "T/FDN", Schependomlaan "-1 fundering") no longer gets them on that plan: the ground plan is the lowest one whose floor is within 0.3 m of the datum or above it.
