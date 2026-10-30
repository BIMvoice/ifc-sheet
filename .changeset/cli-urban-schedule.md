---
"@bimvoice/ifcsheet": minor
---

`ifcsheet build --project` and the MCP export of a loaded project print the urban indicators (Ac, Ad, Au, POT, CUT) where a sheet places them, and no longer name them as left out (Refs #581, 5 of 8). The rule that reads the storeys' footprints, the rooms and the site, the site-area choice (a typed `siteArea`, else the plot drawn on the site plan, else the model's IfcSite), the table's layout and the English and Romanian words moved from the app to the engine, which reads them through `ScheduleModel` like the app does, so both lay out the same table; `ProjectFacts` reads the project's `siteArea`. The rooms schedule on a sheet now takes its rooms from the same read as Au, and measures the footprints once with the urban schedule. The app imports them from there and its output is unchanged.
