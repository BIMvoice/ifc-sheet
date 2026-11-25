---
"@bimvoice/ifcsheet": patch
---

A door the model hosts in no wall is drawn in the gap also when one of its jambs is a thin wall piece that closes the wall's end (0.1 m across the wall, 20 to 30 mm along it). Such a piece runs across the door, so it was left out as a cross wall and the door was drawn on its frame, 25 mm wider than the gap. A wall that runs another way is now taken when its footprint lies inside the band of the walls the door stands in.
