---
"@ifc-lite/renderer": patch
"@ifc-lite/viewer": patch
---

Instanced elements are registered with the scene as soon as their shard arrives, even while the 3D view is covered, so takeoff, type quantities, urban indicators and the exports see them. Only the GPU upload of the instanced templates waits for the cover to lift. The raw shard bytes are released once registered.
