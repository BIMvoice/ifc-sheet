---
"@ifc-lite/drawing-2d": patch
---

Giving mesh outline lines the depth of their own surface (#779) is several times faster, with the same drawing. A line looks only at the faces a coarse grid holds near it, still exactly the faces the old fine grid gave it; the faces come nearest first, and once those taken put the whole line at or in front of the next one, the rest give no depth; and nothing is allocated per face or per line (Refs #557).
