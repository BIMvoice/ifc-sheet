---
"@bimvoice/ifcsheet": patch
"@ifc-lite/viewer": patch
---

A site plan's north arrow and scale bar now stand clear of the building footprint, the plot boundary and the setback dimensions, in the app, the PDF and the DXF alike. One rule in the engine places them (a corner first, else the first free spot in the viewport, else beside it), so the screen and `ifcsheet build` draw the same marks at the same paper points. A site plan carries both marks unless its viewport says otherwise.
