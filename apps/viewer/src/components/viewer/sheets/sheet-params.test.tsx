/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore, addProjectSheet } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { addTitleBlockParam, deleteTitleBlockParam, renameTitleBlockParam, setSheetParam, setTitleBlockParamValue } from '@/project/title-block-param-actions';
import { addTemplateItem, customiseTitleBlock, resetTitleBlockTemplate, setTemplateField } from '@/project/title-block-template-actions';
import { standardTitleBlock } from '@/project/title-block-template';
import { PARAMETRIC_TEXT } from '@/project/parametric-text';
import { newDraft } from '@/drafting/draft-store';
import { resolveEnglish as t } from '@/i18n/registry';
import { FRAME_MARGIN_MM, TITLE_BLOCK_MM } from '@/project/sheet-frame';
import { paperOf } from '@/project/sheets';
import type { DraftEntity } from '@/drafting/types';
import type { ProjectSheet } from '@/project/types';
import { SheetPaper } from './SheetPaper';
import { sheetDxf } from './sheet-dxf';

/**
 * #143, the issue's own acceptance cases: a parameter `Phase = DTAC` placed
 * as `{Phase}` both in the title block and loose on a sheet resolves to the
 * changed value on every sheet, a per-sheet value wins on its sheet only, and
 * an edited title block line survives save and reload.
 */

const std = () => standardTitleBlock((key) => t(key));
const linesAt = (ui: HTMLElement): string[] => [...ui.querySelectorAll('line')].map((l) => ['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k)).toFixed(2)).join(','));

function looseText(sheetId: string, text: string): DraftEntity {
  return newDraft(sheetId, '0', { type: 'text', p: { x: 20, y: 20 }, text, height: 3.5, rotation: 0 }, { [PARAMETRIC_TEXT]: true });
}

function paper(sheet: ProjectSheet, drafts: readonly DraftEntity[] = []): HTMLElement {
  return render(
    <SheetPaper sheet={{ ...sheet, viewports: [] }} projectName={useProjectStore.getState().name} content={() => ({ view: undefined, drawing: null, drafts: [] })}
      layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} sheetDrafts={drafts} />,
  );
}
const texts = (ui: HTMLElement): string[] => [...ui.querySelectorAll('text')].map((x) => x.textContent ?? '');
const sheets = (): ProjectSheet[] => useProjectStore.getState().sheets;

beforeEach(() => {
  resetProject();
  addProjectSheet('Plans', 'plans');
  addProjectSheet('Sections', 'sections');
});
afterEach(() => cleanup());

describe('parametric text (#143)', () => {
  it('Phase = DTAC, placed in the title block and loose on a sheet, becomes PTh on every sheet; a sheet\'s own value wins there only', () => {
    assert.equal(addTitleBlockParam('Phase', 'DTAC'), null);
    customiseTitleBlock(std());
    addTemplateItem('text');
    const id = useProjectStore.getState().titleBlockTemplate?.items.at(-1)?.id ?? '';
    assert.ok(setTemplateField(id, 'text', 'Faza: {Phase}'));

    const [first, second] = sheets() as [ProjectSheet, ProjectSheet];
    const loose = (s: ProjectSheet) => looseText(s.id, 'Phase {Phase}');
    let a = paper(first, [loose(first)]);
    assert.ok(texts(a).includes('Faza: DTAC'), 'title block text');
    assert.ok(texts(a).includes('Phase DTAC'), 'loose text');
    cleanup();

    setTitleBlockParamValue('Phase', 'PTh');
    for (const s of sheets()) {
      const ui = paper(s, [loose(s)]);
      assert.ok(texts(ui).includes('Faza: PTh'), `title block on ${s.number}`);
      assert.ok(texts(ui).includes('Phase PTh'), `loose text on ${s.number}`);
      cleanup();
    }

    setSheetParam(second.id, 'Phase', 'PAC');
    a = paper(sheets()[0] as ProjectSheet, [loose(first)]);
    assert.ok(texts(a).includes('Faza: PTh') && texts(a).includes('Phase PTh'), 'the first sheet still follows the project');
    cleanup();
    const b = paper(sheets()[1] as ProjectSheet, [loose(second)]);
    assert.ok(texts(b).includes('Faza: PAC') && texts(b).includes('Phase PAC'), 'the second sheet has its own');
  });

  it('a name nobody defined shows as {Unknown?}, in the title block and on the sheet', () => {
    customiseTitleBlock(std());
    addTemplateItem('text');
    setTemplateField(useProjectStore.getState().titleBlockTemplate?.items.at(-1)?.id ?? '', 'text', '{Unknown}');
    const first = sheets()[0] as ProjectSheet;
    const ui = paper(first, [looseText(first.id, 'x {Nope}')]);
    assert.ok(texts(ui).includes('{Unknown?}'));
    assert.ok(texts(ui).includes('x {Nope?}'));
  });

  it('a text that is not marked parametric prints as typed', () => {
    addTitleBlockParam('Phase', 'DTAC');
    const first = sheets()[0] as ProjectSheet;
    const plain = newDraft(first.id, '0', { type: 'text', p: { x: 20, y: 20 }, text: 'keep {Phase}', height: 3.5, rotation: 0 }, {});
    assert.ok(texts(paper(first, [plain])).includes('keep {Phase}'));
  });

  it('the built-in parameters read the sheet: number, name, page n/N, and the title block fields', () => {
    const first = sheets()[0] as ProjectSheet;
    const ui = paper(first, [looseText(first.id, '{SheetNumber} {SheetName} {Page}')]);
    assert.ok(texts(ui).includes(`${first.number} ${first.name} 1/2`) || texts(ui).includes(`${first.number} ${first.name} 2/2`));
  });

  it('renaming a parameter keeps {Old} in the layout and loose text pointing at it', () => {
    addTitleBlockParam('Phase', 'DTAC');
    customiseTitleBlock(std());
    addTemplateItem('text');
    setTemplateField(useProjectStore.getState().titleBlockTemplate?.items.at(-1)?.id ?? '', 'text', '{Phase}!');
    const first = sheets()[0] as ProjectSheet;
    const draft = looseText(first.id, 'P={Phase}');
    useProjectStore.setState({ drafts: [draft] });
    renameTitleBlockParam('Phase', 'Stage');
    const moved = useProjectStore.getState().drafts[0];
    const ui = paper(first, moved ? [moved] : []);
    assert.ok(texts(ui).includes('DTAC!'));
    assert.ok(texts(ui).includes('P=DTAC'));
  });

  it('deleting a parameter makes its text show {Name?}', () => {
    addTitleBlockParam('Phase', 'DTAC');
    const first = sheets()[0] as ProjectSheet;
    deleteTitleBlockParam('Phase');
    assert.ok(texts(paper(first, [looseText(first.id, '{Phase}')])).includes('{Phase?}'));
  });
});

describe('exports print the resolved value (#143)', () => {
  it('the DXF carries DTAC where the title block and the loose text say {Phase}, not the braces', () => {
    addTitleBlockParam('Phase', 'DTAC');
    customiseTitleBlock(std());
    addTemplateItem('text');
    setTemplateField(useProjectStore.getState().titleBlockTemplate?.items.at(-1)?.id ?? '', 'text', 'Faza {Phase}');
    const first = sheets()[0] as ProjectSheet;
    const svg = paper(first, [looseText(first.id, 'Loose {Phase}')]).querySelector('svg');
    assert.ok(svg);
    const dxf = new TextDecoder().decode(sheetDxf(svg as unknown as SVGSVGElement, first));
    assert.match(dxf, /Faza DTAC/);
    assert.match(dxf, /Loose DTAC/);
    assert.doesNotMatch(dxf, /\{Phase\}/);
  });
});

describe('the title block layout (#143)', () => {
  it('with no edit, prints the standard layout: the same texts, in the same places, as before', () => {
    const first = sheets()[0] as ProjectSheet;
    const ui = paper(first);
    assert.deepEqual(texts(ui).slice(0, 4), ['Project', useProjectStore.getState().name, 'Address', '']);
    assert.ok(texts(ui).includes('Scale'));
    assert.ok(texts(ui).includes(first.number));
  });

  it('an edited line survives save and reload, and prints where it was moved', () => {
    customiseTitleBlock(std());
    const items = useProjectStore.getState().titleBlockTemplate?.items ?? [];
    const line = items.find((i) => i.kind === 'line');
    assert.ok(line && line.kind === 'line');
    assert.ok(setTemplateField(line.id, 'y1', 33));
    assert.ok(setTemplateField(line.id, 'y2', 33));

    const text = serializeProject(projectDocument());
    resetProject();
    assert.equal(useProjectStore.getState().titleBlockTemplate, undefined);
    loadProjectDocument(parseProjectFile(text));

    const reloaded = useProjectStore.getState().titleBlockTemplate?.items.find((i) => i.id === line.id);
    assert.deepEqual(reloaded && reloaded.kind === 'line' ? [reloaded.y1, reloaded.y2] : null, [33, 33]);
    const sheet = useProjectStore.getState().sheets[0] as ProjectSheet;
    const { w, h } = paperOf(sheet);
    const left = w - FRAME_MARGIN_MM - TITLE_BLOCK_MM.w;
    const top = h - FRAME_MARGIN_MM - TITLE_BLOCK_MM.h;
    // The block is drawn at its own origin and set in place, so the moved line is at its own y inside the placed group.
    const ui = paper(sheet);
    const block = ui.querySelector('[data-title-block]');
    assert.equal(block?.getAttribute('transform'), `translate(${left} ${top})`);
    const moved = [line.x1, 33, line.x2, 33].map((n) => n.toFixed(2)).join(',');
    assert.ok(linesAt(block as HTMLElement).includes(moved), `a line at ${moved}`);
  });

  it('refuses a value that would draw nothing sensible, leaving the item alone', () => {
    customiseTitleBlock(std());
    const line = useProjectStore.getState().titleBlockTemplate?.items.find((i) => i.kind === 'line');
    assert.ok(line);
    assert.equal(setTemplateField(line.id, 'x1', 'abc'), false);
    assert.equal(setTemplateField(line.id, 'weight', 0), false);
    assert.equal(setTemplateField(line.id, 'weight', -1), false);
    assert.deepEqual(useProjectStore.getState().titleBlockTemplate?.items.find((i) => i.id === line.id), line);
  });

  it('resetting goes back to the standard layout', () => {
    customiseTitleBlock(std());
    resetTitleBlockTemplate();
    assert.equal(useProjectStore.getState().titleBlockTemplate, undefined);
  });
});

