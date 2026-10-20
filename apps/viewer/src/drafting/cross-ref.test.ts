/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import { drawingNumbers, referenceLabel, viewReference } from './cross-ref';

/** Drawing numbers on a sheet, and the one place a mark resolves its target to "n / sheet". */

const vp = (id: string, x: number, y: number, extra: Partial<SheetViewport> = {}): SheetViewport => ({ id, viewId: `v-${id}`, x, y, scale: 100, width: 0, height: 0, center: null, ...extra });
const sheet = (number: string, viewports: SheetViewport[]): ProjectSheet => ({ id: `s-${number}`, number, name: number, createdAt: 0, viewports });
const ids = (...names: string[]) => new Set(names.map((n) => `v-${n}`));
const numbered = (s: ProjectSheet, known: Set<string>) => Object.fromEntries(drawingNumbers(s, known));

describe('drawingNumbers', () => {
  it('numbers rows top to bottom and each row left to right, whatever order the viewports are stored in', () => {
    const s = sheet('A-101', [vp('d', 300, 250), vp('b', 300, 60), vp('c', 100, 250), vp('a', 100, 55)]);
    assert.deepEqual(numbered(s, ids('a', 'b', 'c', 'd')), { a: '1', b: '2', c: '3', d: '4' });
  });

  it('reads two drawings a few millimetres out of line as one row', () => {
    const s = sheet('A-101', [vp('right', 300, 100), vp('left', 100, 112)]);
    assert.deepEqual(numbered(s, ids('left', 'right')), { left: '1', right: '2' });
  });

  it('lets a number somebody chose win, and numbers the others around it without repeating it', () => {
    const s = sheet('A-101', [vp('a', 100, 50), vp('b', 300, 50, { drawingNumber: '1' }), vp('c', 500, 50), vp('d', 700, 50, { drawingNumber: ' 4A ' })]);
    assert.deepEqual(numbered(s, ids('a', 'b', 'c', 'd')), { a: '2', b: '1', c: '3', d: '4A' });
  });

  it('numbers drawings only: a schedule placed on the sheet takes no number', () => {
    const s = sheet('A-601', [vp('door-list', 100, 50), vp('a', 300, 50)]);
    assert.deepEqual(numbered(s, ids('a')), { a: '1' });
  });
});

describe('viewReference', () => {
  const known = ids('a', 'b', 'c');
  const sheets = [sheet('A-101', [vp('a', 100, 50)]), sheet('A-301', [vp('b', 100, 50), vp('c', 300, 50)])];

  it('names the drawing number and the sheet number the view is on', () => {
    assert.equal(referenceLabel(viewReference('v-c', known, sheets)!), '2 / A-301');
  });

  it('is null for a view on no sheet', () => {
    assert.equal(viewReference('v-x', known, sheets), null);
  });

  it('names the first sheet in set order when the view is on two', () => {
    const both = [...sheets, sheet('A-302', [vp('z', 100, 50, {}), { ...vp('c2', 300, 50), viewId: 'v-b' }])];
    assert.deepEqual(viewReference('v-b', known, both), { drawing: '1', sheet: 'A-301' });
  });

  it('reads the sheet number as it is now', () => {
    const renumbered = sheets.map((s) => (s.number === 'A-301' ? { ...s, number: 'S-01' } : s));
    assert.equal(referenceLabel(viewReference('v-b', known, renumbered)!), '1 / S-01');
  });
});
