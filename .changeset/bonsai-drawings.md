---
"@bimvoice/ifcsheet": minor
---

The annotated copy of the IFC now writes each view as a Bonsai drawing and each sheet as a Bonsai sheet. A view becomes an `IfcAnnotation` of `ObjectType` `DRAWING` with its camera, an `EPset_Drawing` (`TargetView`, `Scale`, `HumanScale`), an `IfcGroup` holding the drawing and the view's annotations, and a document reference; a sheet becomes an `IfcDocumentInformation` of `Scope` `SHEET` with one reference per drawing. `buildAnnotatedIfc` takes `sheets`, `bonsai` (default on, IFC4 and IFC4X3) and, per view, `extent`, `cutHeight` and `viewDepth`, and returns `sheets` and each annotation's `drawingExpressId`.
