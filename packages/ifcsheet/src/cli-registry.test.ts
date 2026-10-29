/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The command registry (#144) changed how `run` finds its commands, not what
 * the command line does. Fixtures captured from `main` before the move pin
 * the help text of its seven commands and the exit code and both streams of
 * command lines that need no IFC file.
 *
 * The fixtures are laid out so that two PRs adding different things never
 * edit the same line:
 *   - `__fixtures__/cli-usage/`: the help text, one file per section: each of
 *     the seven commands' usage line (`<command>.usage.txt`) and paragraph
 *     (`<command>.help.txt`), the heading (`head.txt`) and the shared options
 *     (`options.txt`). A PR that changes `build`'s help and one that changes
 *     `check`'s edit different files.
 *   - `__fixtures__/cli-argv.main.json`: the command lines `ARGV_CASES` lists.
 *     Both are frozen: nothing is appended to either.
 *   - `__fixtures__/cli-argv/<name>.json`: every command line added since, one
 *     file each (`{ "argv": [...], "code", "stdout", "stderr" }`).
 * The help text inside the argv fixtures is a placeholder, so adding a command
 * never edits them.
 *
 * To add a command line: write `__fixtures__/cli-argv/<name>.json` holding just
 * `{ "argv": [...] }`, then fill in (or, after an intended change, refresh)
 * every expected answer and the help text with
 *   IFCSHEET_CLI_FIXTURE_UPDATE=1 pnpm --filter @bimvoice/ifcsheet exec vitest run src/cli-registry.test.ts
 * and review the diff.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { run } from './cli.js';
import { CLI_COMMANDS } from './cli-commands/index.js';
import { composeUsage } from './cli-usage.js';

/**
 * Command lines that need no IFC file: every answer comes from the argument check (usage, errors, refusals) or from a file
 * that is not there. FROZEN, with `cli-argv.main.json`: a new command line is a file in `__fixtures__/cli-argv/`.
 */
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
  // Added with #364 (`build --pac`, `--intervention`); the 66 lines above are unchanged.
  ['build', '--pac'], ['build', 'm.ifc', '--pac', '--out', 'a.pdf'], ['build', 'm.ifc', '--pac', '--locale', 'ro', '--out', 'a.pdf'], ['build', 'm.ifc', '--pac', '--template', 't.bvset', '--out', 'a.pdf'], ['build', 'm.ifc', '--out', 'a.pdf', '--intervention', 'new'],
  ['build', 'm.ifc', '--pac', '--intervention', 'bogus', '--out', 'a.pdf'], ['build', 'm.ifc', '--pac', '--intervention', 'interior', '--out', 'a.pdf'], ['check', 'm.ifc', '--pac'], ['frobnicate', 'm.ifc', '--pac'],
];

const FIXTURES = new URL('./__fixtures__/', import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');
const UPDATE = process.env.IFCSHEET_CLI_FIXTURE_UPDATE === '1';
const LEGACY = ['build', 'check', 'materials', 'boq', 'rooms', 'list', 'classify'];
/** The order of main's seven usage lines and of their paragraphs (their `usageRank` and `helpRank`); frozen with them. */
const USAGE_ORDER = ['build', 'check', 'materials', 'boq', 'rooms', 'list', 'classify'];
const HELP_ORDER = ['build', 'check', 'materials', 'boq', 'list', 'classify', 'rooms'];

interface Answer { argv: string[]; code: number; stdout: string; stderr: string }

/** What `run` answers to `argv`, with the help text replaced by `<USAGE>`. */
async function answer(argv: readonly string[]): Promise<Answer> {
  const usage = composeUsage(CLI_COMMANDS);
  let stdout = '';
  let stderr = '';
  const code = await run(argv, { stdout: (t) => { stdout += t; }, stderr: (t) => { stderr += t; } });
  return { argv: [...argv], code, stdout: stdout.split(usage).join('<USAGE>'), stderr: stderr.split(usage).join('<USAGE>') };
}

const json = (value: unknown) => `${JSON.stringify(value, null, 1)}\n`;
const ARGV_DIR = new URL('cli-argv/', FIXTURES);
/** The command lines added since the frozen list, one file each, by file name. */
const addedCases = () => readdirSync(ARGV_DIR).filter((f) => f.endsWith('.json')).sort();

describe('the ifcsheet command registry', () => {
  it('composes the help text of the seven commands of main, byte for byte', () => {
    const legacy = CLI_COMMANDS.filter((c) => LEGACY.includes(c.name));
    expect(legacy.map((c) => c.name).sort()).toEqual([...LEGACY].sort());
    const byName = new Map(legacy.map((c) => [c.name, c]));
    expect([...legacy].sort((a, b) => a.usageRank - b.usageRank).map((c) => c.name)).toEqual(USAGE_ORDER);
    expect([...legacy].sort((a, b) => a.helpRank - b.helpRank).map((c) => c.name)).toEqual(HELP_ORDER);
    const composed = composeUsage(legacy);
    const optionsAt = composed.lastIndexOf('\n\nOptions:') + 2;
    if (UPDATE) {
      writeFileSync(new URL('cli-usage/head.txt', FIXTURES), composed.slice(0, composed.indexOf('\n\nUsage:\n')));
      writeFileSync(new URL('cli-usage/options.txt', FIXTURES), composed.slice(optionsAt));
      for (const c of legacy) {
        writeFileSync(new URL(`cli-usage/${c.name}.usage.txt`, FIXTURES), `${c.usage}\n`);
        writeFileSync(new URL(`cli-usage/${c.name}.help.txt`, FIXTURES), `${c.help}\n`);
      }
    }
    const section = (name: string) => fixture(`cli-usage/${name}`).replace(/\n$/, '');
    for (const name of LEGACY) {
      expect(byName.get(name)!.usage).toBe(section(`${name}.usage.txt`));
      expect(byName.get(name)!.help).toBe(section(`${name}.help.txt`));
    }
    const expected = `${fixture('cli-usage/head.txt')}\n\nUsage:\n${USAGE_ORDER.map((n) => section(`${n}.usage.txt`)).join('\n')}\n\nCommands:\n${HELP_ORDER.map((n) => section(`${n}.help.txt`)).join('\n')}\n\n${fixture('cli-usage/options.txt')}`;
    expect(composed).toBe(expected);
  });

  it('answers every command line as main did: exit code, stdout and stderr', async () => {
    const golden = JSON.parse(fixture('cli-argv.main.json')) as Answer[];
    expect(golden.map((g) => g.argv)).toEqual(ARGV_CASES);
    const actual: Answer[] = [];
    for (const argv of ARGV_CASES) actual.push(await answer(argv));
    if (UPDATE) writeFileSync(new URL('cli-argv.main.json', FIXTURES), json(actual));
    else expect(actual).toEqual(golden);
  });

  it('answers every command line added since, one fixture file each', async () => {
    const files = addedCases();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const url = new URL(file, ARGV_DIR);
      const golden = JSON.parse(readFileSync(url, 'utf8')) as Partial<Answer> & { argv: string[] };
      expect(Array.isArray(golden.argv), `${file} has no argv`).toBe(true);
      const actual = await answer(golden.argv);
      if (UPDATE) writeFileSync(url, json(actual));
      else expect(actual, file).toEqual(golden);
    }
  });

  it('runs no command line twice', () => {
    const all = [...ARGV_CASES, ...addedCases().map((f) => (JSON.parse(readFileSync(new URL(f, ARGV_DIR), 'utf8')) as Answer).argv)].map((a) => JSON.stringify(a));
    expect(all.filter((a, i) => all.indexOf(a) !== i)).toEqual([]);
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
