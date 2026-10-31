---
"@bimvoice/ifcsheet": patch
---

`ifcsheet build` now warns on stderr, in English or Romanian by the run's locale, for each plan whose drawing holds nothing, naming the sheet and the view ("A-101 Level 0: the plan's cut shows nothing, so the plan is blank on this sheet"). stdout and the exit code are unchanged.
