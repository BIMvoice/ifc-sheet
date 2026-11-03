---
"@bimvoice/ifcsheet": minor
---

A starting set's two sections look in different directions: one cuts across X and one across Y (#665). Each is kept off the thickness of a wall, so it passes through rooms, doors and windows instead of running along a wall. The app and `ifcsheet build` share the rule. `proposeSections` takes the level's walls (`ProposalInput.walls`, read by `PROPOSAL_WALL_TYPES`), and the cuts along the long side carry `, lengthwise` in their label and `long-` in their key.
