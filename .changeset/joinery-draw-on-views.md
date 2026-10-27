---
"@bimvoice/ifcsheet": minor
"@ifc-lite/create": minor
---

Draw on the door and window schedule views: double-click a type's front, plan or section in a joinery schedule to enter it as a drafting view, with the same tools, snaps, command line and undo as a plan. Lines, polylines, circles, arcs, text and hatches belong to the type (stored on the type in the view's own frame, `JoinerySpec.view.drafts`), print on every schedule that shows it, are kept in the project file and stay in place when a model update moves the window. The engine reads, writes and turns them into strokes and text (`joineryViewDraftPrims`).
