---
"@ifc-lite/export": patch
---

An IFCX file's materials and window type survive load, export and load again: the exporter writes back the material nodes and the window type edge that the reader derives (#392), instead of dropping them.
