---
"@bimvoice/ifcsheet": minor
---

The drawings now include the parts of an element: a curtain wall's panels, members and doors, a stair's flights and railings, and a wall's IfcBuildingElementPart children. They are aggregated under an element the storey contains, not contained in the storey themselves, so `openModel` left them out of `buildingMeshes` and the building's extent (#586). The new `storeyElementIds` lists a storey's elements with their parts. The engine and the app's framing both call it, so the two agree on the extent. Spaces stay out, as before. On the ISSUE_068 school model the storey plans now draw 303 of the 310 doors, up from 295. The extent of the FZK-Haus and bloc-p4 models is unchanged.
