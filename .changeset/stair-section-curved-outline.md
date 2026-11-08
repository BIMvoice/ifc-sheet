---
"@ifc-lite/drawing-2d": patch
---

A section drawn from mesh silhouettes now draws the outline of a curved surface: a handrail, a rail or a round column seen from its side keeps its long lines, where only its end caps were drawn. A smooth edge counts only where the surface folds over in the view, so a terrain still outlines as its rim. In a section, a plan or an elevation these lines take the depth of their element's own nearest surface, so a round column is no longer hidden by itself; axonometric views keep their own edge tolerance. FZK-Haus Section A-A shows its spiral stair with its column, its helical stringer and the gallery railing's handrail and rails (Refs #557).
