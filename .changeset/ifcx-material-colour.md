---
"@ifc-lite/export": patch
"@ifc-lite/ifcx": patch
---

An IFCX file's material colour and opacity survive load, export and load again: the reader keeps a material node's diffuse colour and opacity on its row (`DiffuseColor` and `Opacity` in its `Material` property set), and the export writes them back as `bsi::ifc::presentation::diffuseColor` and `opacity` on the material node.
