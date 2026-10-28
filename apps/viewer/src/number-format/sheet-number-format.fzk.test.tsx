/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Every figure on a sheet follows the project's "Units and numbers" (#88). The Romanian pack sets `separator: 'comma'` (#373); this
 * lays the AC20-FZK-Haus set out in English, annotates it (dimensions, level marks, room tags), hangs a schedule of every kind, the
 * urban indicators and a legend, and reads the text of every sheet back as the issue's capture draws it (`captureSheets`). With the comma
 * set, no decimal on any sheet may keep its point. Exempt, by name: scale ratios ("1:100"), dates, sheet numbers ("A-603.1") and
 * the law's number ("350/2001"). The control run, with no setting, must still print points, so the reader cannot pass by finding nothing.
 */

import '@/test/setup-dom.js';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sheetNumber } from '@bimvoice/ifcsheet/names';
import { ROMANIA_PACK_ID, romaniaPack } from '@bimvoice/ifcsheet';
import { annotateSet } from '@/annotate-set/annotate-set';
import { ALL_CHOICES } from '@/annotate-set/choices';
import { addBoqArticle, updateBoqArticle } from '@/boq/boq-actions';
import { setExtent } from '@/draft-set/body';
import { clearDraftHistory } from '@/drafting/draft-store';
import { captureSheets } from '@/issue/capture';
import { addListScheduleToSet } from '@/joinery/list-schedule-actions';
import { addLegend, placeLegend } from '@/legend/legend-actions';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { addScheduleToSet, startDrawingSet } from '@/project/drawing-set-actions';
import { modelLevels } from '@/project/model-levels';
import { resetProject, setUnitsAndNumbers, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { useViewerStore } from '@/store';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';

/** What is allowed to keep a point between digits on a sheet, each with the reason. Removed from the text before it is read. */
export const EXEMPT: readonly { why: string; pattern: RegExp }[] = [
  { why: 'a scale ratio', pattern: /\b1:\d[\d.,]*/g },
  { why: 'a date', pattern: /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\.\d{1,2}\.\d{4}\b/g },
  { why: 'a sheet number or its page', pattern: /\b[A-Z]{1,3}-?\d{1,4}(?:\.\d{1,3})?\b/g },
  { why: 'the number of a law', pattern: /\b\d{1,4}\/\d{4}\b/g },
];

/** The text of a sheet's SVG, one string per <text>, tags and entities taken out. */
export function textsOf(svg: string): string[] {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&(#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => (e[0] === '#' ? String.fromCharCode(Number(e.slice(1))) : entities[e])))
    .filter((t) => t.trim() !== '');
}

/** A decimal that kept its point: digits, a point, digits, once the exempt text and well-formed thousands ("1.234,50") are taken out. */
export function pointDecimals(text: string): string[] {
  let rest = text;
  for (const { pattern } of EXEMPT) rest = rest.replace(pattern, ' ');
  rest = rest.replace(/\d{1,3}(?:\.\d{3})+(?=,\d)/g, ' ');
  return rest.match(/\d+\.\d+/g) ?? [];
}

const comma = (texts: readonly string[]): number => texts.filter((t) => /\d,\d/.test(t)).length;

describe('the sheets of AC20-FZK-Haus write the project\'s number format (#88)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let model: LoadedPlanModel;
  before(async () => {
    model = await loadPlanModel(FZK_HAUS);
    const geometryResult = [...useViewerStore.getState().models.values()][0].geometryResult;
    publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
  });
  after(() => publishDrawingRuntime(null));

  /** The set, annotated, with every kind of schedule, the urban sheet and a legend; the text of every sheet, by sheet number. */
  async function sheetTexts(separator: 'comma' | undefined): Promise<Map<string, string[]>> {
    resetProject();
    clearDraftHistory();
    useViewDrawings.setState({ byView: {} });
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const meshes = [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    const { models, geometryResult } = useViewerStore.getState();
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(startDrawingSet(meshes, extent), 'the Wall lays out a set');
    for (const view of useProjectStore.getState().views) {
      if (view.kind === '3d') continue;
      const drawing = await model.planOf(view);
      useViewDrawings.setState((s) => ({ byView: { ...s.byView, [view.id]: { ...EMPTY_VIEW_DRAWING, drawing, status: 'ready' } } }));
    }
    if (separator) setUnitsAndNumbers({ separator });
    await annotateSet({ choices: ALL_CHOICES, mode: 'undoable' });
    const article = addBoqArticle('m2');
    updateBoqArticle(article, { code: 'W1', description: 'Walls', quantity: 'NetSideArea', factor: 1.5, waste: 5, filter: { classes: ['IfcWallStandardCase'] } });
    addListScheduleToSet('Walls by type', {
      filter: { classes: ['IfcWallStandardCase'] }, groupBy: ['type'], sum: ['area'],
      columns: [{ id: 'type', source: 'attribute', propertyName: 'Type' }, { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
    });
    for (const kind of ['door', 'window', 'rooms', 'finishes', 'materials', 'types', 'boq', 'urban'] as const) addScheduleToSet(kind, `Schedule ${kind}`);
    // The legend lists the annotation types the drafts use: a dimension and a level mark, whose samples are figures.
    const first = useProjectStore.getState().views[0].id;
    const sample = (id: string) => ({ id: `sample-${id}`, viewId: first, layerId: '0', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, params: { atype: id } }) as never;
    useProjectStore.setState((s) => ({
      annotationTypes: [{ id: 'dim', name: 'Dimension', tool: 'dimlinear' }, { id: 'lvl', name: 'Level', tool: 'level' }],
      drafts: [...s.drafts, sample('dim'), sample('lvl')],
    }));
    const legend = addLegend('Legend', { categories: ['annotations'], scope: 'project' });
    const labels = { heading: { materials: '', annotations: '', symbols: '', layers: '', colours: '' }, continued: (h: string) => h, tool: (t: string) => t, membrane: '', sampleText: 'Text' } as never;
    assert.ok(placeLegend(useProjectStore.getState().sheets[0].id, legend, labels), 'a legend is placed on the first sheet');
    const sheets = useProjectStore.getState().sheets;
    const captured = await captureSheets(sheets);
    assert.deepEqual(captured.failed, []);
    return new Map(sheets.map((s) => [`${s.number} ${s.name}`, textsOf(captured.svgs.get(s.id) ?? '')]));
  }

  it('installing the Romanian pack is what sets the comma', () => {
    assert.deepEqual(romaniaPack((k) => k as never).unitsAndNumbers, { separator: 'comma' });
    assert.equal(romaniaPack((k) => k as never).id, ROMANIA_PACK_ID);
  });

  it('with the comma set, no decimal on any sheet keeps its point', async () => {
    const sheets = await sheetTexts('comma');
    const all = [...sheets.values()].flat();
    const violations = [...sheets].flatMap(([sheet, texts]) => texts.flatMap((t) => pointDecimals(t).map((d) => `${sheet}: "${d}" in "${t.slice(0, 90)}"`)));
    assert.deepEqual(violations, [], `${violations.length} decimal(s) kept their point under separator: comma`);
    // The reader has something to read: dimensions, level marks, room tags and every table print decimals.
    assert.ok(sheets.size >= 12, `a set with its schedules: ${[...sheets.keys()].join(', ')}`);
    assert.ok(all.includes('2,50') && all.filter((t) => t === '±0,00').length >= 2, 'the legend shows its sample figures with the comma');
    assert.ok(all.includes('±0,00') && all.includes('+2,70'), 'the level marks are written with the comma');
    for (const name of ['Floor plans', 'Elevations, south', 'Schedule rooms', 'Schedule materials', 'Schedule types', 'Schedule boq', 'Schedule urban', 'Walls by type']) {
      const found = [...sheets].find(([sheet]) => sheet.includes(name));
      assert.ok(found, `${name} is in the set`);
      assert.ok(comma(found[1]) > 0, `${found[0]} prints a decimal comma`);
    }
  });

  it('control: with no setting the same sheets are read, and their points are seen', async () => {
    const sheets = await sheetTexts(undefined);
    const points = [...sheets.values()].flat().flatMap(pointDecimals);
    assert.ok(points.length > 20, `the reader finds the points of an English set (found ${points.length})`);
    assert.ok(points.includes(sheetNumber('en', 2.7, 2, { group: false })) || [...sheets.values()].flat().includes('+2.70'), 'a level mark reads +2.70');
  });
});
