---
"@ifc-lite/mcp": patch
"@ifc-lite/viewer": patch
---

The title block in the PDF, the command line and the MCP tools now reads what the sheet in the app reads. The engine fills the fields from the IFC with the app's own resolver (the phase from IfcProject.Phase, the project manager and designer from the actors assigned PROJECTMANAGER and ARCHITECT, the owner organisation, the address, a mapped property), a typed value wins, the sheet's current revision prints, a project without a layout gets the app's standard layout, and a PNG or JPEG logo is drawn in the logo cell. The project file's schema lists the `titleBlockSources`, `revisions` and `drafts` the document now holds.
