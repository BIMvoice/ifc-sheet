---
"@bimvoice/ifcsheet": minor
"@ifc-lite/viewer": minor
---

A sheet's DXF can be written as a CAD working file (#831): layers by element instead of by pen (A-WALL-EXTR and A-WALL-INTR by IsExternal or the wall's name, A-DOOR, A-GLAZ, A-FLOR, A-ROOF, A-ANNO-DIMS and so on, the project's own CAD layer rules still winning), and units of the model instead of the paper (each view at its true size in metres, without the sheet's frame and title block). The sheet panel has both choices; `ifcsheet build --dxf` has `--dxf-layers pen|element` and `--dxf-units paper|model`. Without them the files are as before.
