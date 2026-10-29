/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The `ifcsheet` command line (#164): `ifcsheet build model.ifc --out set.pdf`
 * writes the starting drawing set of a model as one PDF and, with `--dxf`, a
 * DXF per sheet. `run` takes the arguments and returns the exit code instead
 * of exiting, so tests drive it in-process; `bin.ts` is the entry point.
 */

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { EXIT, type CliIo } from './cli-command.js';
import { CLI_COMMANDS } from './cli-commands/index.js';
import { composeUsage } from './cli-usage.js';
import { COMMAND_LINE_STANDARD_IDS } from './standard-pack.js';

export { EXIT, type CliIo } from './cli-command.js';

/** Where `run` writes by default: the process streams. */
const processIo: CliIo = {
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
};

const USAGE = composeUsage(CLI_COMMANDS);

async function packageVersion(): Promise<string> {
  const text = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  return (JSON.parse(text) as { version: string }).version;
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
        standard: { type: 'string' },
        ids: { type: 'string' },
        schedule: { type: 'string' },
        system: { type: 'string' },
        json: { type: 'boolean' },
        csv: { type: 'boolean' },
        detail: { type: 'boolean' },
        locale: { type: 'string' },
        'include-far-elements': { type: 'boolean' },
        pac: { type: 'boolean' },
        intervention: { type: 'string' },
        'pac-mode': { type: 'string' },
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
  const found = CLI_COMMANDS.find((c) => c.name === command);
  if (!found) {
    io.stderr(`ifcsheet: unknown command "${command}"\n\n${USAGE}`);
    return EXIT.usage;
  }
  if (values.pac && command !== 'build') {
    io.stderr(`ifcsheet ${command} has no --pac; it is an option of build.\n`);
    return EXIT.usage;
  }
  if (values.standard !== undefined && command !== 'build' && command !== 'materials') {
    io.stderr(`ifcsheet ${command} has no --standard; it is an option of build and materials (known: ${COMMAND_LINE_STANDARD_IDS.join(', ')}).\n`);
    return EXIT.usage;
  }
  if (values.ids !== undefined && command !== 'check') {
    io.stderr(`ifcsheet ${command} has no --ids; it is an option of check (known: byggesaksbim).\n`);
    return EXIT.usage;
  }
  return await found.run(rest, values, io);
}
