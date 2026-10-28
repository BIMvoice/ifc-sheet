---
"@bimvoice/ifcsheet": patch
"@ifc-lite/mcp": patch
---

A list schedule with an office classification column now reads the project's classification mappings on the command line (`ifcsheet list`, `build --project`) and in the MCP list schedule (`project_path` / `project_json`), through the one `withListClassification` the app's run takes too.
