---
"@ifc-lite/viewer": patch
---

A section symbol now behaves as one thing. Picking or window-selecting any part selects the whole symbol, and erasing removes all of it (the section view stays). It stays locked to its section: move, rotate, mirror with erase, trim, extend, fillet, grips and text editing leave it alone and say so, because the cut plane lives on the section view and would be left behind. Copy, mirror and offset make plain drawing that no longer claims to be the section.
