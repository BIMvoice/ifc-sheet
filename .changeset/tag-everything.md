---
"@ifc-lite/viewer": minor
---

TAGALL tags every door, window and room of a plan in one action. Doors and windows show the model's Tag (else its Name; a Tag that is only the element's unique id is not a mark), or a running number the summary counts when the model has neither. Each room shows its name and area in the middle of the room, inside it: the room's footprint is cut from its space geometry at the plan height, the area comes from the model's quantities and from the footprint only when the model has none (the summary says how many of each). Labels keep clear of walls, of each other, of dimension strings and of section lines, follow the model, take one undo step, and a second run adds only what is missing. Label templates gain `{A ?? B}` (the first with a value), `{LongName}` and `{Mark}`; LABELALL no longer answers to TAGALL.
