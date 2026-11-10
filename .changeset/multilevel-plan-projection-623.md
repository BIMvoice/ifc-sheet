---
"@bimvoice/ifcsheet": patch
---

A plan in `ifcsheet build` (the PDF and DXF) draws what lies below its cut in a model with two or more storeys, and a reflected plan draws what lies above it, as the app does. The projection bands come from one function, `planProjectionBands`, that the app and the engine both call; it scopes them to the storey the cut sits in from the model's spatial hierarchy (`storeyFloorsOf`). A plan is cut the way the app cuts it: its hidden lines are classified (and left out when the view says `showHidden: false`) and non-extruded geometry projects through the same Rust outline (`createMeshOutlineProvider`, now shared).
