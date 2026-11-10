---
"@ifc-lite/drawing-2d": patch
---

The DXF TEXT escape (`\U+XXXX` for characters windows-1252 cannot hold) moves out of the DXF writer into its own module and is exported as `escapeDxfText`, so the app and the CLI share one implementation. Behaviour is unchanged.
