---
"@bimvoice/ifcsheet": minor
"@ifc-lite/create": minor
---

Draw on the door and window schedule views: double-click a type's front, plan or section in a joinery schedule to enter it as a drafting view, with the same tools, snaps, command line and undo as a plan. Lines, polylines, circles, arcs, text and hatches belong to the type (stored on the type in the view's own frame, `JoinerySpec.view.drafts`), print on every schedule that shows it, are kept in the project file and stay in place when a model update moves the window. The engine reads, writes and turns them into strokes and text (`joineryViewDraftPrims`).

Dimensions, leaders, levels, axes, symbols and the other commands whose shapes the type does not store are refused in a type's view with a message in the command line, instead of being drawn and lost on the next write-back. Saving a project package while a type's view is open no longer writes the view's working copy into the package.
