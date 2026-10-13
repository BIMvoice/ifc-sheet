---
"@ifc-lite/viewer": minor
---

Tag everything now marks doors and windows the way a drawing set does: a small circle with a short code (the model's own mark when it is short, else the code of the kind, W1, W2, D1), a window on the outside of its wall, a door on the room side beside its jamb, with no leader. Elements of one kind share a code, the same on every plan, and the door and window schedule shows the same code in rows it groups itself. Room names are written in capitals with the area below, and a room too small for its label gets the label beside it with a leader. Labels and the figures of Dimension the whole plan keep clear of what the plan draws over its cut: door swings, window glazing, roof lines, and, for room names, the stair and anything else in the room. A dimension no longer blocks the ground between its extension lines for labels, only its lines and its figure. A label template can write a text in capitals with `{Name:upper}`.
