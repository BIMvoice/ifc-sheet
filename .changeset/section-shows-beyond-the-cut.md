---
"@ifc-lite/viewer": patch
---

A section made from a line on a plan (the SECTION command, and the sections DRAFTSET adds) now draws what lies beyond the cut, such as walls, doors, stairs and windows seen behind it, as far as the view's depth setting reaches. Before, only what the cut plane crossed was drawn, at any depth. Sections that look the other way show the opposite side, and nothing in front of the cut is drawn.
