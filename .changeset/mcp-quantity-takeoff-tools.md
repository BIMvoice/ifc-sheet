---
"@ifc-lite/mcp": minor
"@bimvoice/ifcsheet": minor
---

Add the quantity-takeoff tools `ifcsheet_rooms`, `ifcsheet_materials`, `ifcsheet_boq`, `ifcsheet_list` and `ifcsheet_classify`. Each calls the same engine function as the `ifcsheet` command of the same name and returns its `--json` values (numbers as numbers, a quantity the model does not declare as `null`, never 0) with the text and CSV the command prints; they are read-only and take a `model_id` (or a `document_id`) and an optional project for the number format and settings. The engine now exports `roomsOutput`, `materialsOutput`, `boqOutput`, `listOutput` and `classifyOutput`, which the commands print.
