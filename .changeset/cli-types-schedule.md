---
"@bimvoice/ifcsheet": minor
---

`ifcsheet build --project` and the MCP export of a loaded project print the quantities by type where a sheet places it, and no longer name it as left out (Refs #581, 4 of 8). The rule that reads a model's types with their quantities and classification codes, the table's layout and the English and Romanian words moved from the app to the engine, which reads them through `ScheduleModel` like the app does, so both lay out the same table; `ScheduleModel` gains `classification`, the model's own references, which both hosts fill the same way. The app imports them from there and its output is unchanged.
