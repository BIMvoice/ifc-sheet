---
"@ifc-lite/viewer": patch
---

The model state a project keeps for WHATCHANGED is small. It was a pretty-printed list of every element with a hash for each of its property sets, about 157 KB for the FZK house; it is now one compact line per project of about 130 bytes an element. A change in a property set now reads "properties changed", not which set.
