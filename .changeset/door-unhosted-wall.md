---
"@bimvoice/ifcsheet": patch
---

A door the model hosts in no wall (no IfcRelFillsElement to an opening that voids a wall, as many exports leave their doors) is drawn in the gap of the walls it stands in on a plan: the hinge on the wall face at the jamb and the swing as wide as the gap, not the door's frame. The walls are found by their geometry: those the plan cuts that run along the door's width and whose band holds the door's middle line.
