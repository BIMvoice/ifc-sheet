/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The engine prints the title block layout a project keeps (#54): its texts
 * resolved through the sheet's fields and parameters, placed in the block's
 * box in both positions; a project without a layout prints what it printed
 * before; a project's own parameter named like a Romanian-block field wins.
 */

import { describe, expect, it } from 'vitest';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { frameRect, titleBlockRect } from './sheet-frame.js';
import { sheetGraphic } from './sheet-graphic.js';
import { printTitleBlock } from './title-block-print.js';
import type { TitleBlockTemplate } from './title-block-template.js';

const sheet = (over: Partial<ProjectSheet> = {}): ProjectSheet => ({ id: 's1', number: 'A-101', name: 'Plan parter', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [], ...over });
const doc = (over: Partial<ProjectDocument> = {}, sheets = [sheet()]): ProjectDocument => ({
  name: 'Casă', models: [], views: [], sheets, titleBlock: { project: 'Locuință ș ț', date: '2026-10-21', phase: 'DTAC', projectManager: 'Ion Ionescu', designer: 'Ana Popescu' }, ...over,
});
const template: TitleBlockTemplate = {
  items: [
    { id: 'o', kind: 'rect', x: 0, y: 0, w: 180, h: 50, weight: 0.5 },
    { id: 'l', kind: 'line', x1: 118, y1: 0, x2: 118, y2: 50, weight: 0.35 },
    { id: 'a', kind: 'text', x: 2, y: 8, size: 3.5, text: 'Faza {ProjectPhase}, {SheetNumber} {SheetName}, {Page}' },
    { id: 'b', kind: 'text', x: 120, y: 8, size: 3.5, text: '{ProjectManager} / {DesignedBy} / {Nope}' },
    { id: 'c', kind: 'text', x: 2, y: 20, size: 3.5, text: '{Revision}{DrawnBy}' },
  ],
};
const texts = (d: ProjectDocument, s: ProjectSheet = d.sheets[0]) => sheetGraphic(s, d, new Map()).texts.map((t) => t.text);

describe('a project that keeps a title block layout', () => {
  it('prints its texts through the sheet and the title block fields, a name nothing answers to as {Name?}', () => {
    expect(texts(doc({ titleBlockTemplate: template }))).toEqual(['Faza DTAC, A-101 Plan parter, 1/1', 'Ion Ionescu / Ana Popescu / {Nope?}']);
  });

  it('a sheet\'s own field wins over the project\'s, as in the app', () => {
    const s = sheet({ titleBlock: { phase: 'PTh' } });
    expect(texts(doc({ titleBlockTemplate: template }, [s]))[0]).toBe('Faza PTh, A-101 Plan parter, 1/1');
  });

  it('draws the lines and rectangles inside the title block box, in either position', () => {
    for (const position of ['bottom-right', 'right'] as const) {
      const s = sheet({ frame: { margins: { top: 10, right: 10, bottom: 10, left: 10 }, titleBlock: position } });
      const g = sheetGraphic(s, doc({ titleBlockTemplate: template }, [s]), new Map());
      const box = titleBlockRect(g.paper, s.frame!);
      const inside = (p: { x: number; y: number }) => p.x >= box.x - 1e-9 && p.x <= box.x + box.w + 1e-9 && p.y >= box.y - 1e-9 && p.y <= box.y + box.h + 1e-9;
      const f = frameRect(g.paper, s.frame!);
      expect(g.frame.slice(1).flat().every(inside), position).toBe(true);
      expect(g.texts.every((t) => inside(t.at)), position).toBe(true);
      expect(box.x + box.w).toBe(f.x + f.w);
      expect(g.texts.every((t) => (position === 'right') === (t.angle === 90))).toBe(true);
    }
  });

  it('turns the strip a quarter, reading upward from the box\'s bottom', () => {
    const box = { x: 100, y: 20, w: 50, h: 180 };
    const { frame, texts: out } = printTitleBlock({ items: [{ id: 't', kind: 'text', x: 2, y: 8, size: 3, text: 'X' }, { id: 'l', kind: 'line', x1: 0, y1: 0, x2: 180, y2: 0, weight: 0.2 }] }, () => '', box, true);
    expect(out[0]).toMatchObject({ at: { x: 108, y: 198 }, angle: 90 });
    expect(frame[0]).toEqual([{ x: 100, y: 200 }, { x: 100, y: 20 }]);
  });

  it('a parameter of the project named like one of the new fields wins over the field', () => {
    const own: TitleBlockTemplate = { items: [{ id: 'n', kind: 'text', x: 2, y: 8, size: 3, text: 'Nr. {ProjectNumber}, faza {Phase}' }] };
    const d = doc({ titleBlockTemplate: own, titleBlock: { projectNumber: 'P-1' }, titleBlockParams: [{ name: 'ProjectNumber', value: 'vechi' }, { name: 'Phase', value: 'Studiu' }] });
    expect(texts(d)).toEqual(['Nr. vechi, faza Studiu']);
    expect(texts({ ...d, titleBlockParams: [] })).toEqual(['Nr. P-1, faza {Phase?}']);
  });
});

describe('a project without a layout', () => {
  it('prints the plain block it printed before: project, number, name, date', () => {
    expect(texts(doc())).toEqual(['Locuință ș ț', 'A-101', 'Plan parter', '2026-10-21']);
  });
});
