---
"@ifc-lite/renderer": minor
---

`Scene.appendToBatches` takes an optional `deferUpload` flag (#154). With it, a non-streaming append registers the meshes (bucket membership, CPU picking data, bounds) but makes no GPU buffer: the buckets stay pending until `rebuildPendingBatches` runs. `Scene.takeDeferredBatchUpload()` returns true once when such an upload is owed, so a host can make the buffers when the view becomes visible. Meshes with an IFC surface texture are still uploaded at once.
