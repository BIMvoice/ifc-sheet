---
"@bimvoice/ifcsheet": minor
---

A leader may end in a dot or in nothing (#842), an arrow staying the default: a text's leader and a leader carry `leaderEnd` (`'dot'` or `'none'`; absent is the arrow, which is never stored), a project file keeps it, a label type's `label.leaderEnd` goes on the labels it places, and the sheet the PDF, SVG and DXF are written from fills the dot. `leaderHeadLoops`, `leaderHeadSize`, `withLeaderEnd`, `LEADER_ENDS` and `asLeaderEnd` are the one way the app and the engine draw a leader's head.
