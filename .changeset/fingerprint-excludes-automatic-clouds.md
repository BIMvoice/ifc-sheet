---
"@ifc-lite/viewer": patch
---

A sheet whose only change since the last issue is the revision clouds What changed drew no longer reads as "edited" in the list of what changed; it reads as model changed. Clouds drawn by hand still count as edits. Issues now record which version of the sheet fingerprint they carry (`fingerprintVersion`, 2), and an issue made before that is compared by the old rule, so sheets unchanged since it do not turn up as edited.
