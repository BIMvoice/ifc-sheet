---
"@ifc-lite/drawing-2d": minor
---

`SectionPlaneConfig` takes an optional `reflected` flag for reflected ceiling plans: the plane looks up, as a flipped plane does, but keeps the plan's x/y instead of mirroring U. The new `looksUp(plane)` export says whether a plane looks up (flipped or reflected); depth signs, the view direction and the projection bands read it.
