---
"@ifc-lite/semantic": patch
---

SHACL validation uses rdf-validate-shacl 0.7, which counts `sh:maxLength` in Unicode code points itself, so the local replacement of that constraint is removed. Results are unchanged.
