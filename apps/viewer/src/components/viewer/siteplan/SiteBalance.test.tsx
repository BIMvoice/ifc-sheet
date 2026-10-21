/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #48: the site balance under a site plan prints the plot area, the built
 * area (Ac), the gross floor area (Ad), POT and CUT from the urban
 * indicators (#111), measured on the plot boundary drawn on the site plan,
 * so the ratios follow the plot. Without a plot it says so.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, waitFor } from '@/test/render.js';
import { loadUrbanModel, urbanWasm } from '@/test/urban-fixture';
import { useViewerStore } from '@/store';
import { loadProjectDocument, projectDocument, resetProject, setProjectSiteArea, useProjectStore } from '@/project/project-store';
import type { DraftEntity, Pt } from '@/drafting/types';
import { PLOT_BOUNDARY_LAYER } from '@/siteplan/plot';
import { ensureSitePlan } from '@/siteplan/site-actions';
import { UrbanView } from '../urban/UrbanView';
import { SiteBalance } from './SiteBalance';

const FZK = resolve(import.meta.dirname, '../../../../src/test/__fixtures__/AC20-FZK-Haus.ifc');

const rect = (w: number, h: number): Pt[] => [{ x: -5, y: -5 }, { x: w - 5, y: -5 }, { x: w - 5, y: h - 5 }, { x: -5, y: h - 5 }];
/** Draw (or redraw) the plot boundary on the site plan, as the polyline command leaves it. */
function drawPlot(viewId: string, pts: Pt[]): void {
  const entity: DraftEntity = { id: 'plot', viewId, layerId: PLOT_BOUNDARY_LAYER.id, params: {}, shape: { type: 'polyline', pts, closed: true } };
  const { drafts } = useProjectStore.getState();
  useProjectStore.setState({ drafts: [...drafts.filter((d) => d.id !== 'plot'), entity], dirty: true });
}

const textsOf = (el: Element | null) => [...(el?.querySelectorAll('text') ?? [])].map((n) => n.textContent ?? '');
/** The site balance's figure on the row labelled `label`. */
const value = (el: Element | null, label: string) => el?.querySelector(`[data-site-balance] [data-value="${label}"]`)?.textContent ?? undefined;
/** The urban schedule's figure right of `label`. */
const figure = (el: Element | null, label: string) => {
  const texts = textsOf(el);
  const i = texts.indexOf(label);
  return i < 0 ? undefined : texts[i + 1];
};

describe('the site balance on the site plan (#48)', () => {
  beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map() }); });
  afterEach(() => cleanup());

  it('with no plot boundary drawn, says so plainly and gives no ratio', () => {
    const ui = render(<svg><SiteBalance x={0} y={0} /></svg>);
    const balance = ui.querySelector('[data-site-balance]');
    assert.equal(value(balance, 'Plot area'), 'no plot boundary drawn');
    assert.equal(value(balance, 'POT (Ac / plot area)'), '—');
    assert.equal(value(balance, 'CUT (Ad for CUT / plot area)'), '—');
    assert.ok(textsOf(balance).some((line) => line.startsWith('No plot boundary is drawn on the site plan')), textsOf(balance).join(' | '));
    // #135's provisional rows are gone.
    assert.ok(!textsOf(balance).some((line) => line.includes('Provisional') || line.includes('Footprint / plot')));
  });

  it('prints Ac, Ad, POT and CUT as the urban indicators do, on the drawn plot, following it; save and reopen keep it', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const siteId = ensureSitePlan('Site plan');
    assert.ok(siteId, 'a site plan on the ground storey');
    drawPlot(siteId, rect(20, 30));
    const schedule = { id: 'u', name: 'Indicators', kind: 'urban' as const, createdAt: 0 };
    const ui = render(<><svg data-testid="sheet"><SiteBalance x={0} y={0} /></svg><UrbanView schedule={schedule} /></>);
    const balance = () => ui.querySelector('[data-site-balance]');
    const tab = () => ui.querySelector('svg:not([data-testid])');

    await waitFor(() => value(balance(), 'POT (Ac / plot area)') === '20.00 %', 'the balance measures the model on the 600 m² plot');
    assert.equal(value(balance(), 'Plot area'), '600.00 m²');
    assert.equal(value(balance(), 'Built area (Ac)'), '120.00 m²');
    assert.equal(value(balance(), 'Gross floor area (Ad)'), '240.00 m²');
    assert.equal(value(balance(), 'CUT (Ad for CUT / plot area)'), '0.40');
    // The same figures as the urban indicators table: one calculation, read on the same site area.
    await waitFor(() => figure(tab(), 'POT (Ac / site)') === '20.00 %', 'the urban schedule takes the drawn plot too');
    assert.equal(figure(tab(), 'Site area'), '600.00');
    assert.equal(figure(tab(), 'Ac (built area)'), '120.00');
    assert.equal(figure(tab(), 'Ad (gross developed area, all levels)'), '240.00');
    assert.equal(figure(tab(), 'CUT (Ad for CUT / site)'), '0.40');
    assert.ok(textsOf(balance()).some((line) => line.startsWith('Site area: measured on the plot boundary drawn on the site plan.')));

    // The boundary redrawn twice as large: the ratios follow it, on the balance and on the schedule.
    drawPlot(siteId, rect(40, 30));
    await waitFor(() => value(balance(), 'POT (Ac / plot area)') === '10.00 %', 'the balance follows the plot');
    assert.equal(value(balance(), 'Plot area'), '1,200.00 m²');
    assert.equal(value(balance(), 'CUT (Ad for CUT / plot area)'), '0.20');
    await waitFor(() => figure(tab(), 'POT (Ac / site)') === '10.00 %', 'the schedule follows the plot');

    // A typed site area overrides the plot, and the balance says so, with the drawn plot's area.
    setProjectSiteArea(300);
    await waitFor(() => value(balance(), 'POT (Ac / plot area)') === '40.00 %', 'the typed area overrides');
    assert.equal(value(balance(), 'Plot area'), '300.00 m²');
    const said = textsOf(balance()).join(' ');
    assert.ok(said.includes('Site area: typed in the project. It overrides the plot boundary drawn on the site plan (1,200.00 m²).'), said);

    // Saved and reopened: the plot boundary and the override come back, and so do the ratios.
    const saved = JSON.parse(JSON.stringify(projectDocument()));
    resetProject();
    await waitFor(() => value(balance(), 'Plot area') === 'no plot boundary drawn', 'a new project has no plot');
    loadProjectDocument(saved);
    await waitFor(() => value(balance(), 'POT (Ac / plot area)') === '40.00 %', 'the reopened project keeps the override');
    setProjectSiteArea(null);
    await waitFor(() => value(balance(), 'POT (Ac / plot area)') === '10.00 %', 'the reopened project keeps the drawn plot');
    assert.equal(value(balance(), 'Plot area'), '1,200.00 m²');
  });
});
