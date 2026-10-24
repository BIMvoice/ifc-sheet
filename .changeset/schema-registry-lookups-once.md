---
"@ifc-lite/create": patch
---

`canonicalEntity` and `schemaRegistry` no longer list every entity name of the schema on each call. `canonicalEntity` looks the name up in an upper-case index built once per entity table, and `schemaRegistry` checks each bundled registry once. Results are unchanged. `liveEntityConforms` and `layerSetOf` call both for every element they read, so reading a drawing's material layers takes about a quarter of the time it did.
