---
"@bimvoice/ifcsheet": minor
---

The host-wall rule (#586) counts an IfcCurtainWall as a host alongside the walls: a door or window in a glass wall the plan cuts is drawn as its symbol even when it lies above or below the cut. This covers a door or window that fills an opening in the curtain wall and one that is an aggregated part of it (IfcRelAggregates, no opening); `openingHostsOf` reads both. A curtain wall can be a bare container, so its extent is its own meshes plus those of its parts (`curtainPartsOf`, passed to `hostedInCutWall` as its new last argument). The engine and the app build the same test.
