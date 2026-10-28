---
"@bimvoice/ifcsheet": minor
"@ifc-lite/viewer": minor
---

A glTF/GLB model has no storeys, so its levels are the person's: a name and a floor height each, set in the project drawer, found in the model or added by hand. Each level gets a plan, and the levels are saved with the project. The engine exports the `UserLevel` type and `levelsWithUser`, which joins the user's levels to a model's storeys.
