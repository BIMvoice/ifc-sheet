---
"@ifc-lite/create": patch
---

`readRoofSystems` no longer parses the property relationships that name none of the roofs it is asked for: it scans each one's bytes first. The specs it returns are unchanged. On a 56 MB architectural model the pass drops from about 78 ms to about 32 ms.
