/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Single elements in a view (#32, #33), in the app. One wall hidden in one plan is gone from that plan's faces and lines, and drawn in
 * the other plan; an element override (dashed, grey) beats its category, which beats its template; it all survives a model reload
 * (the drawing's express ids change, the GlobalIds do not), orphaned GlobalIds are kept and listed; the engine's sheet agrees with the
 * app's; each action is one undo step; an old project is drawn as it was.
 */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { hiddenLineEntry, orphanElements, resolveViewGraphics } from '@bimvoice/ifcsheet';
import { sheetGraphic } from '@bimvoice/ifcsheet/headless';
import { viewportPens } from '@/components/viewer/sheets/viewport-pens';
import { clearDraftHistory, undoDrafts, redoDrafts } from '@/drafting/draft-store';
import { parseProjectFile, serializeProject } from './project-file';
import { projectDocument, resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import { startDrawingSet } from './drawing-set-actions';
import {
  forgetElements, hideElements, hideLine, resetElementGraphics, setElementGraphics, showAllHidden, showElements, showLine,
} from './element-graphics-actions';
import { applyViewTemplate, detachViewTemplate, resetViewOverrides, saveViewAsTemplate, setTemplateCategory, setViewCategory } from './view-template-actions';
import { styledDrawing } from './view-graphics';
import { withoutHiddenElements } from './view-element-filter';
import type { ProjectView } from './types';

const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const state = () => useProjectStore.getState();
const plans = () => state().views.filter((v) => v.kind === 'plan');
const viewById = (id: string): ProjectView => state().views.find((v) => v.id === id)!;

const WALL_A = '2O2Fr$t4X7Zf8NOew3FLOH';
const WALL_B = '3cUkl32yn9qRSPvBJVyWYp';
const DOOR = '1Oms875aH3Wg$9l65H2ZGw';
/** The express ids of a first load of the model, and of a reload that renumbered everything. */
const FIRST: Record<number, string> = { 11: WALL_A, 12: WALL_B, 13: DOOR };
const RELOAD: Record<number, string> = { 71: WALL_A, 72: WALL_B, 73: DOOR };
const lookup = (ids: Record<number, string>) => (id: number) => ids[id];

const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
/** A drawing of two walls and a door, each with a cut face, a cut line and a line seen beyond the cut; `ids` says which express ids they carry. */
function drawingOf(ids: readonly [number, number, number]): Drawing2D {
  const types = ['IfcWall', 'IfcWall', 'IfcDoor'];
  return {
    bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
    config: { plane: { axis: 'y' } },
    cutPolygons: ids.map((entityId, i) => ({ entityId, ifcType: types[i], polygon: { outer: square.map((p) => ({ x: p.x + i * 2, y: p.y })), holes: [] } })),
    lines: ids.flatMap((entityId, i) => [
      { entityId, ifcType: types[i], category: 'cut', visibility: 'visible', line: { start: { x: i * 2, y: 0 }, end: { x: i * 2 + 1, y: 0 } } },
      { entityId, ifcType: types[i], category: 'projection', visibility: 'visible', line: { start: { x: i * 2, y: 3 }, end: { x: i * 2 + 1, y: 3 } } },
    ]),
  } as unknown as Drawing2D;
}
const drawing = drawingOf([11, 12, 13]);

/** What `view` shows of `raw` as the drafting view and the sheet make it: the hidden elements left out first, then styled. */
function shownOf(view: ProjectView, raw: Drawing2D, ids: Record<number, string> = FIRST) {
  const graphics = resolveViewGraphics(view, state().viewTemplates);
  return styledDrawing(withoutHiddenElements(raw, graphics, lookup(ids)), graphics, undefined, undefined, null, null, null, lookup(ids));
}
const idsDrawn = (d: { cutPolygons: { entityId: number }[]; lines: { entityId: number }[] }) => [...new Set([...d.cutPolygons.map((p) => p.entityId), ...d.lines.map((l) => l.entityId)])].sort();
const MM = { scale: 1000, x: 0, y: 0 };
const pensOf = (view: ProjectView, raw: Drawing2D, ids = FIRST) => viewportPens(shownOf(view, raw, ids), resolveViewGraphics(view, state().viewTemplates), MM, 'down', []);

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }, { name: 'Level 2', elevation: 6 }]);
  startDrawingSet(null, bounds);
  clearDraftHistory();
});

describe('hide one wall in one plan (#33)', () => {
  it('is gone from that plan\'s faces and lines, and still in another plan and in the model the 3D view draws', () => {
    const [mine, other] = plans();
    hideElements(mine.id, [WALL_A]);
    assert.deepEqual(idsDrawn(shownOf(viewById(mine.id), drawing)), [12, 13], 'wall A is not in this plan');
    assert.deepEqual(idsDrawn(shownOf(viewById(other.id), drawing)), [11, 12, 13], 'wall A is in the other plan');
    // The 3D view keeps its own hide and isolate state; a project view does not follow it, and it does not follow the view.
    const threeD = state().views.find((v) => v.kind === '3d');
    assert.equal(threeD?.graphics, undefined);
    assert.equal(viewById(other.id).graphics, undefined, 'nothing was written to the other plan');
  });

  it('hides the cut face, the cut line and the line seen beyond, and the symbol meshes of the wall', () => {
    const [mine] = plans();
    hideElements(mine.id, [WALL_A]);
    const shown = shownOf(viewById(mine.id), drawing);
    assert.equal(shown.cutPolygons.filter((p) => p.entityId === 11).length, 0);
    assert.equal(shown.lines.filter((l) => l.entityId === 11).length, 0);
    assert.equal(shown.lines.filter((l) => l.entityId === 12).length, 2);
  });

  it('is keyed by GlobalId: it survives a reload that renumbers every element', () => {
    const [mine] = plans();
    hideElements(mine.id, [WALL_A]);
    const reopened = parseProjectFile(serializeProject(projectDocument()));
    const view = reopened.views.find((v) => v.id === mine.id)!;
    assert.deepEqual(view.graphics?.hiddenElements, [WALL_A]);
    const reloaded = drawingOf([71, 72, 73]);
    assert.deepEqual(idsDrawn(shownOf(view, reloaded, RELOAD)), [72, 73], 'wall A (now #71) is still hidden');
  });

  it('is not keyed by express id: an id that is not the wall hides nothing', () => {
    const [mine] = plans();
    hideElements(mine.id, ['11']);
    assert.deepEqual(idsDrawn(shownOf(viewById(mine.id), drawing)), [11, 12, 13]);
  });

  it('is shown again, one at a time or all at once', () => {
    const [mine] = plans();
    hideElements(mine.id, [WALL_A, WALL_B, DOOR]);
    assert.deepEqual(idsDrawn(shownOf(viewById(mine.id), drawing)), []);
    showElements(mine.id, [WALL_B]);
    assert.deepEqual(idsDrawn(shownOf(viewById(mine.id), drawing)), [12]);
    showAllHidden(mine.id);
    assert.deepEqual(idsDrawn(shownOf(viewById(mine.id), drawing)), [11, 12, 13]);
    assert.equal(viewById(mine.id).graphics, undefined, 'nothing is left behind once nothing is hidden');
  });

  it('a hidden element in a template-followed plan: the template does not carry it', () => {
    const [mine, other] = plans();
    assert.ok(viewById(mine.id).templateId, 'the starting set gives the plans a template');
    hideElements(mine.id, [WALL_A]);
    assert.ok(state().viewTemplates!.every((t) => !('hiddenElements' in t.graphics)));
    assert.deepEqual(idsDrawn(shownOf(viewById(other.id), drawing)), [11, 12, 13]);
  });

  it('beats the category: a visible override does not bring back what was hidden by hand', () => {
    const [mine] = plans();
    setElementGraphics(mine.id, [WALL_A], { visible: true });
    hideElements(mine.id, [WALL_A]);
    assert.deepEqual(idsDrawn(shownOf(viewById(mine.id), drawing)), [12, 13]);
  });
});

describe('a template never takes the elements of a view along, or away', () => {
  it('resetting the overrides, applying another template, saving as a template and detaching keep what the view hides and overrides', () => {
    const [mine] = plans();
    hideElements(mine.id, [WALL_A]);
    setElementGraphics(mine.id, [WALL_B], { lineColor: '#808080' });
    setViewCategory(mine.id, 'doors', { lineWeight: 'heavy' });
    const kept = () => ({ hidden: viewById(mine.id).graphics?.hiddenElements, elements: viewById(mine.id).graphics?.elements });
    const expected = { hidden: [WALL_A], elements: { [WALL_B]: { lineColor: '#808080' } } };
    resetViewOverrides(mine.id);
    assert.deepEqual(kept(), expected, 'reset');
    saveViewAsTemplate(mine.id, 'Mine');
    assert.deepEqual(kept(), expected, 'save as template');
    applyViewTemplate([mine.id], state().viewTemplates!.find((t) => t.name !== 'Mine' && t.kind === 'plan')!.id);
    assert.deepEqual(kept(), expected, 'apply');
    detachViewTemplate(mine.id);
    assert.deepEqual(kept(), expected, 'detach');
    assert.ok(state().viewTemplates!.every((t) => !JSON.stringify(t.graphics).includes(WALL_A)), 'no template carries a GlobalId');
  });
});

describe('hide one line (#33)', () => {
  const beyond = drawing.lines.find((l) => l.entityId === 11 && l.category === 'projection')!;

  it('hides that line of that element and no other', () => {
    const [mine] = plans();
    hideLine(mine.id, WALL_A, beyond.line);
    const shown = shownOf(viewById(mine.id), drawing);
    assert.equal(shown.lines.length, drawing.lines.length - 1);
    assert.ok(!shown.lines.some((l) => l.entityId === 11 && l.category === 'projection'));
    assert.equal(shown.cutPolygons.length, 3, 'its element\'s faces stay');
  });

  it('is keyed by where the line lies: a regenerated drawing with other express ids hides the same line', () => {
    const [mine] = plans();
    hideLine(mine.id, WALL_A, beyond.line);
    const reopened = parseProjectFile(serializeProject(projectDocument()));
    const shown = shownOf(reopened.views.find((v) => v.id === mine.id)!, drawingOf([71, 72, 73]), RELOAD);
    assert.equal(shown.lines.length, drawing.lines.length - 1);
  });

  it('is not an index: the same line, reached after the drawing\'s lines were reordered, is still the one hidden', () => {
    const [mine] = plans();
    hideLine(mine.id, WALL_A, beyond.line);
    const reordered = { ...drawing, lines: [...drawing.lines].reverse() } as Drawing2D;
    const shown = shownOf(viewById(mine.id), reordered);
    assert.ok(!shown.lines.some((l) => l.entityId === 11 && l.category === 'projection'));
    assert.equal(shown.lines.length, drawing.lines.length - 1);
  });

  it('is dropped silently when the geometry moved: a line that no longer matches is drawn', () => {
    const [mine] = plans();
    hideLine(mine.id, WALL_A, beyond.line);
    const moved = { ...drawing, lines: drawing.lines.map((l) => (l === beyond ? { ...l, line: { start: { x: 0.02, y: 3 }, end: { x: 1.02, y: 3 } } } : l)) } as Drawing2D;
    assert.equal(shownOf(viewById(mine.id), moved).lines.length, drawing.lines.length);
  });

  it('is shown again', () => {
    const [mine] = plans();
    hideLine(mine.id, WALL_A, beyond.line);
    showLine(mine.id, hiddenLineEntry(WALL_A, beyond.line));
    assert.equal(shownOf(viewById(mine.id), drawing).lines.length, drawing.lines.length);
  });
});

describe('per-element graphics (#32): template < category < element', () => {
  /** The strokes the pens give the lines of one element: its lines alone through the pens. */
  const strokesOf = (view: ProjectView, entityId: number): { stroke: string | null; width: number; dash?: string }[] => {
    const only = { ...drawing, cutPolygons: drawing.cutPolygons.filter((p) => p.entityId === entityId), lines: drawing.lines.filter((l) => l.entityId === entityId) } as Drawing2D;
    return pensOf(view, only).filter((p) => p.layer === 'CUT' || p.layer === 'SEEN').map((p) => ({ stroke: p.stroke, width: p.width, ...(p.dash ? { dash: p.dash } : {}) }));
  };

  it('a dashed grey override beats the category\'s red; the other wall keeps the category\'s; a door keeps the template\'s', () => {
    const [mine] = plans();
    setTemplateCategory(state().viewTemplates!.find((t) => t.id === mine.templateId)!.id, 'doors', { lineColor: '#00cc00' });
    setTemplateCategory(mine.templateId!, 'walls', { lineColor: '#0000cc' });
    useProjectStore.setState({ views: state().views.map((v) => (v.id === mine.id ? { ...v, graphics: { categories: { walls: { lineColor: '#cc0000', lineWeight: 'heavy' } } } } as ProjectView : v)) });
    setElementGraphics(mine.id, [WALL_A], { lineColor: '#808080', lineStyle: 'dashed' });
    const view = viewById(mine.id);
    const a = strokesOf(view, 11);
    assert.ok(a.length > 0 && a.every((s) => s.stroke === '#808080' && s.dash), `wall A is grey and dashed: ${JSON.stringify(a)}`);
    const b = strokesOf(view, 12);
    assert.ok(b.length > 0 && b.every((s) => s.stroke === '#cc0000' && !s.dash), `wall B keeps the category's red (not the template's blue): ${JSON.stringify(b)}`);
    const door = strokesOf(view, 13);
    assert.ok(door.length > 0 && door.every((s) => s.stroke === '#00cc00'), `the door has only the template to go by: ${JSON.stringify(door)}`);
  });

  it('colour and weight of one wall: only that wall changes, on screen pens and sheet pens alike', () => {
    const [mine] = plans();
    setElementGraphics(mine.id, [WALL_A], { lineColor: '#ff00ff', cutWeight: 'heavy', projectionWeight: 'hairline' });
    const a = strokesOf(viewById(mine.id), 11);
    const cut = a.find((s) => s.width === 0.7);
    const seen = a.find((s) => s.width === 0.065);
    assert.ok(cut && seen, `cut at heavy (0.7) and what is seen beyond at hairline (0.065): ${JSON.stringify(a)}`);
    assert.ok(a.every((s) => s.stroke === '#ff00ff'));
    assert.deepEqual(strokesOf(viewById(mine.id), 12), strokesOf({ ...viewById(mine.id), graphics: undefined } as ProjectView, 12), 'wall B is drawn as without the override');
  });

  it('the cut face of the wall takes the element\'s fill, the other wall does not', () => {
    const [mine] = plans();
    setElementGraphics(mine.id, [WALL_A], { fillColor: '#101010' });
    const fills = (id: number) => {
      const only = { ...drawing, cutPolygons: drawing.cutPolygons.filter((p) => p.entityId === id), lines: [] } as unknown as Drawing2D;
      return pensOf(viewById(mine.id), only).filter((p) => p.layer === 'FILL').map((p) => p.fill);
    };
    assert.deepEqual(fills(11), ['#101010']);
    assert.deepEqual(fills(12), ['#d4d4d8']);
  });

  it('an element in a hidden category is shown by an override that says so', () => {
    const [mine] = plans();
    setTemplateCategory(mine.templateId!, 'walls', { visible: false });
    assert.deepEqual(idsDrawn(shownOf(viewById(mine.id), drawing)), [13]);
    setElementGraphics(mine.id, [WALL_A], { visible: true });
    assert.deepEqual(idsDrawn(shownOf(viewById(mine.id), drawing)), [11, 13]);
  });

  it('overrides are kept in the file, and an element the model has not got among them', () => {
    const [mine] = plans();
    setElementGraphics(mine.id, [WALL_A, '0000000000000000000000'], { lineColor: '#808080', lineStyle: 'dashed', cutWeight: 'light' }, new Map([[WALL_A, 'IfcWall Basement wall']]));
    const back = parseProjectFile(serializeProject(projectDocument())).views.find((v) => v.id === mine.id)!;
    assert.deepEqual(back.graphics?.elements?.[WALL_A], { lineColor: '#808080', lineStyle: 'dashed', cutWeight: 'light', about: 'IfcWall Basement wall' });
    assert.equal(back.graphics?.elements?.['0000000000000000000000']?.lineStyle, 'dashed');
  });

  it('a reset takes the overrides off and leaves the rest', () => {
    const [mine] = plans();
    setElementGraphics(mine.id, [WALL_A], { lineColor: '#808080' });
    hideElements(mine.id, [WALL_B]);
    resetElementGraphics(mine.id, [WALL_A]);
    assert.equal(viewById(mine.id).graphics?.elements, undefined);
    assert.deepEqual(viewById(mine.id).graphics?.hiddenElements, [WALL_B]);
  });
});

describe('after a model reload (#33, like the orphan text of #186)', () => {
  it('lists what the view says about elements the model no longer has, keeps it in the file, and does not draw it', () => {
    const [mine] = plans();
    hideElements(mine.id, [WALL_A, DOOR]);
    setElementGraphics(mine.id, [DOOR], { lineColor: '#808080' }, new Map([[DOOR, 'IfcDoor D1']]));
    hideLine(mine.id, DOOR, { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    // A newer model: wall A is still there, the door was deleted in the authoring tool.
    const present = (id: string) => id === WALL_A || id === WALL_B;
    const orphans = orphanElements(viewById(mine.id).graphics, present);
    assert.deepEqual(orphans, [{ globalId: DOOR, hidden: true, overridden: true, lines: 1, about: 'IfcDoor D1' }]);
    // Saved and reopened, it is still there.
    const back = parseProjectFile(serializeProject(projectDocument())).views.find((v) => v.id === mine.id)!;
    assert.deepEqual(orphanElements(back.graphics, present), orphans);
    // Not drawn: the model has no such element to draw.
    assert.deepEqual(idsDrawn(shownOf(back, drawing)).filter((id) => id === 13), []);
  });

  it('is forgotten when the person says so, in one step, and the rest stays', () => {
    const [mine] = plans();
    hideElements(mine.id, [WALL_A, DOOR]);
    forgetElements(mine.id, [DOOR]);
    assert.deepEqual(viewById(mine.id).graphics?.hiddenElements, [WALL_A]);
  });
});

describe('the engine and the app draw the same sheet (#32, #33)', () => {
  it('drop the same faces and lines: a hidden wall, a hidden line, and an element shown in a hidden category', () => {
    const [mine] = plans();
    setTemplateCategory(mine.templateId!, 'doors', { visible: false });
    hideElements(mine.id, [WALL_A]);
    hideLine(mine.id, WALL_B, drawing.lines.find((l) => l.entityId === 12 && l.category === 'projection')!.line);
    setElementGraphics(mine.id, [DOOR], { visible: true });
    const doc = projectDocument();
    const live = doc.views.find((v) => v.id === mine.id)!;
    const app = styledDrawing(withoutHiddenElements(drawing, resolveViewGraphics(live, doc.viewTemplates), lookup(FIRST)), resolveViewGraphics(live, doc.viewTemplates), undefined, undefined, null, null, null, lookup(FIRST));
    const sheet = state().sheets.find((s) => s.viewports?.some((vp) => vp.viewId === mine.id))!;
    const one = { ...sheet, viewports: [{ ...sheet.viewports!.find((vp) => vp.viewId === mine.id)!, center: null }] };
    const engine = sheetGraphic(one, doc, new Map([[mine.id, drawing]]), null, new Map(), lookup(FIRST));
    assert.equal(engine.cut.length, app.cutPolygons.length, 'cut faces');
    assert.equal(engine.lines.length, app.lines.length, 'lines');
    assert.deepEqual(idsDrawn(app), [12, 13]);
    // And with nothing hidden both draw everything: the counts above are not zero by accident.
    const plain = sheetGraphic({ ...one }, { ...doc, views: doc.views.map((v) => (v.id === mine.id ? { ...v, graphics: undefined, templateId: undefined } : v)) }, new Map([[mine.id, drawing]]), null, new Map(), lookup(FIRST));
    assert.equal(plain.cut.length, 3);
    assert.equal(plain.lines.length, 6);
  });
});

describe('every action is one undo step', () => {
  const graphicsOf = () => JSON.stringify(state().views.map((v) => [v.id, v.graphics]));

  function oneStep(label: string, edit: () => void): void {
    clearDraftHistory();
    const before = graphicsOf();
    edit();
    const after = graphicsOf();
    assert.notEqual(after, before, `${label}: the action changed something`);
    assert.equal(undoDrafts(), true, label);
    assert.equal(graphicsOf(), before, `${label}: one undo returns to the state before`);
    assert.equal(undoDrafts(), false, `${label}: and it was the only step`);
    assert.equal(redoDrafts(), true, label);
    assert.equal(graphicsOf(), after, `${label}: redo reapplies it`);
  }

  it('hide, show, show all, graphics, reset, hide a line, show a line, forget: however many elements each touches', () => {
    const [mine] = plans();
    const line = drawing.lines[1].line;
    oneStep('hide three elements', () => hideElements(mine.id, [WALL_A, WALL_B, DOOR]));
    oneStep('show one', () => showElements(mine.id, [WALL_B]));
    oneStep('show all', () => showAllHidden(mine.id));
    oneStep('graphics of two elements', () => setElementGraphics(mine.id, [WALL_A, WALL_B], { lineColor: '#808080', lineStyle: 'dashed', cutWeight: 'heavy' }));
    oneStep('reset two elements', () => resetElementGraphics(mine.id, [WALL_A, WALL_B]));
    oneStep('hide a line', () => hideLine(mine.id, WALL_A, line));
    oneStep('show a line', () => showLine(mine.id, hiddenLineEntry(WALL_A, line)));
    hideElements(mine.id, [DOOR]);
    oneStep('forget', () => forgetElements(mine.id, [DOOR]));
  });
});

describe('an old project is drawn as it was (#32, #33)', () => {
  it('a view with no element graphics gives back the very same drawing and the very same graphics', () => {
    const [mine] = plans();
    assert.equal(mine.graphics, undefined);
    assert.equal(withoutHiddenElements(drawing, undefined, lookup(FIRST)), drawing);
    assert.equal(withoutHiddenElements(drawing, { categories: { walls: { visible: false } } }, lookup(FIRST)), drawing);
    const plain = styledDrawing(drawing, undefined, undefined, undefined, null, null, null, lookup(FIRST));
    assert.equal(plain, drawing as unknown, 'the same object: nothing was copied');
  });

  it('a file that has none of the new fields opens with none and saves none', () => {
    const [mine] = plans();
    setTemplateCategory(mine.templateId!, 'walls', { lineColor: '#cc0000' });
    const text = serializeProject(projectDocument());
    const written = JSON.stringify((JSON.parse(text) as { views: { graphics?: unknown }[] }).views.map((v) => v.graphics));
    for (const key of ['hiddenElements', 'hiddenLines', 'elements']) assert.ok(!written.includes(key), `${key} is not written when unused`);
    const back = parseProjectFile(text);
    assert.deepEqual(back.views.map((v) => v.graphics), state().views.map((v) => v.graphics));
  });

  it('malformed element fields in a file are dropped, never fatal', () => {
    const doc = JSON.parse(serializeProject(projectDocument())) as { views: { id: string; graphics?: unknown }[] };
    const [mine] = plans();
    doc.views = doc.views.map((v) => (v.id === mine.id ? { ...v, graphics: { hiddenElements: [3, 'ok', ''], hiddenLines: ['nobar', 'g|1,2,3,4'], elements: { a: 7, b: { lineColor: 'red', lineStyle: 'wavy', cutWeight: 'heavy' } } } } : v));
    const back = parseProjectFile(JSON.stringify(doc)).views.find((v) => v.id === mine.id)!;
    assert.deepEqual(back.graphics, { hiddenElements: ['ok'], hiddenLines: ['g|1,2,3,4'], elements: { b: { cutWeight: 'heavy' } } });
  });
});
