---
"@bimvoice/ifcsheet": minor
---

DIMALL no longer holds the app on a plan of two models (#829): a room's figure is tested only against the drawing lines and symbols near the place it is tried, a gap between walls reads only the columns and panes near it, and a room that offers more places than `MAX_TRIES` is left out and counted (`RoomPlan.outOfTries`). The dimensions drawn are the same.
