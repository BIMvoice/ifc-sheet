---
"@bimvoice/ifcsheet": patch
---

One wall gap, one door symbol: an IfcDoor that the model hosts in nothing (it fills no opening and no curtain wall aggregates it) and whose footprint lies in the gap of a hosted door is a piece of that door, such as the sub-frame and lining ArchiCAD exports as IfcDoors of their own, and a plan no longer draws a leaf and a swing for it. Two hosted doors in one gap, doors hosted in nothing that share a gap only with each other, and the side-by-side leaves of a double door are all still drawn.
