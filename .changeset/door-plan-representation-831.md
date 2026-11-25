---
"@bimvoice/ifcsheet": patch
---

A door or window that carries its own 2D plan representation (Bonsai's Plan / Body / PLAN_VIEW leaf, swing and window symbol, Revit's Plan GeometricSet) is drawn from it on a plan, in place of the symbol generated from its mesh, in the app, `ifcsheet build` and MCP alike. A configured joinery type still wins; a representation that is empty or lies off the element falls back to the generated symbol; "Use plan symbols from the model" switches it off with the other plan symbols (Refs #831).
