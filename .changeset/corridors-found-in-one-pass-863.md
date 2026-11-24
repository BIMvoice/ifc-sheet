---
"@ifc-lite/create": patch
---

`corridorsInStore` reads the model's property relations once to find the element assemblies that carry the corridor property set, then reads only those whole. It read every relation once per assembly, so a structural model with many assemblies took seconds on each plan that looked for corridors (#863). The result is unchanged.
