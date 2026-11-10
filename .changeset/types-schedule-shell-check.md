---
"@bimvoice/ifcsheet": patch
---

The shell check behind measured quantities (`measureElement`) finds its candidates through bounding-box hierarchies and reads the winding number by a ray and an error bound, falling back to the full sum when they cannot prove the same reading. The types schedule takes about 0.1 s on FZK and 9 s on a large school model, with `typeQuantitiesOver` output byte-identical on both and on every IFC in the repo (#611).
