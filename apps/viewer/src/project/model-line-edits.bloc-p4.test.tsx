/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Done-when of #189 on the demo block (bloc-p4): edits on the model's own lines (a trimmed line, a hidden line, a line in another
 * pen) are saved with the project and are still there when it is reopened; when a new version of the model moves the wall a trim was
 * made on, that edit is reported. The block is the committed sample the app opens, through the real parser, geometry engine and
 * section generator; the project goes through the real save and open (`serializeProject`, `parseProjectFile`, `loadProjectDocument`).
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DrawingLine } from '@ifc-lite/drawing-2d';
import { hiddenLineEntry } from '@bimvoice/ifcsheet';
import { newDraft } from '@/drafting/draft-store';
import { trimCommand } from '@/drafting/commands/edit';
import { hideLineCommand } from '@/drafting/commands/hideline.command';
import { lineStyleCommand } from '@/drafting/commands/linestyle.command';
import type { DraftContext, ModelLinePick } from '@/drafting/commands/types';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import { viewCanvasStyler } from '@/components/viewer/drawing/canvas-item-style';
import { checkSet } from '@/check/findings';
import type { CheckInput } from '@/check/types';
import { loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { renderIdGlobalId } from './element-guid';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from './project-store';
import { parseProjectFile, serializeProject } from './project-file';
import { planViewFor } from './view-defaults';
import { appViewStyler } from './view-styler';
import type { ProjectView } from './types';

const BLOC = fileURLToPath(new URL('../../public/samples/bloc-p4.ifc', import.meta.url));

type Pt = { x: number; y: number };
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const length = (l: DrawingLine) => Math.hypot(l.line.end.x - l.line.start.x, l.line.end.y - l.line.start.y);

/** The IFC text with the wall `guid` moved `by` metres in Y: the point its placement's axis sits on (used by that wall alone in this file). */
function withWallMoved(ifc: string, guid: string, by: number): string {
  const wall = new RegExp(`^#\\d+=IFCWALL(?:STANDARDCASE)?\\('${guid.replace(/\$/g, '\\$')}',#\\d+,'[^']*',[^,]*,[^,]*,#(\\d+),`, 'm').exec(ifc);
  assert.ok(wall, 'the wall is in the file');
  const axis = new RegExp(`^#${wall[1]}=IFCLOCALPLACEMENT\\([^,]*,#(\\d+)\\);`, 'm').exec(ifc);
  const point = axis && new RegExp(`^#${axis[1]}=IFCAXIS2PLACEMENT3D\\(#(\\d+),`, 'm').exec(ifc);
  const xyz = point && new RegExp(`^(#${point[1]}=IFCCARTESIANPOINT\\(\\()([-\\d.eE+]+),([-\\d.eE+]+),([-\\d.eE+]+)(\\)\\);)`, 'm').exec(ifc);
  assert.ok(xyz, 'the wall has its own placement point');
  return ifc.replace(xyz[0], `${xyz[1]}${xyz[2]},${Number(xyz[3]) + by},${xyz[4]}${xyz[5]}`);
}

describe('edits on the model\'s lines, saved, reopened and checked against a new model (bloc-p4, #189)', { skip: planModelMissing(BLOC) }, () => {
  let model: LoadedPlanModel;
  let view: ProjectView;
  let trimmed: DrawingLine;
  let hiddenOnly: DrawingLine;
  let restyled: DrawingLine;
  let temp = '';

  const gid = (l: DrawingLine) => renderIdGlobalId(l.entityId)!;
  const pick = (l: DrawingLine): ModelLinePick => ({ globalId: gid(l), a: l.line.start, b: l.line.end });
  const entry = (l: DrawingLine) => hiddenLineEntry(gid(l), { start: l.line.start, end: l.line.end });
  const same = (a: DrawingLine, b: { line: { start: Pt; end: Pt } }) =>
    a.line.start.x === b.line.start.x && a.line.start.y === b.line.start.y && a.line.end.x === b.line.end.x && a.line.end.y === b.line.end.y;

  /** The whole drawing's lines as the check reads them (`modelLines`): by GlobalId, before hiding. */
  const linesOf = (lines: readonly DrawingLine[]) => lines.flatMap((l) => { const globalId = renderIdGlobalId(l.entityId); return globalId ? [{ globalId, line: l.line }] : []; });
  const orphans = (modelLines: CheckInput['modelLines']) => {
    const s = useProjectStore.getState();
    const input: CheckInput = { views: s.views, sheets: [], projectName: '', drafts: s.drafts, planElements: () => [], elementExists: () => true, modelLines };
    return checkSet(input).filter((f) => f.kind === 'orphanedLineEdit');
  };

  before(async () => {
    model = await loadPlanModel(BLOC);
    view = { ...planViewFor(model.levels.find((l) => l.name === 'Parter')!, []), createdAt: 0, id: 'v-ground' } as ProjectView;
    const raw = await model.planOf(view, { omits: 'none' });
    const walls = raw.lines.filter((l) => l.category === 'projection' && l.visibility === 'visible' && model.classOf(l.entityId).startsWith('IfcWall') && renderIdGlobalId(l.entityId) && length(l) > 0.5);
    // Three lines of three different walls, so an edit on one is not an edit on another.
    const byWall = new Map<number, DrawingLine>();
    for (const l of walls) if (!byWall.has(l.entityId)) byWall.set(l.entityId, l);
    [trimmed, hiddenOnly, restyled] = [...byWall.values()];
        assert.ok(trimmed && hiddenOnly && restyled, 'the block has lines to edit');
  });
  after(() => { if (temp) rmSync(temp, { recursive: true, force: true }); resetProject(); });
  beforeEach(() => resetProject());
  afterEach(() => resetProject());

  /** Edit the three lines the way the person does: TRIM at a drawn boundary, HIDELINE, LINESTYLE. */
  function editLines() {
    const middle = mid(trimmed.line.start, trimmed.line.end);
    const along = { x: trimmed.line.end.x - trimmed.line.start.x, y: trimmed.line.end.y - trimmed.line.start.y };
    const n = Math.hypot(along.x, along.y);
    const across = { x: -along.y / n, y: along.x / n };
    const boundary = newDraft(view.id, 'walls', { type: 'line', a: { x: middle.x - across.x, y: middle.y - across.y }, b: { x: middle.x + across.x, y: middle.y + across.y } }, {});
    useProjectStore.setState({ views: [view], drafts: [boundary], dirty: false });
    const said: string[] = [];
    const ctx = (shape: DrawingLine) => ({
      viewId: view.id, layerId: 'walls', entities: () => useProjectStore.getState().drafts,
      referenceShapes: () => [{ type: 'line', a: shape.line.start, b: shape.line.end }], say: (key: string) => said.push(key),
    }) as unknown as DraftContext;
    // Trim away the end half: the click is nearer the line's end.
    const end = { x: middle.x + along.x * 0.2, y: middle.y + along.y * 0.2 };
    assert.equal(trimCommand.create(ctx(trimmed)).onPickModelLine?.(pick(trimmed), end), 'continue');
    assert.equal(hideLineCommand.create(ctx(hiddenOnly)).onPickModelLine?.(pick(hiddenOnly), mid(hiddenOnly.line.start, hiddenOnly.line.end)), 'continue');
    const pen = lineStyleCommand.create(ctx(restyled));
    for (const word of ['heavy', 'dashed', '#cc0000']) assert.equal(pen.onKeyword?.(word), 'continue');
    assert.equal(pen.onPickModelLine?.(pick(restyled), mid(restyled.line.start, restyled.line.end)), 'continue');
    assert.deepEqual(said, ['drafting.msg.hidelineDone', 'drafting.msg.linestyleSet'], 'the commands accepted every pick');
    return { boundary, middle };
  }

  it('keeps every edit through save and open, and the regenerated drawing shows them', async () => {
    const { middle } = editLines();
    const saved = serializeProject(projectDocument());
    resetProject();
    assert.deepEqual(useProjectStore.getState().drafts, [], 'the store is empty before the project is opened');
    loadProjectDocument(parseProjectFile(saved));

    const reopened = useProjectStore.getState();
    const graphics = reopened.views[0].graphics;
    assert.deepEqual([...(graphics?.hiddenLines ?? [])].sort(), [entry(trimmed), entry(hiddenOnly)].sort(), 'the trimmed and the hidden model lines are hidden in the view');
    assert.deepEqual(graphics?.lineStyles?.[entry(restyled)], { weight: 'heavy', type: 'dashed', color: '#cc0000' }, 'the line in another pen keeps its pen');
    const replacement = reopened.drafts.find((d) => d.params.replaces === entry(trimmed));
    assert.ok(replacement && replacement.shape.type === 'line', 'the trim\'s drafted line came back, with the line it replaces');
    assert.ok(Math.hypot(replacement.shape.b.x - middle.x, replacement.shape.b.y - middle.y) < 1e-6 || Math.hypot(replacement.shape.a.x - middle.x, replacement.shape.a.y - middle.y) < 1e-6, 'it ends at the boundary');
    assert.equal(reopened.drafts.length, 2, 'the drawn boundary and the replacement');

    // Rebuilt from the model with the reopened view, the drawing leaves out both lines and draws the third in its pen.
    const shown = await model.planOf(reopened.views[0], { omits: 'none' });
    assert.ok(!shown.lines.some((l) => same(l, trimmed) && l.entityId === trimmed.entityId), 'the trimmed model line is not drawn');
    assert.ok(!shown.lines.some((l) => same(l, hiddenOnly) && l.entityId === hiddenOnly.entityId), 'the hidden model line is not drawn');
    const styler = viewCanvasStyler(appViewStyler(graphics, shown, DEFAULT_GRAPHIC_STANDARD));
    const drawn = shown.lines.find((l) => same(l, restyled) && l.entityId === restyled.entityId)!;
    assert.deepEqual([styler.line(drawn)?.stroke, styler.line(drawn)?.dash.length ? 'dashed' : 'solid'], ['#cc0000', 'dashed']);
  });

  it('reports the trim when a new version of the model moves its wall, and only that one', async () => {
    editLines();
    loadProjectDocument(parseProjectFile(serializeProject(projectDocument())));
    const plain = await model.planOf(view, { omits: 'none' });
    assert.deepEqual(orphans(() => linesOf(plain.lines)), [], 'no complaint while the lines are in the drawing');

    temp = mkdtempSync(join(tmpdir(), 'bloc-p4-'));
    const moved = join(temp, 'bloc-p4-rev-b.ifc');
    writeFileSync(moved, withWallMoved(readFileSync(BLOC, 'utf8'), gid(trimmed), 0.5));
    const next = await loadPlanModel(moved);
    const regenerated = await next.planOf(view, { omits: 'none' });
    assert.ok(!linesOf(regenerated.lines).some((l) => l.globalId === gid(trimmed) && same({ ...trimmed, line: l.line } as DrawingLine, trimmed)), 'the wall\'s old line is not in the new drawing');
    assert.ok(linesOf(regenerated.lines).some((l) => l.globalId === gid(hiddenOnly) && same({ ...hiddenOnly, line: l.line } as DrawingLine, hiddenOnly)), 'the other walls did not move');

    const found = orphans(() => linesOf(regenerated.lines));
    const replacement = useProjectStore.getState().drafts.find((d) => d.params.replaces === entry(trimmed));
    assert.equal(found.length, 1, 'one edit is reported');
    assert.equal(found[0].viewId, view.id);
    assert.equal(found[0].draftId, replacement?.id, 'pointing at the drafted line, which is still on the drawing');
  });
});
