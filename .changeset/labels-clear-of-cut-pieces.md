---
"@bimvoice/ifcsheet": minor
---

A door or window mark placed by TAGALL, Label all or `ifcsheet build --annotate` keeps off every piece the plan cuts, not only each element's biggest: a wall its openings cut in pieces is several outlines, and on FZK-Haus's ground floor at a 6 mm gap two window marks sat on the wall piece beside their window. `ViewElement` gains `pieces` (every cut outline of an element the cut shows in more than one), `LayoutElement` the same, and the new `layoutElementOf` turns the one into the other. With no free place, `layoutLabels` now takes a place off every cut piece before one on a cut piece, then the one with the fewest things too near.
