---
"@bimvoice/ifcsheet": minor
"@ifc-lite/mcp": minor
---

`ifcsheet build --project` and the MCP server's export print the door, window and combined schedules where the project's sheets place them, as the app lays them out: each card with the views cut from the model's meshes (a GPU-instanced window included), the opening symbols by the project's opening-line convention, the measured sizes, the typed cells, the sub-reports and the text rows, paged to the box of the schedule's first sheet. The layout (`joineryScheduleLayout`, `layoutJoineryOnSheet`, `joineryPages`), its words (`joineryLabelsOf`, `joinerySayFor`) and `projectSheetOptionsWithViews` are the engine's; the app's files re-export them and its output is unchanged. A door or window schedule of a model with no such element is left out and said.
