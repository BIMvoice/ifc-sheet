---
"@ifc-lite/viewer": minor
---

A new model version shows only what changed. The new command WHATCHANGED compares the model with the state the project recorded (the last issue records one with the set; the first run records one when there is none; WHATCHANGED ACCEPT takes the model as it is now) and prints, sheet by sheet, "A-101: 3 changes" with the list: elements added, removed, moved, reshaped, with a property or property set changed, or retyped, and the tags, labels, dimensions and level marks that lost or changed their element. A sheet that shows nothing that changed says so. What changed is marked in each view that shows it with revision clouds, ordinary drawn shapes on a Revisions layer that the next run replaces and WHATCHANGED CLEAR removes. The recorded state is saved with the project and with each issue; projects without one keep opening.
