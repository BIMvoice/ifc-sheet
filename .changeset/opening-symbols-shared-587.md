---
'@bimvoice/ifcsheet': minor
---

The door and window plan symbols and the joinery strokes they are made of (`openingSymbols`, `doorSymbol`, `windowSymbol`, `typedPlanSymbol`, `planSymbol`, `elevationSymbol`, `sectionSymbol`) now live in the engine, so the app and the headless build can share one copy. No change to what the app draws (Refs #587).
