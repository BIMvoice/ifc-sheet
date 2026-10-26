# Lessons

One line per correction: the date, what was wrong, the rule from now on. Read this before every task (see "How we work" in [AGENTS.md](AGENTS.md)). Newest at the bottom. A lesson that applies to every agent also goes into AGENTS.md.

- 2026-10-20 · Agents waited for issues to be marked ready before starting. Rule: maintainers can label an issue `ready` themselves ("we don't need to wait for him to mark them with ready").
- 2026-10-20 · New work was started while finished PRs sat unmerged. Rule: get green, conflict-free PRs merged before starting new development.
- 2026-10-21 · Work spread across point clouds, glTF and other formats. Rule: "for now forget about other file formats, focus on IFC first." Format PRs stay parked as drafts.
- 2026-10-21 · Rule: the product name is IfcSheet; don't rename it.
- 2026-10-21 · Rule: "always prioritise PRs, then the rest of agents fixing issues." A failing or conflicting PR gets the next free agent before any new issue.
- 2026-10-21 · Rule: no AI attribution anywhere: no co-author trailers and no "generated with" lines in commits, PR bodies or comments.
- 2026-10-25 · A verification comment said the title block was "seeded with date only"; the other fields are read live from the model elsewhere. Rule: read the code path that actually renders a value before calling it missing; say "not verified" when unsure.
- 2026-10-25 · Two PRs hand-rolled a CSV escaper and three hit the 400-line limit on the catalogue barrel. Rule: these are in AGENTS.md "Working in parallel"; read it before writing code.
- 2026-10-26 · Agents were started early and polled for an hour waiting for another PR. Rule: start dependent work only after the PR it builds on has merged.
- 2026-10-26 · Rule: "cheap agents if they are enough": the cheapest model that does the job, verified on real examples before moving a task down.
