---
"@ifc-lite/viewer": patch
"@bimvoice/ifcsheet": patch
---

Doors now swing on the side the model states. The plan symbol reads IfcDoor.OperationType, or the door type's when the door says NOTDEFINED (IfcDoorStyle in IFC2X3), against the door's own placement: SINGLE_SWING_LEFT hinges on the placement's -X side and RIGHT on its +X side, as viewed along +Y, and the leaf opens to +Y, so a mirrored placement flips the hand. A pair of leaves is drawn for the DOUBLE_DOOR values. A manual flip still toggles from the stated hand. The joinery schedule's Opening row lists the hands of doors without a configured type.
