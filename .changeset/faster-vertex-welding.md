---
"@ifc-lite/drawing-2d": patch
---

Drawing generation recognises mesh vertices that share a position by number instead of by a text key per index, so welding costs less on every mesh at every section, elevation and plan. The lines drawn are unchanged.
