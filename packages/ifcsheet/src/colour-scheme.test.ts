/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { PALETTES, assignColours, compareKeys, readColourScheme, schemeEntries, valueKey, valueText } from './colour-scheme.js';
import { clipPolygon } from './clip.js';

const VALUES = ['Schlafzimmer', 'Bad', 'Buero', 'Wohnen', 'Flur', 'Küche', 'Galerie', 'Technik', 'Keller'];
const shuffled = (list: readonly string[], seed: number): string[] => [...list].sort((a, b) => ((a.charCodeAt(0) * seed) % 7) - ((b.charCodeAt(0) * seed) % 7) || (a < b ? -1 : 1));

describe('the colour of a value (#92)', () => {
  it('is the same whatever order the values arrive in', () => {
    const keys = VALUES.map(valueKey);
    const first = [...assignColours(keys, {})].sort();
    for (const seed of [1, 2, 3, 5]) expect([...assignColours(shuffled(keys, seed), {})].sort()).toEqual(first);
    expect([...assignColours([...keys].reverse(), {})].sort()).toEqual(first);
  });

  it('gives each value of a set its own colour while the palette lasts, and every colour is one of the palette', () => {
    for (const palette of ['tol-light', 'okabe-ito'] as const) {
      const n = PALETTES[palette].length;
      const keys = VALUES.slice(0, n).map(valueKey);
      const colours = [...assignColours(keys, { palette }).values()];
      expect(new Set(colours).size).toBe(n);
      for (const c of colours) expect(PALETTES[palette].map((p) => p.toLowerCase())).toContain(c);
    }
  });

  it('keeps going past the palette with paler colours, still one per value', () => {
    const keys = Array.from({ length: 25 }, (_, i) => `value ${i}`);
    const colours = [...assignColours(keys, {}).values()];
    expect(new Set(colours).size).toBe(25);
  });

  it('does not depend on who else is in the set when nothing competes for its slot', () => {
    const alone = assignColours(['bad'], {}).get('bad');
    const among = assignColours(['bad', 'buero', 'wohnen'], {}).get('bad');
    // Alone it has the slot its hash picks; among others it keeps it unless one of them sorts first and picks the same.
    expect(alone).toBe(assignColours(['bad'], {}).get('bad'));
    const rivals = ['buero', 'wohnen'].filter((k) => assignColours([k], {}).get(k) === alone);
    if (rivals.length === 0) expect(among).toBe(alone);
  });

  it('lets a hand-set colour win, and keeps the other values distinct from it', () => {
    const auto = assignColours(['a', 'b', 'c'], {});
    const taken = auto.get('b')!;
    const edited = assignColours(['a', 'b', 'c'], { colours: { a: taken } });
    expect(edited.get('a')).toBe(taken);
    expect(new Set(edited.values()).size).toBe(3);
  });

  it('treats the spellings of a value as one, and reads the text of the values a property holds', () => {
    expect(valueKey('  Küche ')).toBe(valueKey('KÜCHE'));
    expect(valueText(true)).toBe('true');
    expect(valueText(['A', ' B '])).toBe('A, B');
    expect(valueText({ value: 12 })).toBe('12');
    expect(valueText('  ')).toBeNull();
    expect(valueText(undefined)).toBeNull();
    expect(valueText(Number.NaN)).toBeNull();
    expect(['b10', 'b9', 'B2'].sort(compareKeys)).toEqual(['B2', 'b9', 'b10']);
  });
});

describe('the entries a view lists (#92)', () => {
  const found = (...keys: string[]) => new Map(keys.map((k, i) => [k, { label: k.toUpperCase(), ids: new Set([i]) }] as const));

  it('are the values found, in the settled order, with their colours', () => {
    const entries = schemeEntries(found('b', 'a', 'c'), {});
    expect(entries.map((e) => e.key)).toEqual(['a', 'b', 'c']);
    expect(entries.map((e) => e.label)).toEqual(['A', 'B', 'C']);
  });

  it('leave out a value the scheme keeps a colour for but the view does not show', () => {
    const entries = schemeEntries(found('a', 'b'), { colours: { z: '#123456', a: '#abcdef' } });
    expect(entries.map((e) => e.key)).toEqual(['a', 'b']);
    expect(entries.find((e) => e.key === 'a')!.colour).toBe('#abcdef');
  });
});

describe('a scheme read from a project file (#92)', () => {
  it('keeps a valid one and drops what is malformed', () => {
    expect(readColourScheme({ property: ' LongName ', target: 'rooms' })).toEqual({ property: 'LongName', target: 'rooms' });
    expect(readColourScheme({ property: 'P.Q', target: 'elements', classes: ['IfcWall', 3, ''], colours: { a: '#ABCDEF', b: 'red', c: 5 }, palette: 'okabe-ito' }))
      .toEqual({ property: 'P.Q', target: 'elements', classes: ['IfcWall'], colours: { a: '#abcdef' }, palette: 'okabe-ito' });
    expect(readColourScheme({ property: 'P.Q', target: 'elements', palette: 'nope' })).toEqual({ property: 'P.Q', target: 'elements' });
    for (const bad of [null, [], 'x', {}, { property: '', target: 'rooms' }, { property: 'A', target: 'floors' }, { target: 'rooms' }]) expect(readColourScheme(bad)).toBeUndefined();
  });
});

describe('a fill clipped to its viewport (#92)', () => {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  it('stays whole inside, and is cut to the box as one closed shape across a side', () => {
    const inside = [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }];
    expect(clipPolygon(inside, box)).toEqual(inside);
    const across = clipPolygon([{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 8 }, { x: 5, y: 8 }], box);
    expect(Math.max(...across.map((p) => p.x))).toBe(10);
    expect(across.length).toBe(4);
    expect(clipPolygon([{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }], box)).toEqual([]);
  });
});
