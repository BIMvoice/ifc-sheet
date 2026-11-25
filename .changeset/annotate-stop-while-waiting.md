---
"@bimvoice/ifcsheet": minor
---

`annotateViews` hands the run's `signal` to `drawingOf`, and ends the run as soon as it is stopped: while a view's drawing is awaited, or between two commands. `SetSummary` gains `total`, the number of views the run set out to annotate, so a stopped run can say how far it got. A `DrawingResult` with `timedOutMs` skips the view with `wall.annotateWait.timedOut` (the seconds waited) instead of the bare error.
