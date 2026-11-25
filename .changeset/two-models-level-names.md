---
"@bimvoice/ifcsheet": patch
---

`levelsFromStoreys` names a level the same whichever model lists its storeys first: of two storeys at one height whose names are as short as each other, the level takes the first in alphabetical order. Before, it took the name of the model read first, so a project of two models got different plan names depending on which model finished loading first (Refs #863).
