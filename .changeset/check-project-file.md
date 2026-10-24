---
"@bimvoice/ifcsheet": minor
"@ifc-lite/mcp": minor
"@ifc-lite/create": patch
"@ifc-lite/viewer": patch
---

`ifcsheet check` and the MCP tool `ifcsheet_check_readiness` can read a saved project (#260). `ifcsheet check model.ifc --project project.ifclite-project.json` (or `project_path` / `project_json` on the tool) checks the project's split schedules for an element listed in more than one part or in none, and says it in the app's own sentences. The schedule rows are built by one function in the engine from the project's joinery catalogue and symbol mapping; the project file's reader, the symbol-mapping rules and the joinery-type reader moved to the engine with it, and the app imports them from there. Without a project, the output is unchanged. `ifcsheet build` does not take `--project`: nothing in the starting set reads it.
