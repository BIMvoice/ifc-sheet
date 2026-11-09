---
"@ifc-lite/drawing-2d": patch
---

Giving mesh outline lines the depth of their own surface (#779) allocates nothing per face or per line any more, with the same drawing: the face clips write into one buffer and the spans and breakpoints are reused typed arrays. On the ISSUE_068 school model an elevation draws in about 28 s instead of 43 s and the twelve views in 225 s instead of 296 s (Refs #557).
