/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #619: the section reference ("1 / A-301" under a section symbol's letter) and the elevation marks round the ground plan are made by the
 * engine from the document's views and sheets, so a sheet printed without the app carries them.
 */

import { describe, expect, it } from 'vitest';
import type { ProjectSheet, ProjectView, SheetViewport } from './document.js';
import type { DraftEntity } from './draft-types.js';
import { crossRefAnnotations } from './sheet-cross-refs.js';
import { SECTION_LINK } from './cross-ref/section-geometry.js';

const plan = { id: 'plan', kind: 'plan', name: 'Ground floor', createdAt: 0, scale: 100, cutHeight: 1.2, level: { name: 'EG', elevation: 0, storeyGlobalIds: [] } } as ProjectView;
const section = { id: 'sec', kind: 'section', name: 'Section A-A', createdAt: 0 } as ProjectView;
const south = { id: 'south', kind: 'elevation', name: 'South', direction: 'south', createdAt: 0 } as ProjectView;
const views = [plan, section, south];

const vp = (id: string, viewId: string): SheetViewport => ({ id, viewId, x: 100, y: 100, scale: 100, width: 0, height: 0, center: null });
const sheet = (number: string, viewports: SheetViewport[]): ProjectSheet => ({ id: `s-${number}`, number, name: number, createdAt: 0, viewports });
const sheets = [sheet('A-101', [vp('p', 'plan')]), sheet('A-201', [vp('e', 'south')]), sheet('A-301', [vp('s', 'sec')])];
const doc = { views, sheets };

/** A section symbol on the plan: the cut line, its first stem and the letter at the stem's end (the order `sectionSymbolShapes` makes them in). */
const symbol: DraftEntity[] = [
  { id: 'cut', viewId: 'plan', layerId: '0', shape: { type: 'line', a: { x: 2, y: 5 }, b: { x: 8, y: 5 } }, params: { [SECTION_LINK]: 'sec' } },
  { id: 'stem', viewId: 'plan', layerId: '0', shape: { type: 'line', a: { x: 2, y: 5 }, b: { x: 2, y: 4 } }, params: { [SECTION_LINK]: 'sec' } },
  { id: 'letter', viewId: 'plan', layerId: '0', shape: { type: 'text', p: { x: 1.9, y: 3.7 }, text: 'A', height: 0.25, rotation: 0 }, params: { [SECTION_LINK]: 'sec' } },
];
const bounds = { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } };
const input = (drawingBounds = bounds) => ({ doc, vp: vp('p', 'plan'), drawing: { bounds: drawingBounds }, symbols: undefined, locale: 'en' as const });
const texts = (drafts: readonly DraftEntity[] | undefined) => (drafts ?? []).flatMap((d) => (d.shape.type === 'text' ? [d.shape.text] : [])).sort();

describe('the cross-reference marks of a plan viewport (#619)', () => {
  it('makes the section reference and the elevation mark of the plan, naming the drawing and its sheet', () => {
    const made = crossRefAnnotations({ drafts: symbol, layers: [], groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en' }, input());
    expect(texts(made?.drafts)).toEqual(['1 / A-201', '1 / A-301']);
  });

  it('draws the elevation mark of a set that carries no drafts, on the standard layer', () => {
    const made = crossRefAnnotations(undefined, input());
    expect(texts(made?.drafts)).toEqual(['1 / A-201']);
    expect(made?.layers.map((l) => l.id)).toEqual(['0']);
  });

  it('prints no reference for a section on no sheet', () => {
    const lone = { ...input(), doc: { views, sheets: sheets.filter((s) => s.number !== 'A-301') } };
    expect(texts(crossRefAnnotations({ drafts: symbol, layers: [], groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en' }, lone)?.drafts)).toEqual(['1 / A-201']);
  });

  it('leaves another view of the sheet as it is', () => {
    const other = { ...input(), vp: vp('s', 'sec') };
    expect(crossRefAnnotations(undefined, other)).toBeNull();
  });
});
