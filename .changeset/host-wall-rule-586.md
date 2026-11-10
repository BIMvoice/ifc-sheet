---
"@bimvoice/ifcsheet": minor
---

A plan draws the symbol of a door or window whose host wall it cuts, even when the opening lies wholly above or below the cut (#586). The host is found through IfcRelFillsElement (the opening the door or window fills) and IfcRelVoidsElement (the wall the opening voids); `openingHostsOf` reads it and `hostedInCutWall` is the test `openingSymbols` takes as its new last argument. The engine (`planOpeningSymbols`) and the app (`viewOpeningSymbols`) both build the test here. A door or window with no host, or whose host wall the cut does not pass through, is drawn as before. On the ISSUE_068 school, the plans now draw all 310 doors and 266 windows, up from 303 and 264. FZK-Haus and bloc-p4 are unchanged. The rule draws only the doors and windows of the plan's own storey (`storeyMembersOf`, the membership plans are framed and cut by, aggregated parts included), so a door of another storey never shows through a double-height wall that the plan also cuts.
