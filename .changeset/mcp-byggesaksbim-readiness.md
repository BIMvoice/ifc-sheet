---
"@ifc-lite/mcp": minor
---

`ifcsheet_check_readiness` now runs the ByggesaksBIM (Norway) check when the project it is given opted in, or when called with `ids: "byggesaksbim"`, and returns the same findings as `ifcsheet check --ids byggesaksbim` and the app. Without either, nothing of it is run.
