---
"@ifc-lite/viewer": patch
---

The opening drawing set is laid out once the model's geometry has finished streaming in, not on its first batch, so the same model opens with the same sheets, scales and sections every time.
