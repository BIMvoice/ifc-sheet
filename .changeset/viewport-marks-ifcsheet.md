---
"@bimvoice/ifcsheet": minor
---

A sheet viewport can show a north arrow and a graphic scale bar. The engine places them (`viewport-marks`, `true-north`) and writes them into the sheet graphic, the PDF and the DXF.

The arrow turns to the model's TrueNorth, else to grid north of its map conversion, else to project north (`siteNorth` in `true-north`), the same rule on the screen and in the file. A site plan keeps its own north arrow and scale bar in a free spot clear of the plot, and takes no corner marks.
