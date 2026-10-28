/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The command line's one language resolver, and the validator the app's reader shares (`names.ts` `readProjectLanguage`). No model needed. */
import { describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { localeProblem, resolveLanguage } from './cli-language.js';
import { nameLanguageOf, readProjectLanguage, unknownLanguageMessage } from './names.js';
import { readProjectFile } from './project-read.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';

const file = (extra: Record<string, unknown>) => readProjectFile(JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'P', ...extra }));

describe('language values', () => {
  it('accept exactly ro and en, in any case', () => {
    expect(['ro', 'EN', ' ro '].map(nameLanguageOf)).toEqual(['ro', 'en', 'ro']);
    expect(['de', 'ro-RO', 'en_US', '', undefined].map(nameLanguageOf)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it('read a project language: kept when accepted, named when not, nothing when absent', () => {
    expect(readProjectLanguage('ro')).toEqual({ language: 'ro' });
    expect(readProjectLanguage('de')).toEqual({ unknown: 'de' });
    expect(readProjectLanguage('')).toEqual({});
    expect(readProjectLanguage(3)).toEqual({});
    expect(file({ language: 'en' }).language).toBe('en');
    const unknown = file({ language: 'de' });
    expect(unknown.language).toBeUndefined();
    expect(unknown.unknownLanguage).toBe('de');
  });
});

describe('--locale', () => {
  it('is refused with a usage error naming ro and en, for build, whatever else is right', async () => {
    const err: string[] = [];
    const code = await run(['build', 'm.ifc', '--out', 'a.pdf', '--locale', 'xx'], { stdout: () => undefined, stderr: (t) => void err.push(t) });
    expect(code).toBe(EXIT.usage);
    expect(err.join('')).toBe('ifcsheet: --locale must be one of en, ro, not "xx".\n');
    expect(localeProblem('ro')).toBeUndefined();
    expect(localeProblem(undefined)).toBeUndefined();
  });

  it('is accepted for ro and en (the build then fails on the missing model, not on the flag)', async () => {
    for (const locale of ['ro', 'en']) {
      const err: string[] = [];
      expect(await run(['build', '/no/such/model.ifc', '--out', 'a.pdf', '--locale', locale], { stdout: () => undefined, stderr: (t) => void err.push(t) })).toBe(EXIT.failed);
      expect(err.join('')).not.toContain('--locale');
    }
  });
});

describe('resolveLanguage: project language, else --locale, else en (ro for a PAC submission)', () => {
  it('follows the order', () => {
    expect(resolveLanguage({}).language).toBe('en');
    expect(resolveLanguage({ locale: 'ro' }).language).toBe('ro');
    expect(resolveLanguage({ project: { language: 'ro' } }).language).toBe('ro');
    expect(resolveLanguage({ project: {}, locale: 'ro' }).language).toBe('ro');
    expect(resolveLanguage({ pac: true }).language).toBe('ro');
    expect(resolveLanguage({ pac: true, locale: 'en' }).language).toBe('en');
    expect(resolveLanguage({ pac: true, project: { language: 'en' } }).language).toBe('en');
  });

  it('warns once when the project and --locale disagree and uses the project; says nothing when they agree', () => {
    const disagree = resolveLanguage({ project: { language: 'en' }, locale: 'ro' });
    expect(disagree.language).toBe('en');
    expect(disagree.notes).toEqual(["ifcsheet: --locale ro differs from the project's language en; using en.\n"]);
    expect(resolveLanguage({ project: { language: 'ro' }, locale: 'RO' }).notes).toEqual([]);
  });

  it('ignores a project language it does not accept, with the shared message, and falls through', () => {
    const r = resolveLanguage({ project: { unknownLanguage: 'de' }, locale: 'ro' });
    expect(r.language).toBe('ro');
    expect(r.notes).toEqual([`ifcsheet: ${unknownLanguageMessage('de')}\n`]);
  });
});
