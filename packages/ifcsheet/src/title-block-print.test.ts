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
import { DEFAULT_FRAME, frameRect, titleBlockRect } from './sheet-frame.js';
import { sheetGraphic } from './sheet-graphic.js';
import { printTitleBlock } from './title-block-print.js';
import { standardTitleBlock } from './title-block-standard.js';
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

describe('the standard layout\'s placements (what the app drew before the engine took it over)', () => {
  const items = standardTitleBlock().items;
  const text = (t: string) => items.find((i) => i.kind === 'text' && i.text === t);

  it('is 180 x 50 mm, its cells in rows of 10 mm, the sheet number and scale in the right-hand 50 mm', () => {
    expect(items[0]).toMatchObject({ kind: 'rect', x: 0, y: 0, w: 180, h: 50, weight: 0.5 });
    expect(items.filter((i) => i.kind === 'line').map((l) => (l.kind === 'line' ? [l.x1, l.y1, l.x2, l.y2] : []))).toEqual([
      [0, 10, 130, 10], [0, 20, 130, 20], [0, 30, 130, 30], [0, 40, 130, 40], [65, 0, 65, 20], [65, 30, 65, 50], [130, 0, 130, 50], [130, 14, 180, 14], [130, 34, 180, 34],
    ]);
    expect(items.find((i) => i.kind === 'logo')).toMatchObject({ x: 132, y: 1.5, w: 46, h: 11 });
  });

  it('puts each caption 3.2 mm and each value 8 mm below its row\'s top, 2 mm in from its cell', () => {
    expect(text('Project')).toMatchObject({ x: 2, y: 3.2, size: 2, muted: true });
    expect(text('{Project}')).toMatchObject({ x: 2, y: 8, size: 3.5, fit: 61 });
    expect(text('{Address}')).toMatchObject({ x: 67, y: 8, size: 3.5, fit: 61 });
    expect(text('{SheetName}')).toMatchObject({ x: 2, y: 28, size: 3.5 });
    expect(text('{Revision}')).toMatchObject({ x: 67, y: 48, size: 3.5, fit: 61 });
    expect(text('{SheetNumber}')).toMatchObject({ x: 132, y: 29.5, size: 9, bold: true });
    expect(text('{Scale}')).toMatchObject({ x: 132, y: 45.5, size: 4.5 });
  });
});

describe('a project without a layout', () => {
  it('prints the app\'s standard layout: captions, then the project, sheet name, date, sheet number and scale', () => {
    expect(texts(doc())).toEqual([
      'Project', 'Locuință ș ț', 'Address', 'Client', 'Organisation', 'Title', 'Plan parter', 'Drawn by', 'Checked by', 'Date', '2026-10-21', 'Revision', 'Sheet no.', 'A-101', 'Scale', '\u2014',
    ]);
  });

  it('prints it where a layout of the same items would go: the standard layout is the default, not a second drawing', () => {
    const d = doc();
    const g = sheetGraphic(d.sheets[0], d, new Map());
    const box = titleBlockRect(g.paper, d.sheets[0].frame ?? DEFAULT_FRAME);
    const same = printTitleBlock(standardTitleBlock(), (n) => ({ SheetNumber: 'A-101' })[n] ?? '', box, false);
    expect(g.frame.slice(1)).toEqual(same.frame);
    expect(g.texts.map((t) => t.at)).toEqual(expect.arrayContaining(same.texts.filter((t) => ['Project', 'Scale', 'Sheet no.'].includes(t.text)).map((t) => t.at)));
  });
});

describe('the title block\'s {Scale} is the sheet\'s scale, as in the app (#54)', () => {
  const vp = (id: string, viewId: string, scale: number) => ({ id, viewId, x: 0, y: 0, scale, width: 100, height: 100, center: null });
  const plan = (id: string): ProjectDocument['views'][number] => ({ id, name: id, kind: 'plan', levelId: 'l', cutHeight: 1.2 } as unknown as ProjectDocument['views'][number]);
  const scaleOf = (d: ProjectDocument) => texts(d)[texts(d).indexOf('Scale') + 1];

  it('prints 1:50 for a sheet whose drawings are all at 1:50', () => {
    const d = doc({ views: [plan('v1'), plan('v2')] }, [sheet({ viewports: [vp('a', 'v1', 50), vp('b', 'v2', 50)] })]);
    expect(scaleOf(d)).toBe('1:50');
  });

  it('prints "As indicated" when the drawings differ in scale, not a list', () => {
    const d = doc({ views: [plan('v1'), plan('v2')] }, [sheet({ viewports: [vp('a', 'v1', 50), vp('b', 'v2', 100)] })]);
    expect(scaleOf(d)).toBe('As indicated');
  });

  it('prints a dash for a sheet that states none (no drawings), where the app prints one', () => {
    expect(scaleOf(doc())).toBe('\u2014');
  });

  it('a perspective has no scale to state: only the plan\'s counts', () => {
    const persp = { id: 'p', name: 'p', kind: '3d', projection: 'perspective' } as unknown as ProjectDocument['views'][number];
    const d = doc({ views: [plan('v1'), persp] }, [sheet({ viewports: [vp('a', 'v1', 50), vp('b', 'p', 1)] })]);
    expect(scaleOf(d)).toBe('1:50');
  });
});
