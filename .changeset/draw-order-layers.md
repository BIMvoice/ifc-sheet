---
"@bimvoice/ifcsheet": minor
---

What draws on top among the drafted elements is now one function, `inDrawOrder` (#682): a layer can carry an `order` (a higher number draws above a lower one; absent is 0, so a project saved before it reads as it did), and within a layer the drafts stack as they are stored. `movedInOrder` moves some drafts to the front or the back of the list. The headless sheet draws a view's drafts through it, as the app's screen, sheet, PDF and DXF do.
