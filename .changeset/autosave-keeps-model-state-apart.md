---
"@ifc-lite/viewer": patch
---

The autosave of a project cannot be filled by the model state. The state of a large model takes megabytes, and the browser's local storage holds about five for the whole site; the autosave now keeps the drawings there and the model state in the browser's database, and puts it back when the project opens. Only the newest issue keeps the state of the model it was issued against.
