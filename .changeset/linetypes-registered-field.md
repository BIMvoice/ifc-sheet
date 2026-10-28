---
"@ifc-lite/viewer": patch
---

The project's own line types are now a registered field with their own file, as the field registry requires. A saved project writes `lineTypes` after the fields of the frozen list; reading is unchanged.
