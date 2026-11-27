---
"@ifc-lite/drawing-2d": patch
---

An elevation or section of a wall seen at an angle draws its window openings right. The reveal turned toward the viewer gets its edge at the wall's face (and the head and sill across it), the reveal's edge at the inside face that the window hides is no longer drawn, and the window's own edge against the reveal is drawn whole instead of in pieces. Hidden-line tests now read a covering face's depth at the sample point rather than at the pixel centre, and an outline's depth ignores a face that only touches one of its ends, which removed the stubs at window corners.
