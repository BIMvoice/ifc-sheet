/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #76: the site area typed in once reaches every table showing the urban
 * indicators (its own tab and each sheet it is placed on), and is saved with
 * the project.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { blur, cleanup, click, render, type, waitFor } from '@/test/render.js';
import { loadUrbanModel, urbanWasm } from '@/test/urban-fixture';
import { useViewerStore } from '@/store';
import { addScheduleToSet } from '@/project/drawing-set-actions';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectSheet } from '@/project/types';
import { ScheduleGraphic, useSheetSchedules } from '../joinery/ScheduleGraphic';
import { UrbanView } from './UrbanView';

const FZK = resolve(import.meta.dirname, '../../../../public/_fixtures/AC20-FZK-Haus.ifc');

/** A sheet as it draws its placed schedules. */
function SheetSchedules({ sheet }: { sheet: ProjectSheet }) {
  const layouts = useSheetSchedules(sheet);
  return <svg data-testid="sheet">{[...layouts.values()].map((l, i) => <ScheduleGraphic key={i} layout={l} />)}</svg>;
}

const textsOf = (el: Element | null) => [...(el?.querySelectorAll('text') ?? [])].map((n) => n.textContent ?? '');
/** The figure printed right of a label in a table: the next text after it. */
const figure = (el: Element | null, label: string) => {
  const texts = textsOf(el);
  const i = texts.indexOf(label);
  return i < 0 ? undefined : texts[i + 1];
};

describe('urban indicators: the site area (#76)', () => {
  beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map() }); });
  afterEach(() => cleanup());

  it('a site area typed in the tab changes POT and CUT on the tab and on the sheet alike', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const sheetId = addScheduleToSet('urban', 'Indicators');
    const { schedules, sheets } = useProjectStore.getState();
    const schedule = schedules!.find((s) => s.kind === 'urban')!;
    const ui = render(<><UrbanView schedule={schedule} /><SheetSchedules sheet={sheets.find((s) => s.id === sheetId)!} /></>);
    const tab = () => ui.querySelector('svg:not([data-testid])');
    const sheet = () => ui.querySelector('[data-testid="sheet"]');

    // FZK-Haus states no site area (its IfcSite GrossArea is 0): no POT, no CUT.
    await waitFor(() => figure(tab(), 'POT (Ac / site)') === '—', 'the tab measures the model');
    assert.equal(figure(sheet(), 'POT (Ac / site)'), '—');
    assert.equal(figure(tab(), 'Ac (built area)'), '120.00');

    const input = [...ui.querySelectorAll('input')].find((i) => i.labels?.[0]?.textContent === 'Site area (m²)') as HTMLInputElement;
    assert.ok(input, 'the site area field');
    type(input, '600');
    blur(input);
    assert.equal(useProjectStore.getState().siteArea, 600);
    await waitFor(() => figure(tab(), 'POT (Ac / site)') === '20.00 %', 'the tab takes the typed site area');
    for (const where of [tab(), sheet()]) {
      assert.equal(figure(where, 'POT (Ac / site)'), '20.00 %');
      assert.equal(figure(where, 'CUT (Ad for CUT / site)'), '0.40');
      assert.equal(figure(where, 'Site area'), '600.00');
    }

    // Another value, written straight to the project (as opening a file does), reaches both too.
    useProjectStore.setState({ siteArea: 300 });
    await waitFor(() => figure(sheet(), 'POT (Ac / site)') === '40.00 %', 'the sheet takes the stored site area');
    assert.equal(figure(tab(), 'CUT (Ad for CUT / site)'), '0.80');
  });

  // Review of #111: Ad for CUT leaves levels out per level, and the terrain is an input; both are the project's.
  it('a level unticked for CUT leaves Ad alone and takes its area off Ad for CUT and CUT; the terrain typed in is kept', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    useProjectStore.setState({ siteArea: 600 });
    const schedule = { id: 'u', name: 'Indicators', kind: 'urban' as const, createdAt: 0 };
    const ui = render(<UrbanView schedule={schedule} />);
    const tab = () => ui.querySelector('svg');
    await waitFor(() => figure(tab(), 'Ad for CUT') === '240.00', 'the tab measures the model');
    const attic = [...ui.querySelectorAll('label')].find((l) => l.textContent === 'Dachgeschoss')?.querySelector('input');
    assert.ok(attic?.checked, 'the attic counts by default');
    click(attic!);
    assert.deepEqual(useProjectStore.getState().urbanSettings, { cutExcluded: { Dachgeschoss: true } });
    await waitFor(() => figure(tab(), 'Ad for CUT') === '120.00', 'the attic is left out of Ad for CUT');
    assert.equal(figure(tab(), 'Ad (gross developed area, all levels)'), '240.00');
    assert.equal(figure(tab(), 'CUT (Ad for CUT / site)'), '0.20');
    assert.ok(textsOf(tab()).some((line) => line.startsWith('Ad for CUT leaves out: Dachgeschoss.')), 'the sheet states what was left out');
    // Ticked again it is the default once more, and nothing is stored.
    click(attic!);
    assert.equal(useProjectStore.getState().urbanSettings, undefined);

    const terrain = [...ui.querySelectorAll('input')].find((i) => i.labels?.[0]?.textContent === 'Terrain (m)') as HTMLInputElement;
    type(terrain, '-0,60');
    blur(terrain);
    assert.deepEqual(useProjectStore.getState().urbanSettings, { terrainLevel: -0.6 });
    await waitFor(() => textsOf(tab()).some((line) => line.includes('below the terrain, at -0.60')), 'the sheet states the terrain');
  });

  it('is saved with the project, and opening a project without one clears it', () => {
    useProjectStore.setState({ siteArea: 812.5 });
    const saved = projectDocument();
    assert.equal(saved.siteArea, 812.5);
    useProjectStore.setState({ siteArea: 20 });
    loadProjectDocument(saved);
    assert.equal(useProjectStore.getState().siteArea, 812.5);
    const { siteArea: _dropped, ...older } = saved;
    loadProjectDocument(older);
    assert.equal(useProjectStore.getState().siteArea, undefined);
    useProjectStore.setState({ siteArea: 20 });
    resetProject();
    assert.equal(useProjectStore.getState().siteArea, undefined);
  });
});
