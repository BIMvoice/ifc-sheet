---
"@bimvoice/ifcsheet": patch
---

`ifcsheet` no longer ends in a V8 out-of-memory abort on a large model (#616). The command runs in a child process with a larger heap (three quarters of the computer's memory, up to 16 GB; a `NODE_OPTIONS` `--max-old-space-size` of your own wins), and if the child still runs out of memory the command says so in words (English or Romanian with `--locale ro`) and exits 1, instead of printing V8's FATAL ERROR and native stack and exiting 134. Standard output, the exit code and Ctrl-C pass through. The 177 MB Holter Tower model now builds.
