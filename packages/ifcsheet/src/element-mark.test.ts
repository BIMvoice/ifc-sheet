/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The one mark of a door or window (#631): its order of sources and the Mark cell of a type whose elements carry different Tags. */
import { describe, expect, it } from 'vitest';
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

describe('the Mark cell of a type', () => {
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
