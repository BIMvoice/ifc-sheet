/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL on a notched plan tells the user what it left out (#632): the run puts `drafting.msg.dimAllDropped` into the command
 * history with the count the planner reports, in the order the command prints, and the line reads in English and in Romanian.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, setPlanPartsProvider, setWorkPlaneProvider, submitCommandLine, useDraftingSession } from '@/drafting/session.js';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { registerLocale, resolve, setLocale } from '@/i18n/registry';
import { resetProject } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { house, notched, part, rect } from './fixture';
import { planDimensions } from './plan';

const view = { id: 'view-1', kind: 'plan', scale: 100 } as unknown as ProjectView;

function run(parts: ReturnType<typeof notched>) {
  setPlanPartsProvider(() => parts);
  submitCommandLine('DIMALL', null);
  return useDraftingSession.getState().history.flatMap((h) => (h.key.startsWith('drafting.msg.dimAll') ? [h] : []));
}

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
  setWorkPlaneProvider(() => null, () => view);
  registerLocale('ro', checkCatalogue(ro).catalogue);
  setLocale('en');
});

describe('DIMALL says what it left out', () => {
  it('reports the dropped strings of a notched plan after the summary, in English and in Romanian', () => {
    const dropped = planDimensions(notched(), { paperUnit: 0.1, textHeight: 0.25 }).droppedStrings;
    assert.ok(dropped > 0, 'the notched plan drops strings');
    const lines = run(notched());
    assert.deepEqual(lines.map((l) => l.key), ['drafting.msg.dimAllDone', 'drafting.msg.dimAllDropped']);
    const line = lines[1];
    assert.deepEqual(line.params, { count: dropped });
    assert.match(resolve(line.key, line.params), new RegExp(`^${dropped} strings? left out`));
    setLocale('ro');
    assert.match(resolve(line.key, line.params), /lăsate? deoparte/);
    setLocale('en');
    assert.match(resolve(line.key, { count: 1 }), /^1 string left out/);
  });

  it('says how many doors or windows it left out of the strings, in English and in Romanian', () => {
    const c = Math.cos(0.1), s = Math.sin(0.1);
    const leaning = rect(3.45, 0.13, 4.55, 0.17).map((p) => ({ x: 4 + (p.x - 4) * c - (p.y - 0.15) * s, y: 0.15 + (p.x - 4) * s + (p.y - 0.15) * c }));
    const parts = [part('wall', rect(0, 0, 3.44, 0.3), rect(5, 0, 12, 0.3)), part('wall', rect(0, 9.7, 12, 10)), part('wall', rect(0, 0.3, 0.3, 9.7)), part('wall', rect(11.7, 0.3, 12, 9.7)), part('wall', rect(7.4, 0.3, 7.64, 6)), part('door', leaning)];
    const lines = run(parts);
    const said = lines.find((l) => l.key === 'drafting.msg.dimAllOpenings');
    assert.ok(said, lines.map((l) => l.key).join());
    assert.deepEqual(said.params, { count: 1 });
    assert.match(resolve(said.key, said.params), /^1 door or window left out/);
    setLocale('ro');
    assert.match(resolve(said.key, said.params), /^O ușă sau o fereastră a fost lăsată/);
    assert.match(resolve(said.key, { count: 3 }), /^3 uși sau ferestre au fost lăsate/);
    setLocale('en');
  });

  it('says nothing about dropped strings on a plan that drops none', () => {
    assert.deepEqual(run(house()).map((l) => l.key), ['drafting.msg.dimAllDone']);
  });
});
