---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

Rooms on the Wall (#42): a room and area schedule (rooms by level with number, name and area, a total per level and for the building, paged to the paper, in English and Romanian) joins the other schedules, and `ifcsheet rooms model.ifc` prints the same table on the command line (text, `--csv`, `--json`, `--locale ro`). One rule decides which space is a room and what its area is (the model's NetFloorArea, else GrossFloorArea, else the footprint of the room's geometry, marked), in the engine: the urban indicators' Au, the schedule and the command line read it, so the building total is Au. The room label shows the room's number above its name and area, and keeps clear of the door swings and window frames the plan draws.
