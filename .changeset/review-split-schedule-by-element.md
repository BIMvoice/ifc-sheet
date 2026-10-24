---
"@ifc-lite/viewer": patch
"@bimvoice/ifcsheet": patch
---

A schedule split into parts can now be checked by hand. "Review by element" on the schedule's card, and on its duplicate and gap findings in "What the model lacks", lists every type with the parts that list it, filtered by kind, storey and status, with keyboard navigation. Each type can be merged into one part, moved to another part, or kept apart on purpose; the duplicate check then leaves it alone in the app, in the readiness list and in `ifcsheet check --project`, because the decision is saved with the schedule (`keptApart`) and read by the engine. Every change made in the review is one undo step. Projects saved before load unchanged.
