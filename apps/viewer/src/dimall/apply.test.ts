/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** DIMALL as a command: dimensions that are ordinary, stamped, added once, one undo step, and figures that do not collide. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, setPlanPartsProvider, setWorkPlaneProvider, submitCommandLine, useDraftingSession } from '@/drafting/session.js';
import type { ProjectView } from '@/project/types';
import { DEFAULT_DIM_STYLE } from '@/drafting/styles';
import { paperUnitOf } from '@/project/drafting-standards';
import { house } from './fixture.js';

const view = { id: 'view-1', kind: 'plan', scale: 100 } as unknown as ProjectView;
const dims = () => useProjectStore.getState().drafts.filter((d) => d.shape.type === 'dimension');

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
  setWorkPlaneProvider(() => null, () => view);
  setPlanPartsProvider(() => house());
});

describe('DIMALL', () => {
  it('adds ordinary dimensions, each stamped, and a second run adds nothing', () => {
    submitCommandLine('DIMALL', null);
    const first = dims().length;
    assert.ok(first > 20, String(first));
    assert.ok(dims().every((d) => typeof d.params.dimAll === 'string' && d.shape.type === 'dimension' && d.shape.variant === 'aligned'));
    submitCommandLine('DIMALL', null);
    assert.equal(dims().length, first);
  });

  it('adds again only what was deleted', () => {
    submitCommandLine('DIMALL', null);
    const all = dims().length;
    useProjectStore.setState({ drafts: useProjectStore.getState().drafts.slice(1) });
    submitCommandLine('DIMALL', null);
    assert.equal(dims().length, all);
  });

  it('is one undo step', () => {
    submitCommandLine('DIMALL', null);
    assert.ok(dims().length > 0);
    assert.ok(undoDrafts());
    assert.equal(dims().length, 0);
  });

  it('refuses a view that is not a plan', () => {
    setWorkPlaneProvider(() => null, () => ({ ...view, kind: 'section' }) as unknown as ProjectView);
    submitCommandLine('DIMALL', null);
    assert.equal(dims().length, 0);
  });
});

/** The nearest any placed dimension line stands off the points it measures, in paper millimetres. */
function nearestStringMm(): number {
  const offsets = dims().flatMap(({ shape }) => {
    if (shape.type !== 'dimension') return [];
    const len = Math.hypot(shape.b.x - shape.a.x, shape.b.y - shape.a.y);
    return [Math.abs((shape.b.x - shape.a.x) * (shape.a.y - shape.at.y) - (shape.a.x - shape.at.x) * (shape.b.y - shape.a.y)) / len];
  });
  return Math.min(...offsets) / paperUnitOf('view-1');
}

describe('DIMALL offset', () => {
  it('stands the first string 20 mm (paper) from the walls by default, leaving a row for tags', () => {
    submitCommandLine('DIMALL', null);
    assert.ok(Math.abs(nearestStringMm() - 20) < 1e-6, String(nearestStringMm()));
  });

  it('follows the dimension style setting', () => {
    useProjectStore.setState({ dimStyles: [{ ...DEFAULT_DIM_STYLE, allOffset: 30 }] });
    submitCommandLine('DIMALL', null);
    assert.ok(Math.abs(nearestStringMm() - 30) < 1e-6, String(nearestStringMm()));
  });

  it('uses the default for a style saved without the setting', () => {
    const { allOffset: _, ...old } = DEFAULT_DIM_STYLE;
    useProjectStore.setState({ dimStyles: [old] });
    submitCommandLine('DIMALL', null);
    assert.ok(Math.abs(nearestStringMm() - 20) < 1e-6, String(nearestStringMm()));
  });
});
