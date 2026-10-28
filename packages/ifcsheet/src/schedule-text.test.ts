/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import {
  addTextRow, MAX_TEXT_LENGTH, MAX_TEXT_ROWS, orphanCells, readScheduleTextRows, removeTextRow, renameTextRow, setTextCell, textCellText, textRowsOf,
  type ScheduleTextRow, type TextHolder,
} from './schedule-text.js';

const filled = (): ScheduleTextRow[] => {
  let rows = addTextRow(undefined, 'r1', 'Manufacturer');
  rows = setTextCell(rows, 'r1', 'type-a', 'Rehau', 'D1 Door');
  rows = setTextCell(rows, 'r1', 'type-b', 'Velux', 'W1 Window');
  return rows;
};

describe('text cells (#186)', () => {
  it('a cell is keyed by the type, so adding or reordering types cannot move it', () => {
    const rows = filled();
    // Types listed in another order, a new one in front: the same keys read the same text.
    const keysNow = ['type-new', 'type-b', 'type-a'];
    expect(keysNow.map((k) => textCellText(rows[0], k))).toEqual(['', 'Velux', 'Rehau']);
  });

  it('empty text clears the cell instead of keeping an empty one', () => {
    const rows = setTextCell(filled(), 'r1', 'type-a', '   ', '');
    expect(Object.keys(rows[0].cells)).toEqual(['type-b']);
  });

  it('text is one clean line of bounded length', () => {
    const rows = setTextCell(addTextRow(undefined, 'r', 'L'), 'r', 'k', `a\n\tb   c${'x'.repeat(500)}`, '');
    expect(rows[0].cells.k.text.startsWith('a b c')).toBe(true);
    expect(rows[0].cells.k.text.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
  });

  it('editing does not mutate its input', () => {
    const before = filled();
    const snapshot = JSON.stringify(before);
    setTextCell(before, 'r1', 'type-a', 'other', '');
    renameTextRow(before, 'r1', 'x');
    removeTextRow(before, 'r1');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('a schedule holds a bounded number of rows, with unique ids', () => {
    let rows: ScheduleTextRow[] = [];
    for (let i = 0; i < MAX_TEXT_ROWS + 3; i++) rows = addTextRow(rows, `r${i}`, `Row ${i}`);
    expect(rows).toHaveLength(MAX_TEXT_ROWS);
    expect(addTextRow(rows.slice(0, 1), 'r0', 'again')).toHaveLength(1);
  });

  it('a key that would write the prototype is refused', () => {
    const rows = setTextCell(addTextRow(undefined, 'r', 'L'), 'r', '__proto__', 'x', '');
    expect(Object.keys(rows[0].cells)).toEqual([]);
    expect(textCellText(rows[0], 'toString')).toBe('');
  });

  describe('when the keyed type disappears from the model', () => {
    it('its text is kept and reported as an orphan with what it described, not printed, and the others are untouched', () => {
      const orphans = orphanCells(filled(), new Set(['type-b']));
      expect(orphans).toEqual([{ rowId: 'r1', rowLabel: 'Manufacturer', key: 'type-a', text: 'Rehau', about: 'D1 Door' }]);
    });

    it('removing the orphan removes only that cell; the text comes back if the type does', () => {
      const rows = setTextCell(filled(), 'r1', 'type-a', '', '');
      expect(orphanCells(rows, new Set(['type-b']))).toEqual([]);
      expect(textCellText(rows[0], 'type-b')).toBe('Velux');
      // A type that is gone for one load and back for the next reads its text again.
      expect(textCellText(filled()[0], 'type-a')).toBe('Rehau');
    });
  });

  describe('which schedule\'s text a schedule prints', () => {
    const parent: TextHolder = { id: 'p', textRows: filled() };
    const part: TextHolder = { id: 'c', sub: { parent: 'p' }, textRows: addTextRow(undefined, 'own', 'Own') };

    it('a sub-report prints its parent\'s text', () => {
      expect(textRowsOf([parent, part], part)).toBe(parent.textRows);
    });
    it('a sub-report whose parent is gone prints its own', () => {
      expect(textRowsOf([part], part)).toBe(part.textRows);
    });
    it('none when there are none', () => {
      expect(textRowsOf([{ id: 'x' }], { id: 'x' })).toBeUndefined();
      expect(textRowsOf([{ id: 'x', textRows: [] }], { id: 'x' })).toBeUndefined();
    });
  });

  describe('reading what was saved', () => {
    it('absent or damaged is no rows, so an old project is an ordinary schedule', () => {
      for (const raw of [undefined, null, 'x', 3, {}, []]) expect(readScheduleTextRows(raw)).toBeUndefined();
    });

    it('round-trips', () => {
      expect(readScheduleTextRows(JSON.parse(JSON.stringify(filled())))).toEqual(filled());
    });

    it('drops what is damaged and keeps the rest', () => {
      const rows = readScheduleTextRows(JSON.parse(`[
        { "id": "a", "label": 7, "cells": { "k1": { "text": "ok", "about": 4 }, "k2": { "text": "" }, "k3": "plain", "__proto__": { "text": "x" } } },
        { "label": "no id" }, { "id": "a", "label": "duplicate id" }, null, { "id": "b", "cells": "x" }
      ]`));
      expect(rows).toEqual([
        { id: 'a', label: '', cells: { k1: { text: 'ok', about: '' }, k3: { text: 'plain', about: '' } } },
        { id: 'b', label: '', cells: {} },
      ]);
      expect(Object.getPrototypeOf(rows![0].cells)).toBe(Object.prototype);
    });
  });
});
