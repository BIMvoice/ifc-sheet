/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** TAGALL and DIMALL on a detail: the detail's area only, and no facades along the crop. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, setPlanPartsProvider, setRoomsProvider, setViewElementsProvider, setWorkPlaneProvider, submitCommandLine, useDraftingSession } from '@/drafting/session.js';
import type { ProjectView } from '@/project/types';
import type { LabelElement } from '@/labels/label-resolve.js';
import { wall } from '@/labels/label-fixture.js';
import type { Pt } from '@/drafting/types';
import { house } from '@/dimall/fixture.js';
import { tagAll } from './tagall.js';

const detail = { of: 'plan-1', min: { x: 0, y: 0 }, max: { x: 6, y: 6 }, number: 1 };
const plan = { id: 'view-1', kind: 'plan', scale: 100 } as unknown as ProjectView;
const detailView = { ...plan, detail } as unknown as ProjectView;
const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const space = (name: string): LabelElement => wall({ className: () => 'IfcSpace', attribute: (n) => (n === 'LongName' ? name : ''), propertySets: () => [], typePropertySets: () => [], quantitySets: () => [] });
const model: Record<string, LabelElement> = { inside: space('Kitchen'), outside: space('Garage') };
const rooms = [
  { renderId: 1, guid: 'inside', ring: box(1, 1, 5, 5), at: 'cut' as const },
  { renderId: 2, guid: 'outside', ring: box(20, 20, 25, 25), at: 'cut' as const },
];
const labelled = () => useProjectStore.getState().drafts.map((d) => d.params.labelOf);

function attach(view: ProjectView): void {
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
  setWorkPlaneProvider(() => null, () => view);
  setViewElementsProvider(() => []);
  setRoomsProvider(() => rooms);
  setPlanPartsProvider(() => house());
}

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
});

/** The parts of the context TAGALL reads, for a plan view the test describes. */
function contextOf(view: ProjectView, say: string[] = []): Parameters<typeof tagAll>[0] {
  return {
    viewId: 'view-1',
    layerId: '0',
    settings: { textHeight: 0.25, currentTextStyle: 'Standard', currentDimStyle: 'Standard' },
    viewKind: () => 'plan',
    view: () => view,
    viewElements: () => [],
    rooms: () => rooms,
    planObstacles: () => [],
    entities: () => useProjectStore.getState().drafts,
    say: (key: string) => { say.push(key); },
  } as unknown as Parameters<typeof tagAll>[0];
}

describe('TAGALL on a detail', () => {
  it('labels the rooms inside the crop and not the others', () => {
    attach(detailView);
    tagAll(contextOf(detailView), (guid) => model[guid] ?? null);
    assert.deepEqual(labelled(), ['inside']);
  });

  it('labels every room on the plan the detail was cut from', () => {
    attach(plan);
    tagAll(contextOf(plan), (guid) => model[guid] ?? null);
    assert.deepEqual(labelled().sort(), ['inside', 'outside']);
  });
});

describe('DIMALL on a detail', () => {
  it('refuses, and says why, instead of dimensioning the crop\'s edges as facades', () => {
    attach(detailView);
    submitCommandLine('DIMALL', null);
    assert.equal(useProjectStore.getState().drafts.filter((d) => d.shape.type === 'dimension').length, 0);
    assert.ok(useDraftingSession.getState().history.some((h) => h.key === 'drafting.msg.dimAllNotOnDetail'));
  });

  it('still dimensions the plan itself', () => {
    attach(plan);
    submitCommandLine('DIMALL', null);
    assert.ok(useProjectStore.getState().drafts.filter((d) => d.shape.type === 'dimension').length > 20);
  });
});
