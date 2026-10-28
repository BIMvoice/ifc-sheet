---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

A schedule split into sub-reports is now checked for duplicates and gaps (#186): an element listed in more than one part, and an element of the schedule in no part. The card on the Wall says so in plain words, with the types and storeys involved and a one-click fix where one change sets it right, and "What the model lacks" warns about it. The rule is one function in the engine (`checkSubReports`) that the card and the readiness list both read.
