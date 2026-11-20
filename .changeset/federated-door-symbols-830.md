---
"@bimvoice/ifcsheet": minor
---

A door draws one symbol when several models are loaded (#830). `modelDisciplineOf` reads a model's discipline (architectural, structural, MEP or other) from the classes it holds, the file name only breaking a tie; `symbolMeshes` leaves out the doors and windows of a non-architectural model while an architectural one is loaded, and the second copy of a door or window two models hold (the same GlobalId, or the same class at the same place).
