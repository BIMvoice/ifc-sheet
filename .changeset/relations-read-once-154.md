---
"@ifc-lite/parser": patch
"@ifc-lite/create": minor
---

Reading many elements of a large model no longer slows down with the size of the schema or the number of roofs. `getAttributeNamesForSchema` and `getAttributeTypeForSchema` now look a class up in an index built once per schema version, where they used to scan every entity name on each call. The new `readRoofSystems(store, roofIds, view)` reads the specs of many roofs in one pass over the property relationships, and gives each roof the same answer `readRoofSystem` would.
