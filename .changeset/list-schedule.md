---
"@bimvoice/ifcsheet": minor
"@ifc-lite/viewer": patch
---

A schedule can be built from the Lists engine and placed on a sheet (#78). "New schedule" in the project drawer opens a builder: pick the IFC classes (and, as in a joinery schedule's filter, the storeys and property tests), the columns (any attribute, property or quantity of the loaded models), the grouping and the sums. It is saved as a project schedule of kind `list`, hung on a sheet of its own, and prints through the paged table with the project's units and numbers; CSV and XLSX come from the one export writer. The rows and totals are the Lists panel's: the schedule runs the list through `runListFederated` and the panel's export projection, so the two cannot disagree. The engine reads and writes the definition (`ListScheduleDef`, `readListScheduleDef`) and builds the table (`listScheduleTable`). A project saved before is unchanged. Not in this change: the command line and the MCP tools cannot run a list without the viewer's data provider.
