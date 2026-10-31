/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL on a plan the way a real model cuts it (#632): walls in material layers, doors and windows with frames that
 * reach past their gap, rooms with their labels and doors with their tags. The plan reads as a plan: at most three
 * strings a side, outside the building, nothing per layer, the openings and the overall measured as the model has them,
 * and no line or figure over a label or a tag.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dimensionLayout, textBox, withAnnotationFrame } from '@/drafting/annotation';
import { textBlock } from '@/drafting/text-block';
import { newDraft } from '@/drafting/draft-store';
import { clearDraftHistory, editDrafts } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, setPlanPartsProvider, setWorkPlaneProvider, submitCommandLine, useDraftingSession } from '@/drafting/session.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import type { Pt } from '@/drafting/types';
import { layeredHouse, notched } from './fixture.js';
import { planDimensions } from './plan';
import { pointInRing } from './outline';

const view = { id: 'view-1', kind: 'plan', scale: 100 } as unknown as ProjectView;
const HEIGHT = 0.25;

interface Box { x0: number; y0: number; x1: number; y1: number }
const boxOf = (pts: readonly Pt[]): Box => ({ x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) });
const meet = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
/** Whether the segment a-b crosses the box (sampled, a box is much wider than the step). */
const crosses = (a: Pt, b: Pt, box: Box) => Array.from({ length: 201 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / 200, y: a.y + ((b.y - a.y) * i) / 200 })).some((p) => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1);

/** What the plan carries over the walls: room names with their areas in the two rooms, a door tag on each side of the door of the cross wall, a tag outside the south door. */
const LABELS: { at: Pt; text: string }[] = [
  { at: { x: 1.4, y: 3 }, text: 'Living room' }, { at: { x: 1.4, y: 3.4 }, text: '18.36 m²' },
  { at: { x: 4.8, y: 3 }, text: 'Kitchen' }, { at: { x: 4.8, y: 3.4 }, text: '19.98 m²' },
  { at: { x: 3.4, y: 1.45 }, text: 'D02' },
  { at: { x: 1.95 - textBlock('D01', HEIGHT).outer.x1 / 2, y: -0.8 }, text: 'D01' },
];
/** A window tag placed out on its leader, across where the first string stands by default: wider than its window, so the extension lines of the window's two edges cannot miss it if it stands between the building and the string. */
const FAR_TAG = { at: { x: 5.75, y: -1.95 }, text: 'Window' };
const labelBoxes = (): Box[] => LABELS.map((l) => boxOf(textBox(l.at, l.text, HEIGHT, 0)));

const dims = () => useProjectStore.getState().drafts.filter((d) => d.shape.type === 'dimension');

/** Every piece of a dimension that is drawn: its lines, and the box of its figure. */
function drawn(d: ReturnType<typeof dims>[number]): { lines: { a: Pt; b: Pt }[]; text: Box } {
  if (d.shape.type !== 'dimension') throw new Error('not a dimension');
  const shape = d.shape;
  return withAnnotationFrame(-1, 1, () => {
    const layout = dimensionLayout(shape);
    // The figure is centred on its anchor, as wide as its text and as tall as the text: the box is turned with the text.
    const half = textBlock(layout.label, shape.height).outer.x1 / 2, across = shape.height * 0.6;
    const [c, s] = [Math.cos(layout.textAngle), Math.sin(layout.textAngle)];
    const corners = [[-half, -across], [half, -across], [half, across], [-half, across]].map(([u, v]) => ({ x: layout.textAt.x + u * c - v * s, y: layout.textAt.y + u * s + v * c }));
    return { lines: layout.lines, text: boxOf(corners) };
  });
}

const length = (d: ReturnType<typeof dims>[number]) => (d.shape.type === 'dimension' ? Math.hypot(d.shape.b.x - d.shape.a.x, d.shape.b.y - d.shape.a.y) : NaN);
const facadeOfStamp = (d: ReturnType<typeof dims>[number]) => String(d.params.dimAll).split('|')[0].replace(/^[a-z]+:/, '');
const kindOfStamp = (d: ReturnType<typeof dims>[number]) => String(d.params.dimAll).split(':')[0];

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
  setWorkPlaneProvider(() => null, () => view);
  setPlanPartsProvider(() => layeredHouse());
  // The labels TAGALL places first: DIMALL reads them off the view.
  editDrafts({ add: [...LABELS, FAR_TAG].map((l) => newDraft('view-1', 'layer-1', { type: 'text', p: l.at, text: l.text, height: HEIGHT, rotation: 0 })) });
});

describe('DIMALL on a plan cut with material layers (#632)', () => {
  it('draws at most three strings a side: openings, then walls, then overall, evenly spaced', () => {
    submitCommandLine('DIMALL', null);
    const sides = new Map<string, Set<string>>();
    for (const d of dims()) sides.set(facadeOfStamp(d), (sides.get(facadeOfStamp(d)) ?? new Set()).add(kindOfStamp(d)));
    assert.equal(sides.size, 4, 'four sides of the building');
    for (const kinds of sides.values()) assert.ok(kinds.size <= 3 && kinds.has('overall') && kinds.has('inner'), [...kinds].join());
    const plan = planDimensions(layeredHouse(), { paperUnit: 0.1, textHeight: HEIGHT });
    for (const side of new Set(plan.strings.map((s) => s.key.split(':')[1]))) {
      const offsets = plan.strings.filter((s) => s.key.split(':')[1] === side).map((s) => s.offset).sort((a, b) => a - b);
      const gaps = offsets.slice(1).map((o, i) => o - offsets[i]);
      assert.ok(gaps.every((g) => Math.abs(g - gaps[0]) < 1e-9), `${side}: ${offsets.join()}`);
    }
  });

  it('draws no string per material layer: no 0.14, 0.12 or 0.04 span anywhere', () => {
    submitCommandLine('DIMALL', null);
    const lengths = dims().map((d) => Math.round(length(d) * 100) / 100);
    assert.ok(lengths.length > 10);
    for (const layer of [0.14, 0.12, 0.04, 0.26]) assert.ok(!lengths.includes(layer), `a ${layer} chain: ${lengths.join()}`);
  });

  it('measures the openings and the overall as the model has them', () => {
    submitCommandLine('DIMALL', null);
    const lengths = dims().map((d) => Math.round(length(d) * 100) / 100);
    // The door (0.90, not the 0.95 its stops reach), the windows (0.60, 0.50, 0.60, 0.80), the walls 0.30, the overall 8.00 and 6.00.
    for (const want of [0.9, 0.8, 0.6, 0.5, 0.3, 8, 6]) assert.ok(lengths.includes(want), `${want} in ${lengths.join()}`);
    assert.ok(!lengths.includes(0.95), 'the door is its gap, not its stops');
    assert.equal(lengths.filter((l) => l === 8).length, 2, 'the overall of the south and north sides');
    assert.equal(lengths.filter((l) => l === 6).length, 2, 'the overall of the west and east sides');
  });

  it('stands every line and figure outside the building', () => {
    submitCommandLine('DIMALL', null);
    const building: Box = { x0: 0, y0: 0, x1: 8, y1: 6 };
    for (const d of dims()) {
      const { lines, text } = drawn(d);
      assert.ok(!meet(text, building), `figure of ${JSON.stringify(d.shape)} inside the building`);
      for (const l of lines) assert.ok(!crosses(l.a, l.b, building), `line of ${JSON.stringify(d.shape)} inside the building`);
    }
  });

  it('draws nothing over a room label or a tag', () => {
    submitCommandLine('DIMALL', null);
    const labels = labelBoxes();
    assert.ok(dims().length > 10);
    for (const d of dims()) {
      const { lines, text } = drawn(d);
      for (const box of labels) {
        assert.ok(!meet(text, box), `figure ${JSON.stringify(text)} over a label`);
        for (const l of lines) assert.ok(!crosses(l.a, l.b, box), `line ${JSON.stringify(l)} over a label`);
      }
    }
  });

  it('stands the strings beyond a tag that is out on its leader: no dimension line, no figure over it', () => {
    submitCommandLine('DIMALL', null);
    const far = boxOf(textBox(FAR_TAG.at, FAR_TAG.text, HEIGHT, 0));
    for (const d of dims()) {
      if (d.shape.type !== 'dimension') continue;
      const { lines, text } = drawn(d);
      assert.ok(!meet(text, far), 'a figure over the tag');
      // The dimension line itself (parallel to what it measures) stays clear; its extension lines run from the walls to it.
      const along = { x: d.shape.b.x - d.shape.a.x, y: d.shape.b.y - d.shape.a.y };
      for (const l of lines.filter((l) => Math.abs((l.b.x - l.a.x) * along.y - (l.b.y - l.a.y) * along.x) < 1e-6)) assert.ok(!crosses(l.a, l.b, far), 'a dimension line over the tag');
    }
  });

  it('leaves no figure over another dimension line or figure', () => {
    submitCommandLine('DIMALL', null);
    const all = dims().map(drawn);
    all.forEach((a, i) => {
      for (const l of all.flatMap((b, j) => (j === i ? [] : b.lines))) assert.ok(!crosses(l.a, l.b, a.text), `a figure ${JSON.stringify(a.text)} crossed by a line`);
      all.forEach((b, j) => { if (j > i) assert.ok(!meet(a.text, b.text), 'two figures overprint'); });
    });
  });
});

describe('DIMALL on a plan with a notch (#632)', () => {
  it('leaves out the strings that would run through the building, and counts them', () => {
    const plan = planDimensions(notched(), { paperUnit: 0.1, textHeight: HEIGHT });
    assert.ok(plan.droppedStrings > 0, 'the facades of the notch are left out');
    const loop = plan.outline;
    for (const s of plan.strings) {
      const a = s.points[0], b = s.points[s.points.length - 1];
      for (let i = 0; i <= 20; i++) {
        const p = { x: a.x + ((b.x - a.x) * i) / 20 + s.outward.x * s.offset, y: a.y + ((b.y - a.y) * i) / 20 + s.outward.y * s.offset };
        assert.ok(!pointInRing(p, loop), `${s.key} runs through the building at ${JSON.stringify(p)}`);
      }
    }
  });

  it('says so on the command line', () => {
    setPlanPartsProvider(() => notched());
    submitCommandLine('DIMALL', null);
    assert.ok(dims().length > 0);
    const said = useDraftingSession.getState().history.find((h) => h.key === 'drafting.msg.dimAllDropped');
    assert.ok(said && Number(said.params?.count) > 0, 'the command reports the strings it left out');
  });
});
