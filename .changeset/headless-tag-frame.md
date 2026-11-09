---
"@bimvoice/ifcsheet": minor
---

The headless annotation measures and centres a tag in the frame the drawing's cut axis gives (a cut on y runs up = -1, a side cut is mirrored, right = -1), as the app does, so a multi-line room tag's box sits where its text is drawn. `annotationFrameOf` is now exported by the engine and the app calls it.
