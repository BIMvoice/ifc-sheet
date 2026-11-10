---
"@bimvoice/ifcsheet": minor
---

`ifcsheet build --project` and the MCP export of a loaded project print the room finishes schedule where a sheet places it, and no longer name it as left out (Refs #581, 2 of 8). The rule that reads a model's rooms and their coverings, the table's layout and its English and Romanian words moved from the app to the engine, which reads them through `ScheduleModel` like the app does, so both lay out the same table; the app imports them from there and its output is unchanged.
