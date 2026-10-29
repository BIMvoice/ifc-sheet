---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

Doors and windows from other tools can be given an opening configuration per IFC type: one to three leaves, how each opens (fixed, side-hung, tilt-turn, top-hung, bottom-hung, sliding, door leaves) and a fixed light above. It is set in the Drawn as card of an element and applies to every element of its type. The overall size stays the IFC's, and the schedule prints no sill height for such a type, since the IFC states none. The configuration is a catalogue entry mapped to the type in the project, so the joinery schedule's elevation shows its opening lines, the plan draws the leaf symbol of its windows (the leaf line and its dashed swing), and it is saved with the project; the model is not changed. Graphic standards now carry the direction of the opening lines in elevation (`openingLines`: `towardsHandle` or `towardsHinge`); choosing a standard sets the project's setting, which can still be changed. The built-in standards keep `towardsHandle`, what IfcSheet has always drawn.
