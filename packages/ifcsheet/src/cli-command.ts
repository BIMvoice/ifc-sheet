/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a command of the `ifcsheet` command line is (#144). Each command lives
 * in its own file under `cli-commands/` and is listed once in
 * `cli-commands/index.ts`; `run` in `cli.ts` and the help text are built from
 * that list, so a new command does not edit either.
 */

/** Where a command writes its messages; defaults to the process streams. */
export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** Exit codes: 0 done, 1 the work failed, 2 the command line is wrong. */
export const EXIT = { ok: 0, failed: 1, usage: 2 } as const;

/** The options `run` parses, as the command receives them. */
export interface CliValues {
  out?: string;
  dxf?: string;
  handover?: string;
  pattern?: string;
  name?: string;
  template?: string;
  project?: string;
  schedule?: string;
  system?: string;
  json?: boolean;
  csv?: boolean;
  detail?: boolean;
  locale?: string;
  'include-far-elements'?: boolean;
  help?: boolean;
  version?: boolean;
}

export interface CliCommand {
  name: string;
  /** Where its line sits under `Usage:`; ranks are unique, in steps of 100 so a new command never renumbers another. */
  usageRank: number;
  /** Its line under `Usage:`, with the two leading spaces. */
  usage: string;
  /** Where its paragraph sits under `Commands:`; unique, in steps of 100. */
  helpRank: number;
  /** Its paragraph under `Commands:`, with the leading spaces of every line. */
  help: string;
  /** Checks the arguments, runs the command and returns the exit code. `rest` are the positionals after the command name. */
  run: (rest: readonly string[], values: CliValues, io: CliIo) => Promise<number>;
}
