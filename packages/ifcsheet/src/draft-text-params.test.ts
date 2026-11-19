/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #832: a note on a view names the project's text values, `{Cladding}`, and the PDF and DXF print their words: one
 * note with two values shows both, changing a value changes every note that uses it, and a name nobody defined prints
 * `{Name?}`. The app's sheet resolves through the same function (`sheet-params.test.tsx` there).
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { describe, expect, it } from 'vitest';
import type { DraftEntity } from './draft-types.js';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { sheetGraphic } from './sheet-graphic.js';

const drawing = (): Drawing2D => ({
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 50 },
  lines: [],
  cutPolygons: [{ polygon: { outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }], holes: [] }, entityId: 3, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 8 } },
  stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 1, totalTriangles: 0, processingTimeMs: 0 },
});

const sheet = (id: string, extra: Partial<ProjectSheet> = {}): ProjectSheet => ({
  id, number: id, name: id, createdAt: 0, paper: 'A1', orientation: 'landscape',
  viewports: [{ id: `vp-${id}`, viewId: 'plan', x: 420, y: 297, scale: 50, width: 0, height: 0, center: null }], ...extra,
});
const note = (id: string, text: string): DraftEntity => ({ id, viewId: 'plan', layerId: '0', shape: { type: 'text', p: { x: 5, y: 4 }, text, height: 3.5, rotation: 0 }, params: {} });

/** The words printed on `s` by the engine, with `values` as the project's text values. */
function printed(s: ProjectSheet, values: { name: string; value: string }[], drafts: DraftEntity[]): string[] {
  const doc = { name: 'House', models: [], sheets: [s], views: [{ id: 'plan', kind: 'plan', name: 'Plan', createdAt: 0, level: { elevation: 0, name: 'GF' } }], titleBlockParams: values } as unknown as ProjectDocument;
  const g = sheetGraphic(s, doc, new Map([['plan', drawing()]]), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    { north: null, locale: 'en' }, { annotations: { drafts, layers: [], groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en' } });
  return g.texts.map((t) => t.text);
}

const WALL = 'Wt1 = {Cladding} over {Insulation}';

describe('linked text on a view (#832)', () => {
  it('a note with two values prints both', () => {
    const words = printed(sheet('A-1'), [{ name: 'Cladding', value: 'larch boards' }, { name: 'Insulation', value: 'rock wool' }], [note('n', WALL)]);
    expect(words).toContain('Wt1 = larch boards over rock wool');
  });

  it('changing a value changes every note that uses it, on every sheet', () => {
    const notes = [note('n1', WALL), note('n2', 'Spec: {Cladding}')];
    for (const s of [sheet('A-1'), sheet('A-2')]) {
      const words = printed(s, [{ name: 'Cladding', value: 'render' }, { name: 'Insulation', value: 'EPS' }], notes);
      expect(words).toContain('Wt1 = render over EPS');
      expect(words).toContain('Spec: render');
    }
  });

  it('a name nobody defined prints {Name?}, never nothing', () => {
    const words = printed(sheet('A-1'), [{ name: 'Cladding', value: 'x' }], [note('n', 'a {Missing} b')]);
    expect(words).toContain('a {Missing?} b');
  });

  it('a sheet\'s own value wins on that sheet only', () => {
    const values = [{ name: 'Cladding', value: 'project' }];
    expect(printed(sheet('A-1', { titleBlockParams: { Cladding: 'own' } }), values, [note('n', '{Cladding}')])).toContain('own');
    expect(printed(sheet('A-2'), values, [note('n', '{Cladding}')])).toContain('project');
  });
});
