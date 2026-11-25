---
"@bimvoice/ifcsheet": minor
---

A room too small for its tag is tagged the way drawings tag a WC or a shaft. TAGALL, "Annotate the set" and `ifcsheet build --annotate` handle a room tag that lies over the cut because its room is too small for it in this order: (1) a compact tag inside the room, clear of the cut: the room tag type's own template without the name (number and area), else its number alone, and only when the room has a number to show; (2) the whole tag just outside the room at the nearest clear place, with a leader to the room's deepest point; (3) the tag where it was. A tag that is clear of the cut does not move. A compact tag stays parametric: the mode is stamped on it (`LabelExtras.compact`), and `resolveWithExtras` reads the cut-down template. `ViewElement` gains `cutOutlines` (the cut outlines as drawn, not hulls), and the run summary gains `roomsCompact` and `roomsLeader`.
