/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A line style override on a line of the model drawing (#189): the styled line and the sheet's pen groups use the new pen, by the line's key. */

import { describe, expect, it } from 'vitest';
import { penGroups } from './drawing-pens.js';
import { hiddenLineEntry, withoutElements } from './element-graphics.js';
import { readElementGraphics } from './view-graphics-read.js';
import { CENTRE_DASH_MM, PEN_TABLE, viewStyler, type StyleItem } from './view-style.js';
import type { ViewGraphics } from './view-graphics-types.js';

const WALL = '2O2Fr$t4X7Zf8NOew3FLOH';
const OTHER = '3cUkl32yn9qRSPvBJVyWYp';
const ends = { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } };
const line = (entityId: number, e = ends): StyleItem => ({ entityId, ifcType: 'IfcWall', category: 'projection', line: e });
const globalIdOf = (id: number) => (id === 1 || id === 11 ? WALL : OTHER);
const graphics = (over: ViewGraphics['lineStyles']): ViewGraphics => ({ lineStyles: over });
const key = hiddenLineEntry(WALL, ends);

describe('line style override (#189)', () => {
  it('draws the one line in the chosen weight, dash and colour and its neighbours as before', () => {
    const g = graphics({ [key]: { weight: 'heavy', type: 'centre', color: '#ff0000' } });
    const s = viewStyler({ graphics: g, globalIdOf });
    const styled = s.line(line(1));
    expect(styled.weight).toBe(PEN_TABLE.weights.heavy.projection);
    expect(styled.dash).toEqual(CENTRE_DASH_MM);
    expect(styled.stroke).toBe('#ff0000');
    const plain = viewStyler({ graphics: undefined, globalIdOf }).line(line(1));
    expect(s.line(line(2))).toEqual(plain);
    expect(s.line(line(1, { start: { x: 0, y: 1 }, end: { x: 4, y: 1 } }))).toEqual(plain);
  });

  it('survives regeneration: a rebuilt drawing (another express id, the end points the other way round) gets the same pen', () => {
    const s = viewStyler({ graphics: graphics({ [key]: { type: 'dashed' } }), globalIdOf });
    expect(s.line(line(11, { start: ends.end, end: ends.start })).dash).toEqual([3, 1.5]);
  });

  it('groups the restyled line into a pen of its own for the sheet, the PDF and the DXF, hidden lines too', () => {
    const s = viewStyler({ graphics: graphics({ [key]: { weight: 'heavy', type: 'hidden', color: '#00aa00' } }), globalIdOf });
    const hidden = (entityId: number, e = ends): StyleItem => ({ ...line(entityId, e), visibility: 'hidden', category: 'hidden' });
    const groups = penGroups([], [line(1), line(2), hidden(1), hidden(2, { start: { x: 0, y: 2 }, end: { x: 4, y: 2 } })], s);
    const pens = groups.filter((p) => p.stroke === '#00aa00');
    expect(pens.map((p) => p.layer).sort()).toEqual(['HIDDEN', 'SEEN']);
    for (const pen of pens) {
      expect(pen.width).toBe(PEN_TABLE.weights.heavy.projection);
      expect(pen.dash).toBe('1.5 1');
      expect(pen.lines).toHaveLength(1);
    }
    expect(groups.filter((p) => p.stroke !== '#00aa00').flatMap((p) => p.lines)).toHaveLength(2);
  });

  it('is read back from a saved project, and dropped with the element it belongs to', () => {
    const read = readElementGraphics({ lineStyles: { [key]: { weight: 'light', type: 'centre', color: '#112233', junk: 1 }, bad: { type: 'dashed' }, [hiddenLineEntry(OTHER, ends)]: { type: 'nope' } } });
    expect(read.lineStyles).toEqual({ [key]: { weight: 'light', type: 'centre', color: '#112233' } });
    expect(withoutElements({ lineStyles: read.lineStyles }, [WALL]).lineStyles).toBeUndefined();
  });
});
