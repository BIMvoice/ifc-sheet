/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #842, third part: "A bit more space between label and element ... I used 4 mm. A gap setting on the label type would
 * let each office choose." The gap typed in the label type's fields is saved on the type, and Label all on a drawing of a
 * sheet then keeps it round every label: the two signs of `signs-with-pset.ifc`, drawn close together on the plan, get
 * labels 4 mm apart and 4 mm from their sign, where the standard spacing puts them nearer.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rectRingGap, refToRing, type LeaderRect as Rect } from '@bimvoice/ifcsheet';
import { blur, cleanup, click, render, type } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { cancelCommand, setViewElementsProvider, submitCommandLine } from '@/drafting/session';
import { clearDraftHistory } from '@/drafting/draft-store';
import { MODEL_TAB_ID, useDocumentTabs } from '@/project/document-tabs';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { defaultViews } from '@/project/view-defaults';
import { paperUnitOf } from '@/project/drafting-standards';
import { rectsOf } from '@/labels/label-annotations';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectSheet, ProjectView } from '@/project/types';
import type { AnnotationType } from '@/catalogue/types';
import type { Pt } from '@/drafting/types';
import { AnnotationTypesTab } from '../drafting/standards/AnnotationTypesTab.js';
import { SteppedSheet } from './SteppedSheet.js';

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const SIGN_TYPE: AnnotationType = { id: 'at-sign', name: 'Sign code', tool: 'label', label: { template: '{Tag}', frame: 'box', missing: 'question', leader: 'always' } };
const square = (x: number, y: number): Pt[] => [{ x: x - 0.1, y: y - 0.1 }, { x: x + 0.1, y: y - 0.1 }, { x: x + 0.1, y: y + 0.1 }, { x: x - 0.1, y: y + 0.1 }];
/** The two IfcSign of the fixture (#120, #121) drawn one above the other, 0.35 m apart on the plan, as signs on one post are. */
const SIGNS = [120, 121].map((renderId, i) => ({ renderId, anchor: { x: 2, y: 3 + i * 0.35 }, ring: square(2, 3 + i * 0.35) }));
/** A column far to their left (no labelled element): the labels go to the signs' right, the side facing away, one above the other. */
const COLUMN = { renderId: 900, anchor: { x: -6, y: 3 }, ring: square(-6, 3) };
let plan: ProjectView;
let sheet: ProjectSheet;

beforeEach(async () => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  const store = await parseStep(readFileSync(resolve(process.cwd(), 'src/test/__fixtures__/signs-with-pset.ifc')));
  seedModel('signs', 0, store, 120);
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  useProjectStore.setState({ annotationTypes: [SIGN_TYPE] });
  useDocumentTabs.setState({ openIds: [], activeId: MODEL_TAB_ID });
  const found = useProjectStore.getState().views.find((v) => v.kind === 'plan');
  const on = useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === found?.id));
  assert.ok(found && on, 'the drawing set hangs a plan on a sheet');
  plan = found;
  sheet = on;
});
afterEach(() => {
  act(() => cancelCommand());
  cleanup();
  setViewElementsProvider(null);
});

const button = (ui: HTMLElement, label: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
const labels = () => useProjectStore.getState().drafts.filter((d) => d.viewId === plan.id && d.params.atype === SIGN_TYPE.id);
const apart = (a: Rect, b: Rect) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));

/** Label all with the sign type on the plan, the gap typed first when given; what space each label keeps, paper millimetres. */
function labelAll(gap?: string) {
  const ui = render(
    <>
      <SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} initialFocus={plan.id} onBack={() => {}} onStep={() => {}} />
      <AnnotationTypesTab />
    </>,
  );
  if (gap !== undefined) {
    const field = ui.querySelector<HTMLInputElement>('input[aria-label="Gap (mm)"]');
    assert.ok(field, 'the label type has a gap field');
    type(field, gap);
    blur(field);
  }
  setViewElementsProvider(() => [...SIGNS, COLUMN]);
  act(() => click(button(ui, 'Label all')!));
  act(() => submitCommandLine('IfcSign', null));
  const drafts = labels();
  assert.equal(drafts.length, 2, 'one label on each sign');
  const unit = paperUnitOf(plan.id);
  // The label's own box, its leader left out.
  const boxOf = (d: (typeof drafts)[number]) => rectsOf([d.shape.type === 'text' ? { ...d, shape: { ...d.shape, leader: undefined } } : d])[0]!;
  const [a, b] = drafts.map(boxOf);
  // Each label's own sign is the outline it carries (`labelRef`), the one its leader runs to.
  const own = drafts.map((d) => {
    const ring = refToRing(d.params.labelRef);
    assert.ok(ring, 'a label carries its element\'s outline');
    return rectRingGap(boxOf(d), ring) / unit;
  });
  console.log(`measure: 1 mm = ${unit} m; labels ${(apart(a!, b!) / unit).toFixed(2)} mm apart, ${own.map((g) => g.toFixed(2)).join(' and ')} mm from their sign`);
  return { between: apart(a!, b!) / unit, own };
}

describe('a label type\'s gap in Label all on a sheet (#842)', () => {
  it('with the standard spacing the two labels sit closer than 4 mm', () => {
    const { between } = labelAll();
    assert.ok(between < 4, `${between.toFixed(2)} mm apart`);
  });

  it('a gap of 4 mm typed on the type is saved on it, and keeps the labels 4 mm apart and 4 mm from their sign', () => {
    const { between, own } = labelAll('4');
    assert.equal(useProjectStore.getState().annotationTypes?.[0]?.label?.gap, 4, 'the type keeps the gap the project file saves');
    assert.ok(between >= 4 - 1e-6, `${between.toFixed(2)} mm apart`);
    for (const g of own) assert.ok(g >= 4 - 1e-6, `${g.toFixed(2)} mm from the sign`);
  });

  it('typing the standard 1.5 stores nothing: the type keeps today\'s spacing', () => {
    labelAll('1.5');
    assert.ok(!('gap' in (useProjectStore.getState().annotationTypes?.[0]?.label ?? {})));
  });
});
