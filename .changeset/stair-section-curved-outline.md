---
"@ifc-lite/drawing-2d": patch
"@bimvoice/ifcsheet": patch
---

A section drawn from mesh silhouettes now draws the outline of a curved surface: a handrail, a rail or a round column seen from its side keeps its long lines, where only its end caps were drawn. A smooth edge counts only where the surface folds over in the view, so a terrain still outlines as its rim. A smooth edge counts only where its faces turn by at least 1.5°, so a terrain's or a covering's millimetre noise draws no lines. In a section, a plan or an elevation these lines take the depth of the surface they lie on, read across smooth edges only and within one raster pixel of each point, so a round column is no longer hidden by itself, while the inner outline of a ring wall or the bore of a hollow pipe, tilted or oblique to the section, stays hidden behind the element's own front, and a thin rail stays hidden behind a post. A view from a camera (the axonometrics and the 3D-view PDF, `cameraView`) keeps the line work it had. FZK-Haus Section A-A shows its spiral stair with its column, its helical stringer and the gallery railing's handrail and rails (Refs #557).
