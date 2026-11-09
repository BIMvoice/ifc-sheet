---
"@bimvoice/ifcsheet": patch
---

A door that states no operation (OperationType unset or NOTDEFINED on the door and its type) is now drawn on the plan as Bonsai and IfcOpenShell make its body: hinged at the placement's local x = 0 with the leaf and swing to local +Y, whatever its placement. It used to follow the axes of its footprint, so on a Bonsai export some doors swung into the wrong room or from the wrong hinge. Doors that state SINGLE_SWING_LEFT or RIGHT are unchanged.
