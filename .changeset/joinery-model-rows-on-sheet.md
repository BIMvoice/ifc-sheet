---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

The door and window schedule can show a property or quantity of the model as a row, chosen from the sheet's "Add a column" picker as in the list schedules (fire rating, U value, any set the models carry). The picker offers the sets found on the schedule's own types and their elements, under the same `source, set, name` key a list column has. A type's cell holds the value its elements share (the element's own, else its IfcTypeProduct's, in the model's units, as a list prints it); where they differ it says "varies" ("diferă" in Romanian), and where none states it, a dash. The row is saved with the project (`content.properties`), hidden, moved and typed over like a built-in row, and printed by the engine too: `joineryScheduleData` takes the rows to read (`modelRowsOf`) and a headless read prints the same table. A typed cell's row id is no longer cut at 40 characters, which a model row's id can exceed.
