---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
"@ifc-lite/create": minor
---

Joinery configurator, second slice. A door or window type configured by hand now keeps its own windows: an element whose IFC type is mapped uses that mapping, and the name and size rules never pick an entry that belongs to a type, so in a model with two window types of one name, configuring one no longer pulls the other type's windows into its row. A type can have an arched head (round, segmental with a rise, or pointed), which shapes the schedule's elevation outline and the opening lines inside it (leaves under a fixed light are clipped by the arch too); the overall size stays the IFC's and the plan is unchanged. Properties can be added to a type by hand (thermal transmittance and fire rating are suggested, any name is allowed): they are kept in the project, not written to the IFC, shown as rows of the joinery schedule (the U value and fire rating in their own rows, every other name as a row that can be hidden or moved like the model's) and read by the headless engine. English and Romanian.
