---
"@ifc-lite/viewer": patch
"@bimvoice/ifcsheet": patch
---

Numbers printed on a sheet follow the language: the urban indicators, the site balance, schedules and quantities, level marks, dimensions, label tags and the scale bar write "120,00" in Română and "120.00" in English, through one formatter (`sheetNumber` and `sheetLevel`, exported from `@bimvoice/ifcsheet/names`) that takes the locale as an argument. The CSV, XLSX, DXF coordinates, SVG paths and parsing keep their plain numbers.
