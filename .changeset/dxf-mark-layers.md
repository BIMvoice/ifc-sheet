---
"@bimvoice/ifcsheet": patch
---

`ifcsheet build --dxf` now writes a project's drafted lines, dimensions, texts and reference marks (section, elevation and detail marks) on the drafting layer they are on, with that layer's name, colour, weight and line type, through the project's CAD layer standard, as the app's DXF does. Before, they were all written on the SHEET layer.
