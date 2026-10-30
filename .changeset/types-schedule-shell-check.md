---
"@bimvoice/ifcsheet": patch
---

The shell check behind measured quantities (`measureElement`) no longer allocates per triangle pair, so the types schedule measures a model about three times faster on FZK (1.5 s to 0.5 s) with identical quantities (#611).
