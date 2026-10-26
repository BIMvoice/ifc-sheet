---
"@ifc-lite/viewer": patch
"@ifc-lite/ifcx": patch
"@ifc-lite/parser": patch
"@ifc-lite/data": patch
"@ifc-lite/create": patch
"@ifc-lite/export": patch
---

IFCX models are read like IFC ones where the drawings look (#184). `hello-wall.ifcx` no longer logs the "No IFCPROJECT" or the spatial-anchor warning: IFCX has no unit assignment and its lengths are metres by the format, so the reader states that (`IFCX_LENGTH_UNIT_SCALE`) instead of leaving every consumer to look for an `IfcProject` it cannot have. Its space is a room (the effective-entity enumeration now walks the entity table of an IFCX store, which has no STEP type index), named alike in the entity table and the spatial tree, and on its storey. Its three materials are `IfcMaterial` related to the wall and the window type, so the materials table lists them and the wall draws by its own; the window type is an `IfcWindowType` related to its windows, not a fourth `IfcWindow` on no storey. Export still writes the classes the file states: the reader marks the rows it derived (`derivedEntities`) and the exporters write the source class for the window type and nothing for the materials.

Reading and authoring stay apart: the readers of materials and types use `liveEntityConformsForRead` and `readRelatedListsForRead`, while `liveEntityConforms`, `readRelatedLists` and the anchor reader keep refusing an IFCX model as before, so no write path opens on one.
