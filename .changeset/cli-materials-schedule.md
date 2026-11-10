---
"@bimvoice/ifcsheet": minor
---

`ifcsheet build --project` and the MCP export of a loaded project print the material takeoff where a sheet places it, and no longer name it as left out (Refs #581, 3 of 8). The rule that reads a model's materials and quantities, the table's layout, the marks on figures measured from geometry and the English and Romanian words moved from the app to the engine, which reads them through `ScheduleModel` like the app does, so both lay out the same table; the app imports them from there and its output is unchanged.
