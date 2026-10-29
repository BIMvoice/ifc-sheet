---
"@bimvoice/ifcsheet": patch
"@ifc-lite/viewer": patch
---

The text of `ifcsheet rooms`, `boq`, `materials`, `classify` and `check` follows the language of the run (the project's `language`, else `--locale ro|en`, else English), like the generated names. `--locale ro` left English in the closing lines: `rooms` printed "7 rooms; areas from ... Left out: ...", `boq` "506 elements lack a quantity an article takes". Now those lines, the `materials` phrases ("hatch ... fill ... guessed from the name"), the `classify` count and type lines and the `check` heading and findings are written in Romanian too, from one table (`cli-words.ts`) and `READINESS_RO` (the app's Romanian catalogue spreads it now, one copy). `materials`, `classify` and `check` accept `--locale`; `list` writes its figures in the run's language. English output, JSON and CSV keys are unchanged.
