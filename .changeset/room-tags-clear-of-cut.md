---
"@bimvoice/ifcsheet": minor
---

A room tag placed by TAGALL or `ifcsheet build --annotate` keeps its text off every piece the plan cuts, not only each element's biggest: a tag that lies over a cut piece goes to the deepest place in its room clear of them all; with no such place it keeps the place it had. A tag already clear of the cut does not move. On FZK-Haus's ground floor the living room's tag lay on a flight of the stair. `ViewElement` gains `cut` (the view cuts it), and the door and window marks and the room tags read what they keep clear of from one function, `solidPieces` in `labels/label-layout.ts`.
