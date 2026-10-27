---
"@ifc-lite/viewer": patch
"@bimvoice/ifcsheet": patch
"@ifc-lite/mcp": patch
---

Every figure written for people follows the project's "Units and numbers" (Refs #388): the legend's sample dimension and level, the figures inside the urban and room-summary notes, and what `ifcsheet boq`, `list` and `build --project` print (also with `--standard ro`) and the MCP schedule sheets draw. The command line writes the same cells as the sheet (`listTableCells`, `boqTableCells`), so `ifcsheet list` now prints two decimals (136,28) instead of the raw sum, and a bill of quantities total is grouped like the sheet's. CSV, XLSX and JSON keep their plain numbers.
