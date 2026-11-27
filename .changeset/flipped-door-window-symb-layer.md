---
"@bimvoice/ifcsheet": patch
---

A plan draws a door that opens out of the building whole: its leaf and swing past the model's extent are no longer clipped away with the viewport's box, so a door flipped in Bonsai (turned 180 degrees, opening outwards) keeps its symbol, and the view's title moves under what reaches out. A detail still shows only its area. In a DXF by element, a plan's window symbols are now on A-GLAZ-SYMB and the door symbols stay on A-DOOR-SYMB. `openingPens` and `openingSheetPens` take an optional `byKind`, `openingSheetPens` a `box` of null for unclipped runs, and `OPENING_CLASS`, `symbolsClipped` and `symbolOverhangs` are new exports (#831).
