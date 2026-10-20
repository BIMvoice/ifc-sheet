---
"@ifc-lite/viewer": minor
---

Work lost to a crash is offered back. When the same model is opened again after a session that did not close (no page unload), and its autosave holds something the last project file saved or opened does not, that autosave is kept aside and the intro screen and the project drawer show its time and model name with Restore and Discard. It stays on offer, across sessions too, until one of the two is pressed; a session that closed normally is put back as before. Project files now carry a version, older files are brought up to date by migrations on open, and a file from a newer IfcSheet is refused with a message instead of being half-loaded.
