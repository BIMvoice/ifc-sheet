---
"@ifc-lite/viewer": patch
---

Reopening a saved project no longer moves anything: section letters and tag leaders keep the place they were saved at, and a view saved without an `auto` flag is not rewritten with `auto: false`. What is derived from a text's box is now measured in the view the entity lives in, not the one the session happens to be looking at (#297).
