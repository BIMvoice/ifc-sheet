---
"@bimvoice/ifcsheet": patch
---

A plan whose cut meets nothing is no longer blank in `ifcsheet build` and the engine's PDF and DXF when the model has one level: it is drawn as the app draws it, with the overhead side of the cut over the whole extent (a bridge deck above a storey at 0). `generateViewDrawings` and `sheetGraphics` report a plan that is still empty through `onEmpty` and `onEmptyView` (Refs #615).
