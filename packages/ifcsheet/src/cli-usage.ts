/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The help text of `ifcsheet`, assembled from the registered commands (`cli-commands/index.ts`). */

import type { CliCommand } from './cli-command.js';

const HEAD = `ifcsheet: drawing sets from IFC models`;

const OPTIONS = `Options:
  --out <file>     The PDF to write (required for build unless --handover is given).
  --dxf <dir>      Also write a DXF per sheet into this directory (created if absent).
  --handover <zip> Also write the handover package: the PDF, a DXF per sheet and the IFC as given, in one ZIP. The app's
                   package adds the schedules and the drawing list as XLSX; DWG follows with #52.
  --pattern <p>    How --handover names its files, with {project} {number} {sheet} {revision} {date} {issue}
                   (default "{number} {sheet}": A-101 Ground floor.dxf). Plain ASCII, no path separators.
  --template <file> A set template (.bvset) for build: which sheets, which views on them, at which scale.
  --standard <id>  A drawing standard for build: its pens and title block (known: ro, the Romanian pack of the app's "Install standard").
                   Wins over the project's own graphic standard and title block layout; without it a --project's are used.
  --name <name>    The project name for the title blocks (default: the model's).
  --project <file> A saved project (.ifclite-project.json): for check, its schedules, joinery catalogue and symbol mapping; for build, its list
                   schedules are printed after the build (the PDF has no schedule sheet; the app draws those).
  --schedule <id>  The list schedule that list runs: its id or name.
  --ids <name>     For check, also run a requirement set over the model and report what fails (known: byggesaksbim, the Norwegian
                   ByggesaksBIM requirements; a project that opts in has it run without the flag).
  --include-far-elements  Frame the views on everything the storeys contain, small elements far from the building too
                   (a survey point, an origin cube). By default they are left out of the framing only and named by check.
  --json           Print the check as JSON: { file, ready, findings: [{ kind, missing, effect, params }] } (with --project, also project).
  --csv            Print the rooms schedule or the list as CSV (plain numbers).
  --locale <l>     The language of the rooms schedule: ro writes "12,50" and the Romanian headings (default en).
  -h, --help       Show this help.
  -v, --version    Show the version.

Exit code 0 on success (for check: nothing would weaken the drawings), 1 when the work
failed (for check: something would weaken them, or the file cannot be read), 2 for a
wrong command line.
`;

/** The help text for `commands`: their usage lines by `usageRank`, their paragraphs by `helpRank`, then the shared options. */
export function composeUsage(commands: readonly CliCommand[]): string {
  const byUsage = [...commands].sort((a, b) => a.usageRank - b.usageRank);
  const byHelp = [...commands].sort((a, b) => a.helpRank - b.helpRank);
  return `${HEAD}\n\nUsage:\n${byUsage.map((c) => c.usage).join('\n')}\n\nCommands:\n${byHelp.map((c) => c.help).join('\n')}\n\n${OPTIONS}`;
}
