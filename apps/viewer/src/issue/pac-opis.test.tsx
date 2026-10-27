/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateDefaultSet, pacOpisTexts, pacPages, pacTemplateFor, type DefaultSet, type PacIntervention } from '@bimvoice/ifcsheet';
import { resetProject, useProjectStore } from '@/project/project-store';
import { projectPacOpis } from './pac-opis';

/**
 * The opis of the permit submission is made by one engine function, and the app (the issued PDF) and the command line
 * (`ifcsheet build --pac`, `pacPages`) both call it (#364). The same project must give the same opis page from either: the
 * same rows, the same Da / Nu / Nu este cazul, the same project name (the title block's, else the set's).
 */

type SheetGraphic = ReturnType<typeof pacPages>[number];

const building = (): DefaultSet => generateDefaultSet({
  storeys: [{ name: 'Subsol', elevation: -3, globalId: 'g-1' }, { name: 'Parter', elevation: 0, globalId: 'g0' }, { name: 'Etaj 1', elevation: 3, globalId: 'g1' }],
  extent: { min: { x: 0, y: -3, z: 0 }, max: { x: 20, y: 6, z: 10 } },
  proposalInput: () => null,
}, { setTemplate: pacTemplateFor('ro'), name: 'Setul casei', now: 0 })!;

/** The opis page the command line writes for `set`: `pacPages` over drawn sheets (only their ids are read). */
function cliOpis(set: DefaultSet, locale: string, works?: PacIntervention) {
  const drawn = set.document.sheets.map((s) => ({ sheetId: s.id }) as SheetGraphic);
  return pacPages(drawn, set, locale, works)[0];
}

/** The app's project, as it stands when a person has opened `set` and chosen the works. */
function openInApp(set: DefaultSet, works?: PacIntervention): void {
  useProjectStore.setState({ name: set.document.name, views: set.document.views, sheets: set.document.sheets, titleBlock: set.document.titleBlock ?? {}, pacIntervention: works === 'new' ? undefined : works });
}

beforeEach(() => resetProject());

describe('the opis of the app and of the command line (#364)', () => {
  for (const works of [undefined, 'existing', 'interior'] as const) {
    it(`gives the same page for the same project, works: ${works ?? 'a new building'}`, () => {
      const set = building();
      openInApp(set, works);
      const app = pacOpisTexts(projectPacOpis(set.document.sheets, 'ro'));
      const cli = cliOpis(set, 'ro', works);
      assert.deepEqual(app, cli.texts);
      assert.ok(cli.texts.some((t) => t.text === 'Planurile tuturor nivelurilor, cu funcțiunea fiecărui spațiu'));
    });
  }

  it('gives the same page in English', () => {
    const set = building();
    openInApp(set, 'interior');
    assert.deepEqual(pacOpisTexts(projectPacOpis(set.document.sheets, 'en')), cliOpis(set, 'en', 'interior').texts);
  });

  it('takes the project name from the title block, else from the set name, in both', () => {
    const set = building();
    openInApp(set);
    assert.ok(cliOpis(set, 'ro').texts.some((t) => t.text === 'Proiect: Setul casei'));
    assert.ok(pacOpisTexts(projectPacOpis(set.document.sheets, 'ro')).some((t) => t.text === 'Proiect: Setul casei'));
    const named = { ...set, document: { ...set.document, titleBlock: { ...set.document.titleBlock, project: 'Casa Popescu' } } };
    openInApp(named);
    assert.ok(cliOpis(named, 'ro').texts.some((t) => t.text === 'Proiect: Casa Popescu'));
    assert.deepEqual(pacOpisTexts(projectPacOpis(named.document.sheets, 'ro')), cliOpis(named, 'ro').texts);
  });

  it('answers a storey missing from the sheets the same in both: Nu', () => {
    const set = building();
    const top = set.document.views.find((v) => v.kind === 'plan' && v.level.name === 'Etaj 1')!;
    const cut = { ...set, document: { ...set.document, sheets: set.document.sheets.map((s) => ({ ...s, viewports: (s.viewports ?? []).filter((vp) => vp.viewId !== top.id) })) } };
    openInApp(cut);
    const app = pacOpisTexts(projectPacOpis(cut.document.sheets, 'ro'));
    assert.deepEqual(app, cliOpis(cut, 'ro').texts);
    const plansAt = app.find((t) => t.text === 'Planurile tuturor nivelurilor, cu funcțiunea fiecărui spațiu')!.at.y;
    assert.equal(app.find((t) => t.align === 'center' && Math.abs(t.at.y - plansAt) < 0.01)?.text, 'Nu');
  });
});
