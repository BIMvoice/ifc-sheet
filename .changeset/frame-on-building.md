---
"@bimvoice/ifcsheet": minor
---

Views are framed on the building, not on small elements far from it (a survey point, an origin or geo-reference cube). One such proxy, 108 m from the Skolebygg sample, made every plan, elevation and section "not fit". The rule is relative to the building (small: at most a tenth of its span; far: more than one span beyond it; a far group of small parts that together are larger than that stays) and the elements stay in the model, the schedules and the quantities. `openModel` reports them as `farElements`, the readiness names each with its distance, and "include far-away elements in framing" (a project setting; `--include-far-elements` on the command line) frames on everything again.
