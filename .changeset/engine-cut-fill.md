---
"@bimvoice/ifcsheet": minor
---

The plans and sections `ifcsheet build` makes now fill each cut band by its material and hatch it, as the app does: a material's colour (or the IFC colour) fills the band, its hatch is stroked over it, the lines inside one material are left out, and a membrane is a heavy dashed line. The PDF carries the fills, hatches and membranes. The DXF writes the hatch strokes and the membrane lines on layers of their own (`VIEW-HATCH-013`, `VIEW-MEMBRANE-070`) and no fills, as it writes no fill for any cut face. The app and the engine now share one function for this (`@bimvoice/ifcsheet/material-drawing`). Layer sets are not read headless yet, so a layer thinner than 2 mm that the section does not cut draws no membrane line there.
