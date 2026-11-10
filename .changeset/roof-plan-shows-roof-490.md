---
"@ifc-lite/drawing-2d": minor
---

A plan draws a roof (an IfcRoof with a body of its own, as Bonsai exports it) whole down to its eaves once its projection reaches the roof, instead of cutting it off at the depth where the plan stops, and draws the roof's ridges, hips and valleys: the creases whose two slopes both face the viewer. A roof plan above the model now shows the roof seen from above, and a plan that cuts the roof draws the hips below the cut solid and the ridge above it dashed.
