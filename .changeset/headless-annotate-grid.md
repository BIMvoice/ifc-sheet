---
"@bimvoice/ifcsheet": minor
---

Annotating the set from the command line or the MCP tool keeps dimension figures and tags off the grid lines and grid bubbles of the plan, as the app does. The grid strokes are made once, by the new `gridShapesOf`, which the app's grid overlay also calls; `gridAxesOfModel` reads a model's grid axes without the app (Refs #707).
