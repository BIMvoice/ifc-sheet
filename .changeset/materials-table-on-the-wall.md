---
"@ifc-lite/viewer": minor
---

A Materials section in the project drawer lists the materials of the loaded models, each with a swatch drawn by the same code as the sheets (the cut band put through the sheet's pens), and edits its hatch, hatch scale, fill, hatch pen and membrane, with a reset to what its name suggests, one material or all. Each edit is one undo step and draws every view, sheet, PDF and DXF again. A material with a row of its own now also hatches the elements the geometry engine cuts in one piece (a wall of one layer), which it did not before; a project with no rows draws as it did. A material's fill now reaches the sheet's cut faces (it only reached the Drawing tab). The table, its name guess and its reader are one copy with the engine (`@bimvoice/ifcsheet/materials`), and `ifcsheet materials <model.ifc> --project <file>` prints how each material draws.
