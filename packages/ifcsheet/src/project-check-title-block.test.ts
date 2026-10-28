/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet check --project` reports the title block values the project's layout cuts short, with the app's sentence
 * (`ready.titleBlockFit`). The finding comes from the `fitCell` the sheets print with (`titleBlockMisfits`); the
 * app's readiness list is held to the same findings by `apps/viewer/src/check/project-check-parity.test.ts`.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';
import { romanianTitleBlock, TITLE_BLOCK_CAPTIONS_RO, type RoCaption } from './title-block-ro.js';
import { standardTitleBlock } from './title-block-standard.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));

/** The review's long beneficiary: it wraps and shrinks to fit (`title-block-fit-cell.test.ts`), so it is no finding on its own. */
const LONG_CLIENT = 'S.C. Societatea Comercială de Construcții și Investiții Imobiliare Reunite S.R.L.';
/** Beyond what two lines at the smallest size hold. */
const ABSURD_CLIENT = Array.from({ length: 12 }, () => LONG_CLIENT).join(' ');

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const sheet = (id: string, number: string, name: string, titleBlock?: Record<string, string>) => ({ id, number, name, createdAt: 1, ...(titleBlock ? { titleBlock } : {}) });
const write = (project: Record<string, unknown>) => {
  const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-tbfit-'));
  dirs.push(dir);
  const file = join(dir, 'p.ifclite-project.json');
  writeFileSync(file, JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'Haus', ...project }));
  return file;
};
const ro = romanianTitleBlock((k: RoCaption) => TITLE_BLOCK_CAPTIONS_RO[k]);

const findingsOf = async (project: string) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(['check', FZK, '--json', '--project', project], { stdout: (t) => void out.push(t), stderr: (t) => void err.push(t) });
  const json = JSON.parse(out.join('')) as { findings: { kind: string; missing: string; effect: string; params: Record<string, unknown> }[] };
  return { code, err: err.join(''), fits: json.findings.filter((f) => f.kind === 'titleBlockFit') };
};

describe.skipIf(!existsSync(FZK))('ifcsheet check --project: title block fit, on AC20-FZK-Haus', () => {
  it('lists the finding for each sheet whose beneficiary does not fit, with the app\'s sentence', async () => {
    const file = write({
      titleBlockTemplate: ro, titleBlock: { client: ABSURD_CLIENT },
      sheets: [sheet('a', 'A-101', 'Plan parter'), sheet('b', 'A-102', 'Plan etaj')],
    });
    const { code, fits } = await findingsOf(file);
    expect(code).toBe(EXIT.failed);
    expect(fits.map((f) => f.missing)).toEqual([
      'Title block: Beneficiar does not fit its cell on A-101 Plan parter; shorten it or use an abbreviation.',
      'Title block: Beneficiar does not fit its cell on A-102 Plan etaj; shorten it or use an abbreviation.',
    ]);
    expect(fits[0].effect).toBe('The printed value is cut short with an ellipsis, so part of it is missing on the sheet.');
    expect(fits.map((f) => f.params)).toEqual([{ field: 'Beneficiar', sheet: 'A-101 Plan parter' }, { field: 'Beneficiar', sheet: 'A-102 Plan etaj' }]);
  }, 120_000);

  it('judges each sheet on what it shows: a sheet that says a short client itself has no finding', async () => {
    const file = write({
      titleBlockTemplate: ro, titleBlock: { client: ABSURD_CLIENT },
      sheets: [sheet('a', 'A-101', 'Plan parter', { client: 'Alfa SRL' }), sheet('b', 'A-102', 'Plan etaj')],
    });
    expect((await findingsOf(file)).fits.map((f) => f.params.sheet)).toEqual(['A-102 Plan etaj']);
  }, 120_000);

  it('is no finding for a value that wraps to fit, for the standard layout, or for a project without sheets', async () => {
    const sheets = [sheet('a', 'A-101', 'Plan parter')];
    expect((await findingsOf(write({ titleBlockTemplate: ro, titleBlock: { client: LONG_CLIENT }, sheets }))).fits).toEqual([]);
    expect((await findingsOf(write({ titleBlockTemplate: standardTitleBlock(), titleBlock: { client: ABSURD_CLIENT }, sheets }))).fits).toEqual([]);
    expect((await findingsOf(write({ titleBlock: { client: ABSURD_CLIENT }, sheets }))).fits).toEqual([]);
    expect((await findingsOf(write({ titleBlockTemplate: ro, titleBlock: { client: ABSURD_CLIENT } }))).fits).toEqual([]);
  }, 120_000);

  it('prints the finding in the plain report too', async () => {
    const out: string[] = [];
    await run(['check', FZK, '--project', write({ titleBlockTemplate: ro, titleBlock: { client: ABSURD_CLIENT }, sheets: [sheet('a', 'A-101', 'Plan parter')] })], { stdout: (t) => void out.push(t), stderr: () => undefined });
    expect(out.join('')).toContain('- Title block: Beneficiar does not fit its cell on A-101 Plan parter; shorten it or use an abbreviation.');
  }, 120_000);
});
