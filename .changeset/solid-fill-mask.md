---
"@bimvoice/ifcsheet": minor
---

A solid fill can mask what is behind it (#681). A hatch carries an optional `opaque` flag and a `fill` colour: the headless sheet, and so its PDF, draws it fully opaque in that colour instead of at 0.85, and `fillLoopsOf`, `fillColourOf` and `maskingFill` make one from a closed polyline, a rectangle or a circle. A solid hatch saved without the flag reads and draws as it did.
