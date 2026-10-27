/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet build --project` prints the title block values typed in the app. A project saved by the app (the
 * standard layout, then the Romanian F_01 one) goes through the built command line on AC20-FZK-Haus, and every
 * title block text the screen prints for the same project is in the PDF's page, in order: the typed project number,
 * designer and F_01 fields, a typed value over the model's. The sheet's scale is left out: the screen's paper here
 * has no viewport, the PDF's has.
 */

import '@/test/setup-dom.js';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@/test/render.js';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { startDrawingSet } from './drawing-set-actions';
import { modelLevels } from './model-levels';
import { projectDocument, resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import { serializeProject } from './project-file';
import { setProjectTitleBlockField } from './sheets';
import { applyRomanianTitleBlock } from './title-block-template-actions';
import { effectiveTitleBlock } from './title-block-model';
import { romanianTitleBlock } from './title-block-ro';
import { titleBlockRoRo } from '@/i18n/catalogues/title-block-ro.ro';
import type { ProjectSheet } from './types';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';

const BIN = fileURLToPath(new URL('../../../../packages/ifcsheet/dist/bin.js', import.meta.url));
const ro = (k: string): string => (titleBlockRoRo as Record<string, string>)[k] ?? k;

/** Typed in the app: original fields, the Romanian roles and the F_01 datums (Ordinul 975/2026, Anexa 4). */
const TYPED: Record<string, string> = {
  project: 'Typed Haus Name', projectNumber: 'P-2026-014', designer: 'Maria Vasilescu', drawnBy: 'D. Marin', client: 'S.C. Beneficiar S.R.L.',
  registrationNumber: 'J40/1234/2020', projectManagerTitle: 'arh. Ionescu', designerTitle: 'arhitect', drawnByTitle: 'desenator', authorsCapacity: 'proiectant de arhitectură',
  verifierCapacity: 'verificator atestat', verifierRequirement: 'A1', reportNumber: 'RV-77', reportDate: '2026-10-20',
};

/** The title block's texts as the sheet's paper prints them (its viewports left out). */
function printed(sheet: ProjectSheet): string[] {
  const ui = render(
    <SheetPaper sheet={{ ...sheet, viewports: [] }} projectName={useProjectStore.getState().name} content={() => ({ view: undefined, drawing: null, drafts: [] })}
      layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />,
  );
  const out = [...ui.querySelectorAll('[data-title-block] text')].map((t) => t.textContent ?? '');
  cleanup();
  return out;
}

/** The texts of each page of a PDF. */
async function pdfPages(bytes: Uint8Array): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  const pdf = await task.promise;
  try {
    const pages: string[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) pages.push((await (await pdf.getPage(i)).getTextContent()).items.map((item) => ('str' in item ? item.str : '')));
    return pages;
  } finally {
    await task.destroy();
  }
}

/** Whether `list` has `value`. */
const has = (list: readonly string[], value: string): boolean => list.some((t) => t === value);

/** Whether `want` is in `have` in order, other texts between allowed. */
function inOrder(want: readonly string[], have: readonly string[]): string | null {
  let at = 0;
  for (const text of want) {
    const found = have.slice(at).findIndex((t) => t === text);
    if (found < 0) return text;
    at += found + 1;
  }
  return null;
}

const dirs: string[] = [];
afterEach(() => cleanup());

describe('ifcsheet build --project prints the title block as the app does, on AC20-FZK-Haus', { skip: planModelMissing(FZK_HAUS) }, () => {
  let modelProject = '';

  before(async () => {
    await loadPlanModel(FZK_HAUS);
  });

  beforeEach(() => {
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const meshes = [...models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(extent && startDrawingSet(meshes, extent), 'the Wall lays out a set');
    modelProject = effectiveTitleBlock().project ?? '';
  });

  /** Save the project as the app does, build it with the command line, and return what the screen and the PDF print per sheet. */
  async function screenAndPdf(): Promise<{ screen: string[][]; pdf: string[][]; file: string }> {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-project-tb-'));
    dirs.push(dir);
    const file = join(dir, 'p.ifclite-project.json');
    writeFileSync(file, serializeProject(projectDocument()));
    execFileSync(process.execPath, [BIN, 'build', FZK_HAUS, '--project', file, '--out', join(dir, 'set.pdf')], { stdio: 'pipe', timeout: 110_000 });
    const sheets = useProjectStore.getState().sheets;
    const pdf = await pdfPages(new Uint8Array(readFileSync(join(dir, 'set.pdf'))));
    assert.equal(pdf.length, sheets.length, 'a page per sheet');
    return { screen: sheets.map((s) => printed(s).filter((t) => t !== '' && t !== '—')), pdf, file };
  }

  const typeAll = (): void => { for (const [k, v] of Object.entries(TYPED)) setProjectTitleBlockField(k, v); };

  it('the model names the project, so a typed project name has something to beat', () => {
    assert.ok(modelProject && modelProject !== TYPED.project, `the FZK project name: "${modelProject}"`);
  });

  it('standard layout: every text the screen prints is on the PDF page in order; the typed name beats the model\'s in both', async () => {
    typeAll();
    assert.equal(effectiveTitleBlock().project, TYPED.project, 'on screen');
    const { screen, pdf } = await screenAndPdf();
    screen.forEach((texts, i) => {
      assert.ok(has(texts, TYPED.project) && has(texts, TYPED.client), `sheet ${i} prints the typed values on screen: ${texts.join('|')}`);
      assert.equal(inOrder(texts, pdf[i]), null, `sheet ${i}: ${texts.join('|')} // ${pdf[i].join('|')}`);
      assert.ok(!has(pdf[i], modelProject), `sheet ${i} does not print the model's "${modelProject}"`);
    });
  });

  it('Romanian F_01 layout: the same, with the project number, designer and every F_01 datum', async () => {
    typeAll();
    applyRomanianTitleBlock(romanianTitleBlock(ro as never));
    const { screen, pdf } = await screenAndPdf();
    screen.forEach((texts, i) => {
      for (const v of Object.values(TYPED)) assert.ok(has(texts, v) && has(pdf[i], v), `sheet ${i} "${v}" screen=${has(texts, v)} pdf=${has(pdf[i], v)}`);
      assert.equal(inOrder(texts, pdf[i]), null, `sheet ${i}: ${texts.join('|')} // ${pdf[i].join('|')}`);
    });
  });
});

process.on('exit', () => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
