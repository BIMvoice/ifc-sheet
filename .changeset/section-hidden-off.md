---
'@bimvoice/ifcsheet': minor
---

A section, an elevation and an axonometric draw no hidden (dashed) lines unless the view sets `showHidden: true`; plans keep theirs. `viewShowsHidden` now returns `view.showHidden ?? view.kind === 'plan'`.
