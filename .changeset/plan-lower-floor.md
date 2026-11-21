---
"@bimvoice/ifcsheet": minor
---

A plan can leave out the floor below: `showLowerFloor` on a plan view (absent: drawn, as before) is read through `viewShowsLowerFloor`, and `drawingWithoutLowerFloor` drops its hidden lines deeper than the plan's floor — the floor below seen through the slab — while the overhead band and what shows through an opening (the stair coming up) stay. The app's drawings and the engine's sheets take the same rule.
