---
"@bimvoice/ifcsheet": patch
---

`ifcsheet build` no longer stops with "Maximum call stack size exceeded" on a large model: the DXF writer collected a pen layer's runs with a spread that overflowed on a school's elevations (found by the Milestone 1 acceptance set, Refs #557).
