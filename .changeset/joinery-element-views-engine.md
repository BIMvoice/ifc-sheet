---
"@bimvoice/ifcsheet": minor
---

The element views of the joinery schedule's cards are the engine's. `elementViews` cuts a door or window's front, plan and section from its meshes, `viewPrims` and `planFrame` lay them out as schedule primitives (the card reserves the scaled, mirrored extent of a DXF block with its swing), and `entryViews` picks each type's first occurrence with body geometry through `ScheduleModel.meshesOf`, so a GPU-instanced window is cut from its pieces. The app's files re-export them and keep only its memo; its output is unchanged.
