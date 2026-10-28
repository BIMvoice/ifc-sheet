---
"@ifc-lite/viewer": patch
---

Two more places print numbers in the language (#269). A document's bound values ("Elevation", decimal properties and quantities) are written as "+2,70 m" and "12,5" in Română and "+2.70 m" and "12.5" in English, and a language switch re-resolves them. The measure labels (distance and polygon area) on the 2D drawing canvas and in the exported SVG use the language's separators too; a unit override still decides the unit.
