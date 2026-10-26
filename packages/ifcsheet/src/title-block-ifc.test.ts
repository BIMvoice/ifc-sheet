/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The engine fills the title block from the IFC as the app does (#54): the
 * phase from IfcProject.Phase, the roles from the actors assigned to the
 * project (PROJECTMANAGER, ARCHITECT), the owner organisation, the project name;
 * a typed value wins; the sheet prints its current revision; the logo reaches
 * the PDF. The app's side of the same resolution is checked against this
 * reader over the same model in `apps/viewer/src/project/title-block-engine.test.ts`.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DefaultSet } from './default-set.js';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { exportPdf } from './export.js';
import { openModel } from './model.js';
import { sheetGraphics } from './set-sheets.js';
import { sheetGraphic } from './sheet-graphic.js';
import { readStoreFacts } from './title-block-records.js';
import { projectTitleFields } from './title-block-sources.js';
import type { TitleBlockTemplate } from './title-block-template.js';

const PT_MM = 25.4 / 72;
const RO = (s: string): string => [...s].map((c) => (c.charCodeAt(0) > 127 ? `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\` : c)).join('');
export const STEP = `ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCPERSON($,'Ionescu','Ion',$,$,$,$,$);
#2=IFCORGANIZATION($,'${RO('Birou de arhitectură Îmbinări')}',$,$,$);
#3=IFCPERSONANDORGANIZATION(#1,#2,$);
#4=IFCORGANIZATION($,'Graphisoft',$,$,$);
#5=IFCAPPLICATION(#4,'27','ARCHICAD','AC');
#6=IFCOWNERHISTORY(#3,#5,$,.ADDED.,$,$,$,1);
#10=IFCPOSTALADDRESS(.SITE.,$,$,$,('${RO('Strada Împăcării 12')}'),$,'Cluj-Napoca',$,'400000','${RO('România')}');
#11=IFCPROJECT('0lY6P5Ur90TAQnnnI6wt01',#6,'Casa',$,$,'${RO('Casa Țăran')}','${RO('Faza DTAC')}',$,$);
#12=IFCSITE('0lY6P5Ur90TAQnnnI6wt02',#6,'Teren',$,$,$,$,$,.ELEMENT.,$,$,$,'CF 123456',#10);
#20=IFCACTORROLE(.PROJECTMANAGER.,$,$);
#21=IFCPERSON($,'Popescu','Ana',$,$,$,$,$);
#22=IFCACTOR('0lY6P5Ur90TAQnnnI6wt04',$,$,$,$,#21);
#23=IFCRELASSIGNSTOACTOR('0lY6P5Ur90TAQnnnI6wt05',$,$,$,(#11),$,#22,#20);
#24=IFCACTORROLE(.ARCHITECT.,$,$);
#25=IFCORGANIZATION($,'Atelier Verde',$,(#24),$);
#26=IFCACTOR('0lY6P5Ur90TAQnnnI6wt06',$,$,$,$,#25);
#27=IFCRELASSIGNSTOACTOR('0lY6P5Ur90TAQnnnI6wt07',$,$,$,(#11),$,#26,#24);
#30=IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('P-2026-014'),$);
#31=IFCPROPERTYSET('0lY6P5Ur90TAQnnnI6wt08',$,'Pset_ProjectCommon',$,(#30));
#32=IFCRELDEFINESBYPROPERTIES('0lY6P5Ur90TAQnnnI6wt09',$,$,$,(#11),#31);
ENDSEC;
END-ISO-10303-21;`;

/** What the app's own test reads from the same model (`TitleBlockSources.test.tsx`): the resolved values. */
const EXPECTED = {
  project: 'Casa Țăran', address: 'Strada Împăcării 12, 400000 Cluj-Napoca, România', organisation: 'Birou de arhitectură Îmbinări',
  phase: 'Faza DTAC', projectManager: 'Ana Popescu', designer: 'Atelier Verde',
};

const sheet = (over: Partial<ProjectSheet> = {}): ProjectSheet => ({ id: 's1', number: 'A-101', name: 'Plan parter', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [], ...over });
const doc = (over: Partial<ProjectDocument> = {}): ProjectDocument => ({ name: 'Untitled', models: [], views: [], sheets: [sheet()], ...over });
const ro: TitleBlockTemplate = {
  items: [
    { id: 'a', kind: 'text', x: 2, y: 8, size: 3.5, text: '{Project}|{ProjectPhase}|{ProjectManager}|{DesignedBy}|{Organisation}|{Address}|{ProjectNumber}|{Client}' },
    { id: 'b', kind: 'text', x: 2, y: 20, size: 3.5, text: 'rev:{Revision}' },
  ],
};

async function opened() {
  return openModel(new TextEncoder().encode(STEP), { geometry: false });
}
/** A set of one sheet over the opened model, to run the engine's own entry (`sheetGraphics`). */
const setOf = (document: ProjectDocument): DefaultSet => ({ document, levels: [], notes: [] });

describe('the engine reads the title block fields from the IFC', () => {
  it('resolves the phase, both roles, the owner organisation, the address and the project name', async () => {
    const model = await opened();
    expect(projectTitleFields(undefined, undefined, readStoreFacts(model.dataStore))).toMatchObject(EXPECTED);
  });

  it('prints them on the sheet through sheetGraphics, the way the app\'s layout shows them', async () => {
    const model = await opened();
    const [g] = await sheetGraphics(setOf(doc({ titleBlockTemplate: ro })), model, { drawings: false });
    const e = EXPECTED;
    expect(g.texts.map((t) => t.text)).toEqual([`${e.project}|${e.phase}|${e.projectManager}|${e.designer}|${e.organisation}|${e.address}||`, 'rev:']);
  });

  it('a typed value wins over the IFC, a field typed empty falls back to it, and the sheet\'s own wins over both', async () => {
    const model = await opened();
    const d = doc({ titleBlockTemplate: ro, titleBlock: { phase: 'PTh', projectManager: '', projectNumber: 'P-9' }, sheets: [sheet({ titleBlock: { designer: 'Sheet Own' } })] });
    const [g] = await sheetGraphics(setOf(d), model, { drawings: false });
    expect(g.texts[0].text).toBe(`${EXPECTED.project}|PTh|${EXPECTED.projectManager}|Sheet Own|${EXPECTED.organisation}|${EXPECTED.address}|P-9|`);
  });

  it('the mapping the project keeps (a property as the project number) is honoured', async () => {
    const model = await opened();
    const d = doc({ titleBlockTemplate: ro, titleBlockSources: { projectNumber: [{ kind: 'pset', pset: 'Pset_ProjectCommon', property: 'Reference' }] } });
    const [g] = await sheetGraphics(setOf(d), model, { drawings: false });
    expect(g.texts[0].text).toContain('|P-2026-014|');
  });

  it('without a model, only the typed values print', () => {
    const g = sheetGraphic(sheet(), doc({ titleBlockTemplate: ro, titleBlock: { phase: 'DTAC' } }), new Map());
    expect(g.texts[0].text).toBe('Untitled|DTAC||||||');
  });
});

describe('the sheet prints its current revision', () => {
  const revisions = [
    { id: 'r1', code: 'A', date: '2026-01-01', description: '', by: '' },
    { id: 'r2', code: 'B', date: '2026-02-01', description: '', by: '' },
    { id: 'r3', code: 'C', date: '2026-03-01', description: '', by: '' },
  ];
  const rev = (d: ProjectDocument) => sheetGraphic(d.sheets[0], d, new Map()).texts.find((t) => t.text.startsWith('rev'))?.text;

  it('is the last of the revisions the sheet is named by, chosen by hand', () => {
    expect(rev(doc({ titleBlockTemplate: ro, revisions, sheets: [sheet({ revisionIds: ['r1', 'r2'] })] }))).toBe('rev:B');
  });

  it('includes a revision a cloud on the sheet\'s view names, and none when the sheet has none', () => {
    const only: TitleBlockTemplate = { items: [{ id: 'b', kind: 'text', x: 2, y: 20, size: 3.5, text: 'rev:{Revision}' }] };
    const withView = sheet({ viewports: [{ id: 'vp1', viewId: 'v1', x: 0, y: 0, scale: 100, width: 0, height: 0, center: null }], revisionIds: ['r1'] });
    expect(rev(doc({ titleBlockTemplate: only, revisions, sheets: [withView], drafts: [{ viewId: 'v1', params: { revisionId: 'r3' } }, { viewId: 'other', params: { revisionId: 'r2' } }] }))).toBe('rev:C');
    expect(rev(doc({ titleBlockTemplate: only, revisions, sheets: [sheet()] }))).toBe('rev:');
  });

  it('shows in the standard layout\'s Revision cell', () => {
    const d = doc({ revisions, sheets: [sheet({ revisionIds: ['r2'] })] });
    const texts = sheetGraphic(d.sheets[0], d, new Map()).texts.map((t) => t.text);
    expect(texts[texts.indexOf('Revision') + 1]).toBe('B');
  });
});

describe('the logo', () => {
  // A 2 x 1 PNG.
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGM4IQcEJwAHIwIJ5FiIOQAAAABJRU5ErkJggg==';

  it('reaches the logo cell of the standard layout in both positions, level or reading upward', () => {
    for (const position of ['bottom-right', 'right'] as const) {
      const s = sheet({ frame: { margins: { top: 10, right: 10, bottom: 10, left: 10 }, titleBlock: position } });
      const g = sheetGraphic(s, doc({ titleBlock: { logo: PNG }, sheets: [s] }), new Map());
      expect(g.images, position).toHaveLength(1);
      expect(g.images[0].src).toBe(PNG);
      expect(g.images[0].angle, position).toBe(position === 'right' ? 90 : undefined);
    }
  });

  it('prints nothing for no logo, and for one the PDF cannot draw (an SVG)', () => {
    expect(sheetGraphic(sheet(), doc(), new Map()).images).toEqual([]);
    expect(sheetGraphic(sheet(), doc({ titleBlock: { logo: 'data:image/svg+xml;base64,PHN2Zy8+' } }), new Map()).images).toEqual([]);
  });

  it('is drawn into the PDF as an image', async () => {
    const g = sheetGraphic(sheet(), doc({ titleBlock: { logo: PNG } }), new Map());
    const text = (b: Uint8Array) => Buffer.from(b).toString('latin1');
    expect(text(await exportPdf([g]))).toContain('/Subtype /Image');
    expect(text(await exportPdf([sheetGraphic(sheet(), doc(), new Map())]))).not.toContain('/Subtype /Image');
  });

  /** The page's one image as it lands on the paper, mm: the bounding box of the unit square under the transform the PDF paints it with. */
  async function paintedImage(bytes: Uint8Array): Promise<{ x: number; y: number; w: number; h: number }> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const require = createRequire(import.meta.url);
    const task = pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
    const pdf = await task.promise;
    try {
      const page = await pdf.getPage(1);
      const pageH = page.view[3];
      const { fnArray, argsArray } = await page.getOperatorList();
      type M = number[];
      const times = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
      let ctm: M = [1, 0, 0, 1, 0, 0];
      const stack: M[] = [];
      for (let i = 0; i < fnArray.length; i++) {
        if (fnArray[i] === pdfjs.OPS.save) stack.push(ctm);
        else if (fnArray[i] === pdfjs.OPS.restore) ctm = stack.pop() ?? ctm;
        else if (fnArray[i] === pdfjs.OPS.transform) ctm = times(ctm, argsArray[i] as M);
        else if (fnArray[i] === pdfjs.OPS.paintImageXObject) {
          const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => ({ x: ctm[0] * u + ctm[2] * v + ctm[4], y: ctm[1] * u + ctm[3] * v + ctm[5] }));
          const xs = corners.map((c) => c.x * PT_MM);
          const ys = corners.map((c) => (pageH - c.y) * PT_MM);
          return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        }
      }
      throw new Error('no image on the page');
    } finally {
      await task.destroy();
    }
  }

  it('lands whole and centred in the logo cell, level or turned, at the picture\'s own proportions', async () => {
    for (const position of ['bottom-right', 'right'] as const) {
      const s = sheet({ frame: { margins: { top: 10, right: 10, bottom: 10, left: 10 }, titleBlock: position } });
      const g = sheetGraphic(s, doc({ titleBlock: { logo: PNG }, sheets: [s] }), new Map());
      const { box, angle } = g.images[0];
      const got = await paintedImage(await exportPdf([g]));
      // The picture is 2 x 1: it fills the cell's width, or its height when the cell is squarer than that (turned, the picture's width runs up the cell).
      const longSide = Math.min(angle ? box.h : box.w, 2 * (angle ? box.w : box.h));
      const [w, h] = angle ? [longSide / 2, longSide] : [longSide, longSide / 2];
      expect([got.w, got.h].map((n) => Math.round(n * 100) / 100), position).toEqual([w, h].map((n) => Math.round(n * 100) / 100));
      expect(got.x + got.w / 2).toBeCloseTo(box.x + box.w / 2, 1);
      expect(got.y + got.h / 2).toBeCloseTo(box.y + box.h / 2, 1);
    }
  });

  it('a logo that does not decode costs the PDF its logo, not the PDF', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const g = sheetGraphic(sheet(), doc({ titleBlock: { logo: 'data:image/png;base64,AAAA' } }), new Map());
    expect((await exportPdf([g])).length).toBeGreaterThan(1000);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
