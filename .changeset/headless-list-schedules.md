---
"@ifc-lite/mcp": minor
"@ifc-lite/viewer": patch
---

A schedule built from the Lists engine now runs without the app. The engine reads the model through its own provider for the Lists engine and runs the same steps the app runs, so `ifcsheet list model.ifc --project p.json --schedule <id>` (text, `--csv`, `--json`, `--locale ro`) and `ifcsheet build --project` print the rows and totals the Lists panel gives for the same definition. `ifcsheet_add_schedule` accepts `kind: "list"` with a definition, validated strictly, and `ifcsheet_issue_set` exports its CSV. The Lists export projection, its unit conversion and the schedule CSV writer moved into the engine so the app and the command line share them.
