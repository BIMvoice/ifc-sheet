---
"@bimvoice/ifcsheet": patch
---

`ScheduleModel`, the one read every schedule takes of a model, has a name, and `scheduleModelsOf` (from `@bimvoice/ifcsheet/project`) fills it from an opened model: the headless list provider and the meshes grouped by element. `check --project` fills it there; the app fills the same interface from its stores. No output changes (Refs #581).
