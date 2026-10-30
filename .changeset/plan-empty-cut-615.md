---
"@bimvoice/ifcsheet": patch
---

Every plan that looks down (not a reflected ceiling plan) in a model with fewer than two levels draws what is overhead as the app does, in `ifcsheet build` and the engine's PDF and DXF: the whole extent is seen on both sides of the cut, the floor side as deep as the plan's depth (its cut height when it has none). A bridge deck above a storey at 0, whose 1.2 m cut met nothing, is no longer a blank sheet, and a one-level plan gains dashed overhead lines. The bands come from one function, `boundedProjectionBands`, that the app's drawing hook calls too, with `viewProjection` for a view's depth. `generateViewDrawings` and `sheetGraphics` report a plan that is still empty through `onEmpty` and `onEmptyView` (Refs #615).
