/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The `ifcsheet` command line (#164): `ifcsheet build model.ifc --out set.pdf`
 * writes the starting drawing set of a model as one PDF and, with `--dxf`, a
 * DXF per sheet. `run` takes the arguments and returns the exit code instead
 * of exiting, so tests drive it in-process; `bin.ts` is the entry point.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { describeTemplateNote, generateDefaultSet, parseSetTemplate, type SetTemplate, type TemplateNoteKey } from './index.js';
import { dxfName } from './sheet-file-name.js';
import { buildHandoverZip, type HandoverPart } from './handover.js';
import { exportDxf, exportPdf, openModel, readProjectFile, readinessWithProject, sheetGraphics, type ProjectFacts } from './headless.js';
import { describeReadiness } from './readiness.js';
import { materialsCommand } from './cli-materials.js';
import { boq } from './cli-boq.js';
import { classify } from './cli-classify.js';
import { rooms } from './cli-rooms.js';
import { list, listSchedulesOn, listTableText } from './cli-list.js';
import { PAC_DEFAULT_LOCALE, pacPages, pacTemplateFor } from './cli-pac.js';

/** Where `run` writes its messages; defaults to the process streams. */
export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const processIo: CliIo = {
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
};

/** Exit codes: 0 done, 1 the work failed, 2 the command line is wrong. */
export const EXIT = { ok: 0, failed: 1, usage: 2 } as const;

const USAGE = `ifcsheet: drawing sets from IFC models

Usage:
  ifcsheet build <model.ifc> [--out <set.pdf>] [--dxf <dir>] [--handover <package.zip>] [--pattern <file names>] [--name <project name>] [--template <office.bvset> | --pac [--locale <ro|en>]] [--project <file>] [--include-far-elements]
  ifcsheet check <model.ifc> [--project <file>] [--json] [--include-far-elements]
  ifcsheet materials <model.ifc> [--project <file>] [--json]
  ifcsheet boq <model.ifc> --project <file> [--csv | --json] [--detail] [--locale <ro|en>]
  ifcsheet rooms <model.ifc> [--csv | --json] [--locale <ro|en>]
  ifcsheet list <model.ifc> --project <file> [--schedule <id>] [--csv | --json] [--locale <ro|en>]
  ifcsheet classify <model.ifc> --project <file> [--system <name>] [--csv | --json]

Commands:
  build   Lay out the starting drawing set of the model (a plan per level, the
          elevations, the proposed sections) and write it as one PDF, a page per
          sheet. With --dxf, also write one DXF per sheet into that directory.
          With --template, the sheets are made by the rules of a set template (a .bvset file
          saved from a project) instead: the same plan-per-storey, elevation and section
          rules the app applies, a rule the model cannot meet skipped and said.
          With --pac, the sheets are the permit project's (PAC, Legea 169/2026 Anexa 2: plans, facades, sections) and the
          one PDF opens with the opis page: the contents Anexa 2 lists, each with its point and whether the file holds it.
  check   The model-readiness report: what the IFC lacks (storeys, rooms, materials,
          quantity sets, unique GlobalIds) and which drawings and schedules are
          weaker for it. Plain English, or JSON with --json. With --project, also what the
          saved project's split schedules get wrong: an element listed in more than one
          part, or in no part.
  materials  The model's materials and how each draws where a view cuts it: hatch, scale,
          fill, hatch pen, membrane. With --project, the project's own table applies (what the
          app's Materials section edits); a material it has no row for is guessed from its name.
  boq     The bill of quantities (antemasuratoare): the articles of the project file, each with its total
          in its own unit, from the quantities the model declares (never zero for a missing one: the elements
          that lack it are named). Text, CSV with --csv, JSON with --json; --detail adds a row per type.
  list    A schedule built from the Lists engine (the app's Schedule from the model): the elements of the project's list definition by
          class, storey and property, its columns, grouped and summed, with the total. The rows and totals are the Lists panel's, the CSV
          is the app's file. --schedule names which one (its id or name; the only one when the project has one). Text, CSV or JSON.
  classify  The model's types with their classification code: the model's own IfcClassificationReference first, else the
          project's mapping (a type, a material or a class to the office's code). --system picks one of the project's
          systems (default: the first). Text, CSV with --csv, JSON with --json.
  rooms   The room and area schedule: every room (IfcSpace) by level with its number, name and
          area, a total per level and for the building (the urban indicators' Au). An area is the
          model's NetFloorArea (else GrossFloorArea), else the footprint of the room's geometry;
          the last lines say which. Text, or CSV with --csv, or JSON with --json.

Options:
  --out <file>     The PDF to write (required for build unless --handover is given).
  --dxf <dir>      Also write a DXF per sheet into this directory (created if absent).
  --handover <zip> Also write the handover package: the PDF, a DXF per sheet and the IFC as given, in one ZIP. The app's
                   package adds the schedules and the drawing list as XLSX; DWG follows with #52.
  --pattern <p>    How --handover names its files, with {project} {number} {sheet} {revision} {date} {issue}
                   (default "{number} {sheet}": A-101 Ground floor.dxf). Plain ASCII, no path separators.
  --template <file> A set template (.bvset) for build: which sheets, which views on them, at which scale.
  --pac            Build the submission PDF of the permit project (PAC): the opis page, then the PAC sheets. Not with --template.
  --name <name>    The project name for the title blocks (default: the model's).
  --project <file> A saved project (.ifclite-project.json): for check, its schedules, joinery catalogue and symbol mapping; for build, its list
                   schedules are printed after the build (the PDF has no schedule sheet; the app draws those).
  --schedule <id>  The list schedule that list runs: its id or name.
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

async function packageVersion(): Promise<string> {
  const text = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  return (JSON.parse(text) as { version: string }).version;
}

interface BuildArgs {
  model: string;
  out?: string;
  handover?: string;
  pattern?: string;
  dxf?: string;
  name?: string;
  template?: string;
  /** The permit project (PAC): its set template, and the opis page first in the PDF. */
  pac?: boolean;
  locale?: string;
  /** A saved project: its list schedules are printed after the build. */
  project?: string;
  includeFarElements?: boolean;
}

async function build(args: BuildArgs, io: CliIo): Promise<number> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(args.model));
  } catch (error) {
    io.stderr(`ifcsheet: cannot read ${args.model}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
    return EXIT.failed;
  }
  let setTemplate: SetTemplate | undefined = args.pac ? pacTemplateFor(args.locale ?? PAC_DEFAULT_LOCALE) : undefined;
  if (args.template !== undefined) {
    try {
      setTemplate = parseSetTemplate(await readFile(args.template, 'utf8'));
    } catch (error) {
      io.stderr(`ifcsheet: ${args.template} cannot be used as a set template: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  const model = await openModel(bytes, { includeFarElements: args.includeFarElements });
  const set = generateDefaultSet(model, { ...(args.name ? { name: args.name } : {}), ...(setTemplate ? { setTemplate } : {}) });
  if (!set) {
    io.stderr(`ifcsheet: ${args.model} has no geometry to lay a drawing set out on.\n`);
    return EXIT.failed;
  }
  const sheets = await sheetGraphics(set, model);
  const pdf = await exportPdf(args.pac ? pacPages(sheets, set, args.locale ?? PAC_DEFAULT_LOCALE) : sheets, { title: set.document.name });
  // What the template's rules met in this model (the other notes are the app's to show).
  for (const note of set.notes) if (note.key.startsWith('setTemplate.')) io.stdout(`${describeTemplateNote({ key: note.key as TemplateNoteKey, params: note.params })}\n`);
  if (args.out) {
    await mkdir(resolve(args.out, '..'), { recursive: true });
    await writeFile(args.out, pdf);
    io.stdout(`${args.out}: ${sheets.length} sheet${sheets.length === 1 ? '' : 's'} (${set.document.name})\n`);
  }
  if (args.handover) {
    // The same builder as the app's package (`handover.ts`): the engine has no schedules or register to add.
    const tokens = { project: set.document.name, date: new Date().toISOString().slice(0, 10) };
    const parts: HandoverPart[] = [
      { kind: 'pdf', extension: 'pdf', tokens: { ...tokens, sheet: set.document.name }, data: pdf },
      ...sheets.map((sheet) => ({ kind: 'dxf' as const, extension: 'dxf', tokens: { ...tokens, number: sheet.number, sheet: sheet.name }, data: new TextEncoder().encode(exportDxf(sheet)) })),
      { kind: 'ifc', extension: 'ifc', tokens: { ...tokens, sheet: basename(args.model).replace(/\.ifc$/i, '') }, data: bytes },
    ];
    const built = buildHandoverZip(args.pattern, parts);
    await mkdir(resolve(args.handover, '..'), { recursive: true });
    await writeFile(args.handover, built.zip);
    io.stdout(`${args.handover}: ${built.files.length} files\n`);
    for (const f of built.files) io.stdout(`  ${f.name}\n`);
  }
  if (args.dxf) {
    await mkdir(args.dxf, { recursive: true });
    const used = new Set<string>();
    for (const sheet of sheets) {
      const file = join(args.dxf, dxfName(sheet.number, used));
      await writeFile(file, exportDxf(sheet));
      io.stdout(`${file}\n`);
    }
  }
  if (args.project !== undefined) {
    // The starting set has no schedule sheet (the app composes those): the project's list schedules are printed as text, the table `ifcsheet list` gives.
    let projectText: string;
    try { projectText = await readFile(args.project, 'utf8'); } catch (error) {
      io.stderr(`ifcsheet: cannot read ${args.project}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
      return EXIT.failed;
    }
    try {
      const project = readProjectFile(projectText);
      for (const { table } of listSchedulesOn(model, project.schedules, 'en', basename(args.model), project.classificationMappings)) io.stdout(`\n${listTableText(table)}`);
    } catch (error) {
      io.stderr(`ifcsheet: ${args.project} cannot be used as a project: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  return EXIT.ok;
}

/** `ifcsheet check`: exit 0 when the model lacks nothing the drawings read, 1 when something would weaken them. */
async function check(file: string, json: boolean, projectFile: string | undefined, includeFarElements: boolean, io: CliIo): Promise<number> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(file));
  } catch (error) {
    io.stderr(`ifcsheet: cannot read ${file}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
    return EXIT.failed;
  }
  let project: ProjectFacts | undefined;
  if (projectFile !== undefined) {
    let projectText: string;
    try {
      projectText = await readFile(projectFile, 'utf8');
    } catch (error) {
      io.stderr(`ifcsheet: cannot read ${projectFile}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
      return EXIT.failed;
    }
    try {
      project = readProjectFile(projectText);
    } catch (error) {
      io.stderr(`ifcsheet: ${projectFile} cannot be used as a project: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  // The counts read the entity tables; the elements the views are framed without are measured on the meshes, so the geometry is read too (a model with none is still reported on). The project's own setting counts as the flag.
  const include = includeFarElements || project?.includeFarElements === true;
  let opened;
  try {
    opened = await openModel(bytes, { includeFarElements: include });
  } catch (error) {
    io.stderr(`ifcsheet: the geometry could not be read (${(error as Error).message}); the far-away elements are not checked\n`);
    opened = await openModel(bytes, { geometry: false });
  }
  const findings = readinessWithProject(opened, project).map((f) => ({ kind: f.kind, ...describeReadiness(f), params: f.params }));
  if (json) {
    io.stdout(`${JSON.stringify({ file, ...(projectFile !== undefined ? { project: projectFile } : {}), ready: findings.length === 0, findings }, null, 2)}\n`);
  } else if (findings.length === 0) {
    io.stdout(`${file}: the model has what the drawing set reads: storeys, rooms, materials, quantities.\n`);
  } else {
    io.stdout(`${file}: ${findings.length} thing${findings.length === 1 ? '' : 's'} the model lacks\n`);
    for (const f of findings) io.stdout(`\n- ${f.missing}\n  ${f.effect}\n`);
  }
  return findings.length === 0 ? EXIT.ok : EXIT.failed;
}

/** Runs the command line (without `node` and the script) and returns the exit code. */
export async function run(argv: readonly string[], io: CliIo = processIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        out: { type: 'string' },
        dxf: { type: 'string' },
        handover: { type: 'string' },
        pattern: { type: 'string' },
        name: { type: 'string' },
        template: { type: 'string' },
        project: { type: 'string' },
        schedule: { type: 'string' },
        system: { type: 'string' },
        json: { type: 'boolean' },
        csv: { type: 'boolean' },
        detail: { type: 'boolean' },
        locale: { type: 'string' },
        'include-far-elements': { type: 'boolean' },
        pac: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    io.stderr(`ifcsheet: ${(error as Error).message}\n\n${USAGE}`);
    return EXIT.usage;
  }
  const { values, positionals } = parsed;
  if (values.help || (positionals.length === 0 && !values.version)) {
    (values.help ? io.stdout : io.stderr)(USAGE);
    return values.help ? EXIT.ok : EXIT.usage;
  }
  if (values.version) {
    io.stdout(`${await packageVersion()}\n`);
    return EXIT.ok;
  }
  const [command, ...rest] = positionals;
  if (command !== 'build' && command !== 'check' && command !== 'boq' && command !== 'rooms' && command !== 'list' && command !== 'classify' && command !== 'materials') {
    io.stderr(`ifcsheet: unknown command "${command}"\n\n${USAGE}`);
    return EXIT.usage;
  }
  if (values.pac && command !== 'build') {
    io.stderr(`ifcsheet ${command} has no --pac; it is an option of build.\n`);
    return EXIT.usage;
  }
  if (command === 'boq') {
    if (rest.length !== 1 || !values.project || values.out || values.dxf || values.name || values.schedule !== undefined || values['include-far-elements'] || (values.csv && values.json)) {
      io.stderr('ifcsheet boq takes one model, --project, --csv or --json, --detail and --locale: ifcsheet boq <model.ifc> --project <file> [--csv | --json] [--detail] [--locale <ro|en>]\n');
      return EXIT.usage;
    }
    try {
      return await boq({ model: rest[0], project: values.project, csv: values.csv === true, json: values.json === true, detail: values.detail === true, locale: values.locale ?? 'en' }, io);
    } catch (error) {
      io.stderr(`ifcsheet: boq of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  if (command === 'list') {
    if (rest.length !== 1 || !values.project || values.out || values.dxf || values.name || values.handover || values.pattern || values.template !== undefined || values.detail || values.system !== undefined || values['include-far-elements'] || (values.csv && values.json)) {
      io.stderr('ifcsheet list takes one model, --project, --schedule, --csv or --json and --locale: ifcsheet list <model.ifc> --project <file> [--schedule <id>] [--csv | --json] [--locale <ro|en>]\n');
      return EXIT.usage;
    }
    try {
      return await list({ model: rest[0], project: values.project, ...(values.schedule !== undefined ? { schedule: values.schedule } : {}), csv: values.csv === true, json: values.json === true, locale: values.locale ?? 'en' }, io);
    } catch (error) {
      io.stderr(`ifcsheet: list of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  if (command === 'classify') {
    if (rest.length !== 1 || !values.project || values.out || values.dxf || values.name || values['include-far-elements'] || values.detail || values.locale !== undefined || values.handover || values.pattern || values.template !== undefined || values.schedule !== undefined || (values.csv && values.json)) {
      io.stderr('ifcsheet classify takes one model, --project, --system and --csv or --json only: ifcsheet classify <model.ifc> --project <file> [--system <name>] [--csv | --json]\n');
      return EXIT.usage;
    }
    try {
      return await classify({ model: rest[0], project: values.project, ...(values.system !== undefined ? { system: values.system } : {}), csv: values.csv === true, json: values.json === true }, io);
    } catch (error) {
      io.stderr(`ifcsheet: classify of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  if (command === 'rooms') {
    if (rest.length !== 1 || values.out || values.dxf || values.name || values.project || values.handover || values.pattern || values.template !== undefined || values.detail || values.schedule !== undefined || values['include-far-elements'] || (values.csv && values.json)) {
      io.stderr('ifcsheet rooms takes one model and --csv or --json and --locale only: ifcsheet rooms <model.ifc> [--csv | --json] [--locale <ro|en>]\n');
      return EXIT.usage;
    }
    try {
      return await rooms({ model: rest[0], csv: values.csv === true, json: values.json === true, locale: values.locale ?? 'en' }, io);
    } catch (error) {
      io.stderr(`ifcsheet: rooms of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  if (command === 'check') {
    if (rest.length !== 1 || values.out || values.dxf || values.name || values.csv || values.detail || values.locale !== undefined || values.handover || values.pattern || values.template !== undefined || values.schedule !== undefined) {
      io.stderr('ifcsheet check takes one model, --project, --json and --include-far-elements only: ifcsheet check <model.ifc> [--project <file>] [--json] [--include-far-elements]\n');
      return EXIT.usage;
    }
    try {
      return await check(rest[0], values.json === true, values.project, values['include-far-elements'] === true, io);
    } catch (error) {
      io.stderr(`ifcsheet: check of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
      return EXIT.failed;
    }
  }
  if (command === 'materials') {
    return await materialsCommand({ rest, json: values.json === true, project: values.project, foreignOption: Boolean(values.out || values.dxf || values.name || values['include-far-elements']) }, io);
  }
  if (values.csv || values.detail || (values.locale !== undefined && !values.pac)) {
    io.stderr('ifcsheet build has no --csv or --detail, and --locale only with --pac; they are options of boq and rooms.\n');
    return EXIT.usage;
  }
  if (values.json) {
    io.stderr('ifcsheet build has no --json; it is an option of check.\n');
    return EXIT.usage;
  }
  if (values.schedule !== undefined) {
    io.stderr('ifcsheet build has no --schedule; it is an option of list.\n');
    return EXIT.usage;
  }
  if (values.pac && values.template !== undefined) {
    io.stderr('ifcsheet build --pac sets the sheets itself; it cannot be combined with --template.\n');
    return EXIT.usage;
  }
  if (rest.length !== 1 || (!values.out && !values.handover)) {
    io.stderr(`ifcsheet build needs one model and --out or --handover: ifcsheet build <model.ifc> --out <set.pdf>\n`);
    return EXIT.usage;
  }
  try {
    return await build({ model: rest[0], out: values.out, handover: values.handover, pattern: values.pattern, dxf: values.dxf, name: values.name, template: values.template, project: values.project, includeFarElements: values['include-far-elements'] === true, pac: values.pac === true, locale: values.locale }, io);
  } catch (error) {
    io.stderr(`ifcsheet: build of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
    return EXIT.failed;
  }
}
