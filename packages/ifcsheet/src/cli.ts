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
import { generateDefaultSet } from './index.js';
import { exportDxf, exportPdf, openModel, readProjectFile, readinessWithProject, sheetGraphics, type ProjectFacts } from './headless.js';
import { describeReadiness } from './readiness.js';
import { boq } from './cli-boq.js';

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
  ifcsheet build <model.ifc> --out <set.pdf> [--dxf <dir>] [--name <project name>] [--include-far-elements]
  ifcsheet check <model.ifc> [--project <file>] [--json] [--include-far-elements]
  ifcsheet boq <model.ifc> --project <file> [--csv | --json] [--detail] [--locale <ro|en>]

Commands:
  build   Lay out the starting drawing set of the model (a plan per level, the
          elevations, the proposed sections) and write it as one PDF, a page per
          sheet. With --dxf, also write one DXF per sheet into that directory.
  check   The model-readiness report: what the IFC lacks (storeys, rooms, materials,
          quantity sets, unique GlobalIds) and which drawings and schedules are
          weaker for it. Plain English, or JSON with --json. With --project, also what the
          saved project's split schedules get wrong: an element listed in more than one
          part, or in no part.
  boq     The bill of quantities (antemasuratoare): the articles of the project file, each with its total
          in its own unit, from the quantities the model declares (never zero for a missing one: the elements
          that lack it are named). Text, CSV with --csv, JSON with --json; --detail adds a row per type.

Options:
  --out <file>     The PDF to write (required for build).
  --dxf <dir>      Also write a DXF per sheet into this directory (created if absent).
  --name <name>    The project name for the title blocks (default: the model's).
  --project <file> A saved project (.ifclite-project.json) for check: its schedules, joinery catalogue and symbol mapping.
  --include-far-elements  Frame the views on everything the storeys contain, small elements far from the building too
                   (a survey point, an origin cube). By default they are left out of the framing only and named by check.
  --json           Print the check as JSON: { file, ready, findings: [{ kind, missing, effect, params }] } (with --project, also project).
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

/** A file name made of the sheet number (A-101), safe on every file system. */
const dxfName = (number: string, used: Set<string>): string => {
  const base = number.replace(/[^A-Za-z0-9._-]+/g, '_') || 'sheet';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}`;
  used.add(name.toLowerCase());
  return `${name}.dxf`;
};

interface BuildArgs {
  model: string;
  out: string;
  dxf?: string;
  name?: string;
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
  const model = await openModel(bytes, { includeFarElements: args.includeFarElements });
  const set = generateDefaultSet(model, args.name ? { name: args.name } : {});
  if (!set) {
    io.stderr(`ifcsheet: ${args.model} has no geometry to lay a drawing set out on.\n`);
    return EXIT.failed;
  }
  const sheets = await sheetGraphics(set, model);
  const pdf = await exportPdf(sheets, { title: set.document.name });
  await mkdir(resolve(args.out, '..'), { recursive: true });
  await writeFile(args.out, pdf);
  io.stdout(`${args.out}: ${sheets.length} sheet${sheets.length === 1 ? '' : 's'} (${set.document.name})\n`);
  if (args.dxf) {
    await mkdir(args.dxf, { recursive: true });
    const used = new Set<string>();
    for (const sheet of sheets) {
      const file = join(args.dxf, dxfName(sheet.number, used));
      await writeFile(file, exportDxf(sheet));
      io.stdout(`${file}\n`);
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
        name: { type: 'string' },
        project: { type: 'string' },
        json: { type: 'boolean' },
        csv: { type: 'boolean' },
        detail: { type: 'boolean' },
        locale: { type: 'string' },
        'include-far-elements': { type: 'boolean' },
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
  if (command !== 'build' && command !== 'check' && command !== 'boq') {
    io.stderr(`ifcsheet: unknown command "${command}"\n\n${USAGE}`);
    return EXIT.usage;
  }
  if (command === 'boq') {
    if (rest.length !== 1 || !values.project || values.out || values.dxf || values.name || values['include-far-elements'] || (values.csv && values.json)) {
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
  if (values.csv || values.detail || values.locale !== undefined) {
    io.stderr('ifcsheet: --csv, --detail and --locale are options of boq.\n');
    return EXIT.usage;
  }
  if (command === 'check') {
    if (rest.length !== 1 || values.out || values.dxf || values.name) {
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
  if (values.json) {
    io.stderr('ifcsheet build has no --json; it is an option of check.\n');
    return EXIT.usage;
  }
  if (values.project !== undefined) {
    io.stderr('ifcsheet build has no --project yet: nothing in the starting set reads the project. --project is an option of check.\n');
    return EXIT.usage;
  }
  if (rest.length !== 1 || !values.out) {
    io.stderr(`ifcsheet build needs one model and --out: ifcsheet build <model.ifc> --out <set.pdf>\n`);
    return EXIT.usage;
  }
  try {
    return await build({ model: rest[0], out: values.out, dxf: values.dxf, name: values.name, includeFarElements: values['include-far-elements'] === true }, io);
  } catch (error) {
    io.stderr(`ifcsheet: build of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
    return EXIT.failed;
  }
}
