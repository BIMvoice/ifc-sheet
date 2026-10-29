---
"@ifc-lite/mcp": minor
---

`ifcsheet_check_readiness` now runs the ByggesaksBIM (Norway) check when the project it is given opted in, or when called with `ids: "byggesaksbim"`, and returns the same findings as `ifcsheet check --ids byggesaksbim` and the app. Without either, nothing of it is run.

A model that is not IFC4 is not checked and gets one `byggesaksbimSchema` finding; a check that cannot run is a tool error naming the reason. The opt-in of an earlier `ifcsheet_load_project` is not remembered: pass `project_path`/`project_json` or `ids` on each call.
