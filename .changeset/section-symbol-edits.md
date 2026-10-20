---
"@ifc-lite/viewer": patch
---

A section symbol now behaves as one thing. Picking or window-selecting any part selects the whole symbol, and erasing removes all of it (the section view stays). It moves, turns and stretches as a whole, and its section follows; trim, extend, fillet, offset and text editing of a single part leave it alone and say so. Copy, mirror and offset make plain drawing that no longer claims to be the section, and mirroring with erase keeps the original symbol.
