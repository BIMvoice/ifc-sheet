/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #48: the site area POT and CUT are measured on. A site area typed in the
 * project overrides; else the plot boundary drawn on the site plan; else the
 * model's IfcSite area; else none, and no ratio is made up.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DraftEntity, Pt } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { PLOT_BOUNDARY_LAYER } from '@/siteplan/plot';
import { urbanIndicators, type StoreyInput } from './indicators';
import { siteAreaOf } from './site-area';

const SITE: ProjectView = { id: 'site', name: 'Site plan', kind: 'plan', site: true, createdAt: 0, cutHeight: 1.2, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] } };
const rect = (w: number, h: number): Pt[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
const boundary = (pts: Pt[], viewId = 'site'): DraftEntity => ({ id: `b-${pts.length}-${pts[2].x}`, viewId, layerId: PLOT_BOUNDARY_LAYER.id, params: {}, shape: { type: 'polyline', pts, closed: true } });
// Two 10 × 12 m storeys: Ac 120 m², Ad 240 m².
const storeys: StoreyInput[] = [
  { name: 'EG', elevation: 0, footprint: [{ outer: [[0, 0], [10, 0], [10, 12], [0, 12]], holes: [] }] },
  { name: 'OG', elevation: 3, footprint: [{ outer: [[0, 0], [10, 0], [10, 12], [0, 12]], holes: [] }] },
];
const ratios = (project: Parameters<typeof siteAreaOf>[0], model: number | null = null) => {
  const r = urbanIndicators({ storeys, spaces: [], siteArea: siteAreaOf(project, model).area });
  return { pot: r.pot, cut: r.cut, site: r.siteArea };
};

describe('the site area of the urban indicators (#48)', () => {
  it('is the plot boundary drawn on the site plan, and the ratios follow it', () => {
    const drawn = siteAreaOf({ views: [SITE], drafts: [boundary(rect(20, 30))] }, null);
    assert.deepEqual(drawn, { area: 600, source: 'plot', plot: 600, typed: null, model: null });
    assert.deepEqual(ratios({ views: [SITE], drafts: [boundary(rect(20, 30))] }), { pot: 20, cut: 0.4, site: 600 });
    // The boundary redrawn twice as large: POT and CUT halve.
    assert.deepEqual(ratios({ views: [SITE], drafts: [boundary(rect(40, 30))] }), { pot: 10, cut: 0.2, site: 1200 });
  });

  it('a drawn plot wins over the model\'s IfcSite area', () => {
    assert.deepEqual(siteAreaOf({ views: [SITE], drafts: [boundary(rect(20, 30))] }, 999), { area: 600, source: 'plot', plot: 600, typed: null, model: 999 });
    assert.deepEqual(ratios({ views: [SITE], drafts: [boundary(rect(20, 30))] }, 999), { pot: 20, cut: 0.4, site: 600 });
  });

  it('a typed site area overrides the drawn plot, which is still reported', () => {
    const choice = siteAreaOf({ siteArea: 300, views: [SITE], drafts: [boundary(rect(20, 30))] }, 999);
    assert.deepEqual(choice, { area: 300, source: 'typed', plot: 600, typed: 300, model: 999 });
    assert.deepEqual(ratios({ siteArea: 300, views: [SITE], drafts: [boundary(rect(20, 30))] }), { pot: 40, cut: 0.8, site: 300 });
  });

  it('without a drawn plot: the model\'s area, else none and no ratio', () => {
    assert.deepEqual(siteAreaOf({ views: [SITE], drafts: [] }, 450), { area: 450, source: 'model', plot: null, typed: null, model: 450 });
    assert.deepEqual(siteAreaOf({ views: [SITE], drafts: [] }, null), { area: null, source: null, plot: null, typed: null, model: null });
    assert.deepEqual(ratios({ views: [SITE], drafts: [] }), { pot: null, cut: null, site: null });
    // A closed polyline on another layer, or a boundary on a plan that is not the site plan, is not the plot.
    const other: DraftEntity = { ...boundary(rect(20, 30)), layerId: '0' };
    const plan: ProjectView = { ...SITE, id: 'plan', site: undefined };
    assert.equal(siteAreaOf({ views: [SITE, plan], drafts: [other, boundary(rect(20, 30), 'plan')] }, null).source, null);
  });

  it('an unusable typed or model area is not taken', () => {
    assert.equal(siteAreaOf({ siteArea: 0, views: [], drafts: [] }, Number.NaN).source, null);
    assert.equal(siteAreaOf({ siteArea: -5, views: [], drafts: [] }, -1).area, null);
  });
});
