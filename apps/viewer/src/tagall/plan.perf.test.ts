/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * TAGALL on a large plan: 500 labels (400 doors and windows, 100 rooms) among
 * 50 000 lines the drawing shows must be placed in seconds. Every candidate
 * place of every label is tested against what the plan draws; against a flat
 * list that is labels x places x pieces of lines, minutes at this size. The
 * bound is ten times what the indexed version needs here.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject } from '@/project/project-store';
import { wall } from '@/labels/label-fixture.js';
import type { LabelElement } from '@/labels/label-resolve.js';
import type { LabelTarget } from '@/labels/label-place.js';
import type { ViewElement } from '@/labels/view-elements.js';
import type { SymbolPiece } from '@/dimall/avoid';
import type { Pt } from '@/drafting/types';
import { planTagAll } from './plan.js';
import { TAGALL_TYPES } from './types.js';

const SCALE = Number(process.env.TAGALL_PERF_SCALE ?? 1);
const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const rnd = (() => { let s = 11; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
const [mark, room] = TAGALL_TYPES;

const opening = (className: string, name: string): LabelElement => wall({ className: () => className, attribute: (n) => (n === 'Name' ? name : ''), propertySets: () => [], quantitySets: () => [], typePropertySets: () => [] });
const space = (name: string): LabelElement => wall({ className: () => 'IfcSpace', attribute: (n) => (n === 'Name' ? name : ''), propertySets: () => [], typePropertySets: () => [], quantitySets: () => [] });

beforeEach(() => resetProject());

describe('TAGALL at a large size', () => {
  it('places 500 labels among 50 000 lines of drawing in seconds', () => {
    const side = Math.round(10 * Math.sqrt(SCALE)); // rooms per side: 10 x 10 = 100 rooms
    const model = new Map<string, LabelElement>();
    const elements: ViewElement[] = [];
    const targets: LabelTarget[] = [];
    const rooms: { renderId: number; guid: string; ring: Pt[]; at: 'cut' }[] = [];
    let id = 1;
    for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) {
      const x = i * 6, y = j * 6;
      const guid = `S${i}-${j}`;
      model.set(guid, space(`Room ${i}-${j}`));
      rooms.push({ renderId: id++, guid, ring: box(x + 0.3, y + 0.3, x + 5.7, y + 5.7), at: 'cut' });
      for (let k = 0; k < 4; k++) {
        const door = k % 2 === 0;
        const g = `${door ? 'D' : 'W'}${i}-${j}-${k}`;
        model.set(g, opening(door ? 'IfcDoor' : 'IfcWindow', `${door ? 'Door' : 'Window'} ${k}`));
        const ring = k < 2 ? box(x + 1 + k * 2, y, x + 2 + k * 2, y + 0.3) : box(x, y + 1 + (k - 2) * 2, x + 0.3, y + 2 + (k - 2) * 2);
        const anchor = { x: (ring[0].x + ring[2].x) / 2, y: (ring[0].y + ring[2].y) / 2 };
        const renderId = id++;
        elements.push({ renderId, anchor, ring });
        targets.push({ guid: g, className: door ? 'IfcDoor' : 'IfcWindow', anchor, renderId, ring });
      }
    }
    const span = side * 6;
    const linework: SymbolPiece[] = Array.from({ length: Math.round(50_000 * SCALE) }, () => {
      const a = { x: rnd() * span, y: rnd() * span };
      return { kind: 'cut' as const, a, b: { x: a.x + (rnd() - 0.5), y: a.y + (rnd() - 0.5) } };
    });
    const started = performance.now();
    const { drafts, summary } = planTagAll({
      elements, targets, rooms, existing: [],
      placement: { viewId: 'v', layerId: 'l', textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard', paperUnit: 0.1 },
      types: { mark, room }, read: (g) => model.get(g) ?? null, obstacles: { drawn: [], linework },
    });
    const ms = performance.now() - started;
    console.log(`TAGALL perf: ${drafts.length} labels among ${linework.length} lines in ${Math.round(ms)} ms`);
    assert.equal(summary.marks, 4 * side * side);
    assert.equal(summary.rooms, side * side);
    assert.ok(ms < 5_000, `took ${Math.round(ms)} ms`);
  });
});
