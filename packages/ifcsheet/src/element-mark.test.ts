/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The one mark of a door or window (#631): its order of sources and the Mark cell of a type whose elements carry different Tags. */
import { describe, expect, it } from 'vitest';
import { fitText } from './title-block-template.js';
import { elementMark, markCell, markIndex, markKey, tagMark, type MarkedEntry } from './element-mark.js';

const entry = (mark: string, tags: (string | null)[], key = 'k'): MarkedEntry => ({ key, mark, occurrences: tags.map((tag, i) => ({ modelId: 'm', expressId: i + 1, tag })) });

describe('elementMark', () => {
  it('takes the typed mark, else the Tag, else the type mark', () => {
    expect(elementMark({ tag: 'D01', typeMark: 'D1', override: 'X' })).toBe('X');
    expect(elementMark({ tag: 'D01', typeMark: 'D1' })).toBe('D01');
    expect(elementMark({ tag: null, typeMark: 'D1' })).toBe('D1');
    expect(elementMark({ tag: '  ', typeMark: 'W1' })).toBe('W1');
  });
  it('never makes a mark of a unique id, and has none when the type has none', () => {
    expect(tagMark('E605AACB-6C4E-458D-93-46-5D9D8C7C21D3')).toBe('');
    expect(elementMark({ tag: '2FxDW7j3aRrZeBqKv1jFaU', typeMark: 'D3' })).toBe('D3');
    expect(elementMark({ tag: null, typeMark: '—' })).toBe('');
  });
});

describe('which Tags are a mark (#631 review)', () => {
  it.each([
    ['123456', ''], ['312456', ''], ['1234567890', ''], ['2FxDW7j3aRrZeBqKv1jFaU', ''], ['E605AACB-6C4E-458D-93-46-5D9D8C7C21D3', ''],
    ['3f2504e0-4f89-11d3-9a0c-0305e82c3301', ''], ['3F2504E04F8911D39A0C0305E82C3301', ''], ['', ''], ['   ', ''],
    ['12', '12'], ['101', '101'], ['0042', '0042'], ['12345', '12345'], ['D-01', 'D-01'], [' D01 ', 'D01'], ['T-101A', 'T-101A'],
  ])('tag %j reads %j', (tag, expected) => {
    expect(tagMark(tag)).toBe(expected);
  });
  it('falls back to the type mark for a machine number', () => {
    expect(elementMark({ tag: '312456', typeMark: 'D2' })).toBe('D2');
    expect(elementMark({ tag: '101', typeMark: 'D2' })).toBe('101');
  });
});

describe('the Mark cell of a type', () => {
  it('stays inside the card when forty doors carry forty Tags', () => {
    const tags = Array.from({ length: 40 }, (_, i) => `D${String(i + 1).padStart(2, '0')}`);
    const cell = markCell(entry('D1', tags), undefined, []);
    expect(cell.split(', ')).toHaveLength(40);
    const fitted = fitText({ size: 4, fit: 30, bold: true }, cell);
    expect(fitted.size).toBeGreaterThanOrEqual(2);
    expect(fitted.text.length).toBeLessThan(cell.length);
    expect(fitted.text.startsWith('D01, D02')).toBe(true);
  });
  it('lists each mark its elements are found under, once, in order', () => {
    expect(markCell(entry('D1', ['D01', 'D02', 'D01']), undefined, [])).toBe('D01, D02');
    expect(markCell(entry('D1', ['D01', null]), undefined, [])).toBe('D01, D1');
    expect(markCell(entry('W1', [null, null]), undefined, [])).toBe('W1');
    expect(markCell(entry('—', [null]), undefined, [])).toBe('—');
  });
  it('is the typed mark when the user typed one, over every Tag', () => {
    const e = entry('D1', ['D01', 'D02']);
    const overrides = [{ type: 'k', row: 'mark', value: 'DX', about: '' }];
    expect(markCell(e, overrides, [e])).toBe('DX');
    expect(markIndex([e], overrides).get(markKey('m', 1))).toBe('DX');
  });
});
