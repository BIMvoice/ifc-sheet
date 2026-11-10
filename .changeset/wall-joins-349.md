---
"@bimvoice/ifcsheet": minor
---

Like cut faces join where they meet (#349): walls with walls, slabs with slabs, roofs and columns, each of one material (a layered wall's brick band with the next wall's brick band), are drawn as one region on plans and sections, so a corner shows no mitre diagonal and a T no line where two walls of one material meet. `joinLikeCuts` and `likeCutKey` are new exports; the headless sheets and the app's views call them.
