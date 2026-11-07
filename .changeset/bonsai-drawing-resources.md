---
"@bimvoice/ifcsheet": minor
---

A drawing written for Bonsai carries the resource paths Bonsai reads in `EPset_Drawing` (Stylesheet, Markers, Symbols, Patterns, ShadingStyles and CurrentShadingStyle) with Bonsai's own defaults, so Bonsai finds its stylesheet and symbols when it regenerates the drawing's SVG. IfcSheet still writes no SVG: that needs the app's renderer.
