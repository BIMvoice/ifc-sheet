---
"@ifc-lite/viewer": minor
---

Level marks are parametric. A mark now remembers what it measures: on a plan the storey it reads, on a section or elevation the measured point. The number is derived from that reference, so moving the symbol never changes it, and moving the reference (its own grip) gives the new number. On a section the symbol slides along the horizontal and stays at the height it states, with a thin witness line back to the reference when they are apart. The new LEVELALIGN command (Annotations tab, "Align level marks") lines the selected marks up on one picked vertical line, each at its own height and with every reference untouched. Move, copy, mirror and rotate move the symbol and leave the reference where it measured; typing a number in the properties panel detaches a mark from its reference. Project files saved before this open unchanged, their marks keep their typed value.
