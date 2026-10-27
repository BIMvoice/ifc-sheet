/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The command registry (#144) changed how `run` finds its commands, not what
 * the command line does. Two fixtures were captured from `main` before the
 * move: the help text of its seven commands (with `--standard`, as #376 wrote it), and the exit code and both
 * streams of 61 command lines that need no IFC file (#376 added five lines with `--standard`; `rooms --project` changed one line and added two, #388).
 * The help text inside them is a placeholder, so adding a command never edits
 * the fixtures.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { run } from './cli.js';
import { CLI_COMMANDS } from './cli-commands/index.js';
import { composeUsage } from './cli-usage.js';

/** Command lines that need no IFC file: every answer comes from the argument check (usage, errors, refusals) or from a file that is not there. */
const ARGV_CASES: readonly (readonly string[])[] = [
  [], ['--help'], ['-h'], ['--version'], ['-v'], ['--bogus'], ['frobnicate'], ['frobnicate', 'm.ifc'],
  ['build'], ['build', 'm.ifc'], ['build', 'm.ifc', '--out', '/nonexistent-dir-ifcsheet/a.pdf'], ['build', 'm.ifc', '--csv'], ['build', 'm.ifc', '--detail', '--out', 'a.pdf'],
  ['build', 'm.ifc', '--locale', 'ro', '--out', 'a.pdf'], ['build', 'm.ifc', '--json', '--out', 'a.pdf'], ['build', 'm.ifc', '--schedule', 's', '--out', 'a.pdf'], ['build', 'a.ifc', 'b.ifc', '--out', 'a.pdf'],
  ['check'], ['check', 'm.ifc'], ['check', 'm.ifc', '--json'], ['check', 'm.ifc', '--out', 'a.pdf'], ['check', 'm.ifc', '--csv'], ['check', 'm.ifc', '--project', 'p.json'], ['check', 'a.ifc', 'b.ifc'],
  ['materials'], ['materials', 'm.ifc'], ['materials', 'm.ifc', '--out', 'a.pdf'], ['materials', 'm.ifc', '--csv'], ['materials', 'a.ifc', 'b.ifc'], ['materials', 'm.ifc', '--json', '--project', 'p.json'],
  ['boq'], ['boq', 'm.ifc'], ['boq', 'm.ifc', '--project', 'p.json'], ['boq', 'm.ifc', '--project', 'p.json', '--csv', '--json'], ['boq', 'm.ifc', '--project', 'p.json', '--out', 'a.pdf'], ['boq', 'm.ifc', '--project', 'p.json', '--schedule', 's'],
  ['boq', 'm.ifc', '--project', 'p.json', '--detail', '--locale', 'ro'], ['boq', 'm.ifc', '--project', 'p.json', '--system', 'x'], ['boq', 'm.ifc', '--project', 'p.json', '--handover', 'h.zip'],
  ['rooms'], ['rooms', 'm.ifc'], ['rooms', 'm.ifc', '--project', 'p.json'], ['rooms', 'm.ifc', '--project', 'p.json', '--csv', '--json'], ['rooms', '--project', 'p.json'], ['rooms', 'm.ifc', '--csv', '--json'], ['rooms', 'm.ifc', '--detail'], ['rooms', 'm.ifc', '--system', 'x'], ['rooms', 'm.ifc', '--locale', 'ro', '--csv'], ['rooms', 'a.ifc', 'b.ifc'],
  ['list'], ['list', 'm.ifc'], ['list', 'm.ifc', '--project', 'p.json'], ['list', 'm.ifc', '--project', 'p.json', '--schedule', 's', '--csv'], ['list', 'm.ifc', '--project', 'p.json', '--csv', '--json'], ['list', 'm.ifc', '--project', 'p.json', '--detail'], ['list', 'm.ifc', '--project', 'p.json', '--system', 'x'],
  ['classify'], ['classify', 'm.ifc'], ['classify', 'm.ifc', '--project', 'p.json'], ['classify', 'm.ifc', '--project', 'p.json', '--system', 'x', '--csv'], ['classify', 'm.ifc', '--project', 'p.json', '--locale', 'ro'], ['classify', 'm.ifc', '--project', 'p.json', '--schedule', 's'], ['classify', 'm.ifc', '--project', 'p.json', '--csv', '--json'],
  // Added with #376 (`build --standard`); the 61 lines above are unchanged from main before it.
  ['build', '--standard', 'ro'], ['build', 'm.ifc', '--out', 'a.pdf', '--standard', 'ro'], ['check', 'm.ifc', '--standard', 'ro'], ['list', 'm.ifc', '--standard', 'ro'], ['frobnicate', 'm.ifc', '--standard', 'ro'],
  // Added with #364 (`build --pac`, `--intervention`); the 66 lines above are unchanged, except that the three that name the refused build options read "--locale only with --pac".
  ['build', '--pac'], ['build', 'm.ifc', '--pac', '--out', 'a.pdf'], ['build', 'm.ifc', '--pac', '--locale', 'ro', '--out', 'a.pdf'], ['build', 'm.ifc', '--pac', '--template', 't.bvset', '--out', 'a.pdf'], ['build', 'm.ifc', '--out', 'a.pdf', '--intervention', 'new'],
  ['build', 'm.ifc', '--pac', '--intervention', 'bogus', '--out', 'a.pdf'], ['build', 'm.ifc', '--pac', '--intervention', 'interior', '--out', 'a.pdf'], ['check', 'm.ifc', '--pac'], ['frobnicate', 'm.ifc', '--pac'],
  // Added with `--pac-mode`; the 75 lines above are unchanged.
  ['build', 'm.ifc', '--pac', '--pac-mode', 'rural', '--out', 'a.pdf'], ['build', 'm.ifc', '--pac', '--pac-mode', 'bogus', '--out', 'a.pdf'], ['build', 'm.ifc', '--pac-mode', 'rural', '--out', 'a.pdf'], ['check', 'm.ifc', '--pac-mode', 'rural'],
];

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const LEGACY = ['build', 'check', 'materials', 'boq', 'rooms', 'list', 'classify'];

describe('the ifcsheet command registry', () => {
  it('composes the help text of the seven commands of main, byte for byte', () => {
    const legacy = CLI_COMMANDS.filter((c) => LEGACY.includes(c.name));
    expect(legacy.map((c) => c.name).sort()).toEqual([...LEGACY].sort());
    expect(composeUsage(legacy)).toBe(fixture('cli-usage.main.txt'));
  });

  it('answers every command line as main did: exit code, stdout and stderr', async () => {
    const golden = JSON.parse(fixture('cli-argv.main.json')) as { argv: string[]; code: number; stdout: string; stderr: string }[];
    expect(golden.map((g) => g.argv)).toEqual(ARGV_CASES);
    const usage = composeUsage(CLI_COMMANDS);
    const actual: unknown[] = [];
    for (const argv of ARGV_CASES) {
      let stdout = '';
      let stderr = '';
      const code = await run(argv, { stdout: (t) => { stdout += t; }, stderr: (t) => { stderr += t; } });
      actual.push({ argv, code, stdout: stdout.split(usage).join('<USAGE>'), stderr: stderr.split(usage).join('<USAGE>') });
    }
    expect(actual).toEqual(golden);
  });

  it('lists the commands once, sorted by name, with unique ranks and a usage line that names the command', () => {
    const names = CLI_COMMANDS.map((c) => c.name);
    expect(names).toEqual([...names].sort());
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(CLI_COMMANDS.map((c) => c.usageRank)).size).toBe(names.length);
    expect(new Set(CLI_COMMANDS.map((c) => c.helpRank)).size).toBe(names.length);
    for (const c of CLI_COMMANDS) {
      expect(c.usage.startsWith(`  ifcsheet ${c.name} `)).toBe(true);
      expect(c.help.startsWith(`  ${c.name}  `)).toBe(true);
    }
  });
});
