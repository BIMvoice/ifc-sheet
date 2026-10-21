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
import { exportDxf, exportPdf, openModel, sheetGraphics } from './headless.js';

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
  ifcsheet build <model.ifc> --out <set.pdf> [--dxf <dir>] [--name <project name>]
  ifcsheet check <model.ifc>        (not available yet, see issue #164)

Commands:
  build   Lay out the starting drawing set of the model (a plan per level, the
          elevations, the proposed sections) and write it as one PDF, a page per
          sheet. With --dxf, also write one DXF per sheet into that directory.
  check   The model-readiness report. Not available yet.

Options:
  --out <file>     The PDF to write (required for build).
  --dxf <dir>      Also write a DXF per sheet into this directory (created if absent).
  --name <name>    The project name for the title blocks (default: the model's).
  -h, --help       Show this help.
  -v, --version    Show the version.

Exit code 0 on success, 1 when the work failed, 2 for a wrong command line.
`;

const CHECK_UNAVAILABLE = 'ifcsheet check is not available yet: the readiness checks still live in the IfcSheet app. It is tracked in issue #164 (https://github.com/BIMvoice/ifcsheet/issues/164).\n';

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
}

async function build(args: BuildArgs, io: CliIo): Promise<number> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(args.model));
  } catch (error) {
    io.stderr(`ifcsheet: cannot read ${args.model}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file' : (error as Error).message}\n`);
    return EXIT.failed;
  }
  const model = await openModel(bytes);
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
  if (command === 'check') {
    io.stderr(CHECK_UNAVAILABLE);
    return EXIT.failed;
  }
  if (command !== 'build') {
    io.stderr(`ifcsheet: unknown command "${command}"\n\n${USAGE}`);
    return EXIT.usage;
  }
  if (rest.length !== 1 || !values.out) {
    io.stderr(`ifcsheet build needs one model and --out: ifcsheet build <model.ifc> --out <set.pdf>\n`);
    return EXIT.usage;
  }
  try {
    return await build({ model: rest[0], out: values.out, dxf: values.dxf, name: values.name }, io);
  } catch (error) {
    io.stderr(`ifcsheet: build of ${basename(rest[0])} failed: ${(error as Error).message}\n`);
    return EXIT.failed;
  }
}
