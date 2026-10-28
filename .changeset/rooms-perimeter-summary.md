---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

Rooms on the Wall (#42), next slice: the room and area schedule gains a perimeter column (the outline of the footprint of the room's geometry, the one its area falls back on, in metres and written by the project's number style) and, under the table, the area summary of a Romanian permit set, Su, Sc and Sd per level and for the building. They are the urban indicators' own figures under the permit forms' names (Su = Au, the building's Sc = Ac, the building's Sd = Ad, a level's Sd its own built area), read from the same result, so the room schedule and the urban sheet cannot disagree. The schedule now exports to CSV and XLSX through the one writer, the summary as a second worksheet, areas and perimeters as numeric cells. `ifcsheet rooms` prints the perimeter too (text, `--csv`, `--json`).
