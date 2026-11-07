---
"@ifc-lite/mcp": minor
---

`ifcsheet_issue_set` with `annotated_ifc` writes the set's plan views and sheets into the copy as Bonsai drawings and sheets, and the SVG each one names next to the IFC (`drawings/<view>.svg`, `layouts/<number> - <sheet>.svg`), so an agent driving IfcSheet over MCP gets drawings Bonsai can open (#548). Elevations and sections are not written yet. The result lists the files in `annotated_ifc.svg_files`.
