---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

Filters and symbol choice for joinery schedules (#186): a sub-report, or a whole schedule, can keep only the elements of some IFC classes or predefined types, or whose properties pass tests (equal, not equal, present; `IsExternal`, `FireRating`...), on top of the kind, storey and type it already filtered by. The filter is the engine's, so the app, the CLI check and the duplicate and gap check cut a schedule the same way, and a split that is a partition still checks clean. The schedule's rows carry `IsExternal`, and "Exterior and interior apart" is a split preset. The elevation and the plan can each be left out of the header cell of every type; the choice is kept in the schedule's content, and a project saved before it loads unchanged.
