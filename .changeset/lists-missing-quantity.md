---
'@ifc-lite/lists': minor
---

A quantity that is missing (not declared and not measurable) is now reported as missing instead of 0: list summaries, groups and exports leave it out of sums and count it, a total over rows that all lack it is missing, and a declared 0 stays 0. New export `SumTally` and `MISSING_QUANTITY` for callers that format the result.
