---
"@bimvoice/ifcsheet": patch
"@ifc-lite/parser": patch
"@ifc-lite/geometry": patch
"@ifc-lite/viewer": patch
"@ifc-lite/mcp": patch
---

The command line reads an IFCX model as the app does (#406). `ifcsheet check`, `build`, `rooms`, `materials`, `boq` and `list` open an `.ifcx` through the readers the app loads it with (`parseIfcx`, now `buildIfcxDataStore` in the parser and `convertIfcxMeshes` in the geometry package, both shared with the viewer), instead of reading the JSON as STEP and reporting a model that was never read as ready. The format comes from the content, not the file name: an IFCX saved as `.json` is read as IFCX, a STEP file named `.ifcx` as STEP, JSON that is not IFCX is refused in one sentence, and so is an IFCX with no geometry of its own, by `check` and `build` alike. The readiness count of rooms now sees an IFCX model's spaces. In the MCP server `ifcsheet_open_model` opens IFCX; `model_load` (STEP only) refuses it by name of the format.
