/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * View templates (#44) in the app. The starting set names a Plans, a Sections and an Elevations template; changing the Plans
 * template once takes furniture out of every plan, and only the plans; a drawing's own graphics lie over its template; one
 * viewport hides a layer on its sheet alone; deleting a template leaves its drawings as they were drawn; an old project draws
 * as it did; the sheet the engine writes agrees with the one the app styles; each edit is one undo step.
 */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { resolveViewGraphics, viewportHiddenLayers, type ProjectViewTemplate } from '@bimvoice/ifcsheet';
import { sheetGraphic } from '@bimvoice/ifcsheet/headless';
import { clearDraftHistory, redoDrafts, undoDrafts } from '@/drafting/draft-store';
import { parseProjectFile, serializeProject } from './project-file';
import { projectDocument, resetProject, syncProjectWithModels, updateProjectView, useProjectStore } from './project-store';
import { startDrawingSet } from './drawing-set-actions';
import {
  applyViewTemplate, deleteViewTemplate, detachViewTemplate, overrideCount, renameViewTemplate, resetViewOverrides, saveViewAsTemplate, setTemplateCategory,
  setViewCategory, toggleViewportHiddenLayer, usersOf,
} from './view-template-actions';
import { styledDrawing } from './view-graphics';
import type { ProjectView, SheetViewport } from './types';

const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const state = () => useProjectStore.getState();
const templateNamed = (name: string): ProjectViewTemplate => state().viewTemplates!.find((t) => t.name === name)!;
const viewsOf = (kind: ProjectView['kind']) => state().views.filter((v) => v.kind === kind);

const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
/** A drawing with a wall, a door and a piece of furniture, each with a cut face and a line. */
const drawing = {
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  config: { plane: { axis: 'y' } },
  cutPolygons: ['IfcWall', 'IfcDoor', 'IfcFurniture'].map((ifcType, i) => ({ entityId: i + 1, ifcType, polygon: { outer: square, holes: [] } })),
  lines: ['IfcWall', 'IfcDoor', 'IfcFurniture'].map((ifcType, i) => ({ entityId: i + 1, ifcType, category: 'cut', visibility: 'visible', line: { start: { x: i, y: 0 }, end: { x: i, y: 5 } } })),
} as unknown as Drawing2D;

/** What a view shows of the drawing: the classes of its cut faces and lines. */
const shows = (view: ProjectView, templates = state().viewTemplates): string[] => {
  const out = styledDrawing(drawing, resolveViewGraphics(view, templates));
  return [...new Set([...out.cutPolygons.map((p) => p.ifcType), ...out.lines.map((l) => l.ifcType)])].sort();
};

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }, { name: 'Level 2', elevation: 6 }]);
  startDrawingSet(null, bounds);
  clearDraftHistory();
});

describe('the starting set', () => {
  it('names a Plans, a Sections and an Elevations template, and the set\'s drawings follow them by kind', () => {
    assert.deepEqual(state().viewTemplates!.map((t) => [t.name, t.kind]), [['Plans', 'plan'], ['Sections', 'section'], ['Elevations', 'elevation']]);
    for (const v of state().views) {
      if (v.kind === 'plan' || v.kind === 'section' || v.kind === 'elevation') assert.equal(state().viewTemplates!.find((t) => t.id === v.templateId)?.kind, v.kind, v.name);
    }
    assert.ok(viewsOf('plan').length >= 3);
  });

  it('draws as it did: the new templates are empty and the drawings keep no graphics of their own', () => {
    for (const t of state().viewTemplates!) assert.deepEqual(t.graphics, {});
    for (const v of state().views) assert.equal(v.graphics, undefined);
    for (const v of viewsOf('plan')) assert.deepEqual(shows(v), ['IfcDoor', 'IfcFurniture', 'IfcWall']);
  });
});

describe('turning furniture off in the Plans template (#44)', () => {
  it('removes it from every plan at once, and leaves the sections and the elevations alone', () => {
    setTemplateCategory(templateNamed('Plans').id, 'furniture', { visible: false });
    assert.ok(viewsOf('plan').length >= 3);
    for (const v of viewsOf('plan')) assert.deepEqual(shows(v), ['IfcDoor', 'IfcWall'], v.name);
    for (const v of [...viewsOf('section'), ...viewsOf('elevation')]) assert.deepEqual(shows(v), ['IfcDoor', 'IfcFurniture', 'IfcWall'], v.name);
  });

  it('by reference: a plan made later and given the template draws the change too, and turning it back on shows it again', () => {
    const plans = templateNamed('Plans');
    setTemplateCategory(plans.id, 'furniture', { visible: false });
    const [first, second] = viewsOf('plan');
    assert.equal(first.graphics, undefined, 'nothing was copied into the view');
    assert.equal(second.graphics, undefined);
    setTemplateCategory(plans.id, 'furniture', { visible: true });
    for (const v of viewsOf('plan')) assert.deepEqual(shows(v), ['IfcDoor', 'IfcFurniture', 'IfcWall']);
    assert.deepEqual(templateNamed('Plans').graphics, {}, 'the default is not stored');
  });

  it('a drawing\'s own graphics beat the template: this plan shows its furniture, the others do not', () => {
    setTemplateCategory(templateNamed('Plans').id, 'furniture', { visible: false });
    const [mine, ...others] = viewsOf('plan');
    setViewCategory(mine.id, 'furniture', { visible: true });
    assert.deepEqual(shows(state().views.find((v) => v.id === mine.id)!), ['IfcDoor', 'IfcFurniture', 'IfcWall']);
    for (const v of others) assert.deepEqual(shows(v), ['IfcDoor', 'IfcWall']);
  });

  it('an override is only kept when it differs from the template: asking for what the template says writes nothing', () => {
    const [mine] = viewsOf('plan');
    setViewCategory(mine.id, 'furniture', { visible: true });
    assert.equal(state().views.find((v) => v.id === mine.id)!.graphics, undefined);
    setViewCategory(mine.id, 'doors', { lineWeight: 'heavy' });
    assert.equal(overrideCount(state().views.find((v) => v.id === mine.id), state().viewTemplates!), 1);
  });
});

describe('layers hidden on one sheet', () => {
  it('one viewport hides a layer on its own sheet; the other viewport of the same drawing, and the drawing, do not', () => {
    const plan = viewsOf('plan')[0];
    const sheets = state().sheets;
    const here = sheets.find((s) => s.viewports?.some((vp) => vp.viewId === plan.id))!;
    const vp: SheetViewport = here.viewports!.find((v) => v.viewId === plan.id)!;
    const twin: SheetViewport = { ...vp, id: 'vp-twin' };
    useProjectStore.setState({ sheets: sheets.map((s) => (s.id === here.id ? { ...s, viewports: [...s.viewports!, twin] } : s)) });
    toggleViewportHiddenLayer(here.id, vp.id, 'wall-layer');
    const after = state().sheets.find((s) => s.id === here.id)!.viewports!;
    assert.deepEqual(viewportHiddenLayers(plan, after.find((v) => v.id === vp.id)), ['wall-layer']);
    assert.deepEqual(viewportHiddenLayers(plan, after.find((v) => v.id === 'vp-twin')), []);
    assert.equal(state().views.find((v) => v.id === plan.id)!.hiddenLayers, undefined);
  });

  it('is still there when furniture goes off in the template: the two settings are independent', () => {
    const plan = viewsOf('plan')[0];
    const here = state().sheets.find((s) => s.viewports?.some((v) => v.viewId === plan.id))!;
    const vp = here.viewports!.find((v) => v.viewId === plan.id)!;
    toggleViewportHiddenLayer(here.id, vp.id, 'wall-layer');
    setTemplateCategory(templateNamed('Plans').id, 'furniture', { visible: false });
    assert.deepEqual(state().sheets.find((s) => s.id === here.id)!.viewports!.find((v) => v.id === vp.id)!.hiddenLayers, ['wall-layer']);
  });
});

describe('save, apply, detach, reset and delete', () => {
  it('saving a drawing\'s graphics as a template keeps how it looks, and the drawing follows the new template', () => {
    const [plan, other] = viewsOf('plan');
    setViewCategory(plan.id, 'furniture', { visible: false });
    setViewCategory(plan.id, 'walls', { lineWeight: 'heavy' });
    const before = shows(state().views.find((v) => v.id === plan.id)!);
    const id = saveViewAsTemplate(plan.id, 'Presentation plans')!;
    const saved = state().views.find((v) => v.id === plan.id)!;
    assert.equal(saved.templateId, id);
    assert.equal(saved.graphics, undefined, 'its overrides moved into the template');
    assert.deepEqual(shows(saved), before);
    assert.equal(state().viewTemplates!.find((t) => t.id === id)!.graphics.categories?.walls?.lineWeight, 'heavy');
    applyViewTemplate([other.id], id);
    assert.deepEqual(shows(state().views.find((v) => v.id === other.id)!), before);
    assert.equal(usersOf(id).length, 2);
  });

  it('applies only to drawings of the template\'s kind', () => {
    const section = viewsOf('section')[0] ?? viewsOf('elevation')[0];
    const plans = templateNamed('Plans');
    const kept = section.templateId;
    applyViewTemplate([section.id], plans.id);
    assert.equal(state().views.find((v) => v.id === section.id)!.templateId, kept);
  });

  it('detaching keeps what the drawing drew; resetting drops its overrides and keeps its colour scheme', () => {
    const [plan] = viewsOf('plan');
    setTemplateCategory(templateNamed('Plans').id, 'furniture', { visible: false });
    setViewCategory(plan.id, 'doors', { visible: false });
    const scheme = { property: 'LongName', target: 'rooms' as const };
    updateProjectView(plan.id, { graphics: { ...state().views.find((v) => v.id === plan.id)!.graphics, colourScheme: scheme } });
    resetViewOverrides(plan.id);
    assert.deepEqual(shows(state().views.find((v) => v.id === plan.id)!), ['IfcDoor', 'IfcWall']);
    assert.deepEqual(state().views.find((v) => v.id === plan.id)!.graphics, { colourScheme: scheme });
    setViewCategory(plan.id, 'walls', { visible: false });
    const looks = shows(state().views.find((v) => v.id === plan.id)!);
    detachViewTemplate(plan.id);
    const detached = state().views.find((v) => v.id === plan.id)!;
    assert.equal(detached.templateId, undefined);
    assert.deepEqual(shows(detached, []), looks);
    // …and it no longer follows the template.
    setTemplateCategory(templateNamed('Plans').id, 'doors', { visible: false });
    assert.deepEqual(shows(state().views.find((v) => v.id === plan.id)!), looks);
  });

  it('deleting a template keeps every drawing that followed it drawing as it did, and those that did not are untouched', () => {
    const plans = templateNamed('Plans');
    setTemplateCategory(plans.id, 'furniture', { visible: false });
    setTemplateCategory(plans.id, 'walls', { lineWeight: 'light' });
    const [mine] = viewsOf('plan');
    setViewCategory(mine.id, 'walls', { lineWeight: 'heavy' });
    const before = new Map(state().views.map((v) => [v.id, resolveViewGraphics(v, state().viewTemplates)]));
    deleteViewTemplate(plans.id);
    assert.equal(state().viewTemplates!.some((t) => t.id === plans.id), false);
    for (const v of state().views) {
      assert.equal(v.templateId === plans.id, false);
      assert.deepEqual(resolveViewGraphics(v, state().viewTemplates), before.get(v.id), v.name);
    }
    for (const v of viewsOf('plan')) assert.deepEqual(shows(v), ['IfcDoor', 'IfcWall']);
    assert.equal(viewsOf('elevation')[0].templateId, templateNamed('Elevations').id);
  });

  it('renames a template to a name no other has', () => {
    renameViewTemplate(templateNamed('Plans').id, 'Sections');
    assert.deepEqual(state().viewTemplates!.map((t) => t.name), ['Sections 2', 'Sections', 'Elevations']);
  });
});

describe('a project from before view templates', () => {
  it('draws as it did: views with graphics of their own and no template resolve to those very graphics', () => {
    const [plan] = viewsOf('plan');
    const own = { categories: { furniture: { visible: false as const }, walls: { lineWeight: 'heavy' as const } } };
    useProjectStore.setState({ viewTemplates: [], views: state().views.map((v) => ({ ...v, templateId: undefined, graphics: v.id === plan.id ? own : undefined }) as ProjectView) });
    const reopened = parseProjectFile(serializeProject(projectDocument()));
    const old = reopened.views.find((v) => v.id === plan.id)!;
    assert.equal(old.templateId, undefined);
    assert.deepEqual(old.graphics, own);
    assert.equal(resolveViewGraphics(old, reopened.viewTemplates), old.graphics);
    assert.deepEqual(shows(old, reopened.viewTemplates), ['IfcDoor', 'IfcWall']);
  });

  it('a file with no viewTemplates opens with none', () => {
    const { viewTemplates: _gone, ...without } = JSON.parse(serializeProject(projectDocument())) as Record<string, unknown>;
    assert.deepEqual(parseProjectFile(JSON.stringify(without)).viewTemplates, []);
  });

  it('templates and the views\' names for them are saved and come back, an override that shows what the template hides included', () => {
    const plans = templateNamed('Plans');
    setTemplateCategory(plans.id, 'furniture', { visible: false });
    const [mine] = viewsOf('plan');
    setViewCategory(mine.id, 'furniture', { visible: true });
    const reopened = parseProjectFile(serializeProject(projectDocument()));
    assert.deepEqual(reopened.viewTemplates, state().viewTemplates);
    const back = reopened.views.find((v) => v.id === mine.id)!;
    assert.equal(back.templateId, plans.id);
    assert.deepEqual(shows(back, reopened.viewTemplates), ['IfcDoor', 'IfcFurniture', 'IfcWall']);
  });
});

describe('the engine and the app draw the same sheet', () => {
  it('the app\'s styled drawing and the engine\'s sheet drop the same categories, with a template, an override and none', () => {
    setTemplateCategory(templateNamed('Plans').id, 'furniture', { visible: false });
    const [withTemplate, withOverride, detached] = viewsOf('plan');
    setViewCategory(withOverride.id, 'furniture', { visible: true });
    setViewCategory(withOverride.id, 'doors', { visible: false });
    detachViewTemplate(detached.id);
    const doc = projectDocument();
    for (const view of [withTemplate, withOverride, detached, viewsOf('elevation')[0]]) {
      const live = doc.views.find((v) => v.id === view.id)!;
      const app = styledDrawing(drawing, resolveViewGraphics(live, doc.viewTemplates));
      const sheet = state().sheets.find((s) => s.viewports?.some((vp) => vp.viewId === view.id))!;
      // The drawing centred in its own box, so nothing is clipped away and the counts compare whole.
      const one = { ...sheet, viewports: [{ ...sheet.viewports!.find((vp) => vp.viewId === view.id)!, center: null }] };
      const engine = sheetGraphic(one, doc, new Map([[view.id, drawing]]), null);
      assert.equal(engine.cut.length, app.cutPolygons.length, `${view.name} cut`);
      assert.equal(engine.lines.length, app.lines.length, `${view.name} lines`);
      assert.ok(engine.cut.length + engine.lines.length > 0, `${view.name} draws something`);
    }
  });
});

describe('every edit is one undo step', () => {
  const everything = () => JSON.stringify({ views: state().views, templates: state().viewTemplates, sheets: state().sheets });

  function oneStep(label: string, edit: () => void): void {
    clearDraftHistory();
    const before = everything();
    edit();
    const after = everything();
    assert.notEqual(after, before, `${label}: the edit changed something`);
    assert.equal(undoDrafts(), true, label);
    assert.equal(everything(), before, `${label}: one undo returns to the state before`);
    assert.equal(undoDrafts(), false, `${label}: and it was the only step`);
    assert.equal(redoDrafts(), true, label);
    assert.equal(everything(), after, `${label}: redo reapplies it`);
    redoDrafts();
  }

  it('each action the card and the list make', () => {
    const plans = templateNamed('Plans');
    const [a, b] = viewsOf('plan');
    oneStep('template category', () => setTemplateCategory(plans.id, 'furniture', { visible: false }));
    oneStep('view category', () => setViewCategory(a.id, 'doors', { lineWeight: 'heavy' }));
    oneStep('save as template', () => { saveViewAsTemplate(a.id, 'Mine'); });
    oneStep('apply', () => applyViewTemplate([b.id], state().viewTemplates!.find((t) => t.name === 'Mine')!.id));
    oneStep('rename', () => renameViewTemplate(plans.id, 'House plans'));
    oneStep('detach', () => detachViewTemplate(b.id));
    setViewCategory(a.id, 'walls', { visible: false });
    oneStep('reset overrides', () => resetViewOverrides(a.id));
    const sheet = state().sheets.find((s) => s.viewports?.some((vp) => vp.viewId === a.id))!;
    oneStep('viewport layer', () => toggleViewportHiddenLayer(sheet.id, sheet.viewports!.find((vp) => vp.viewId === a.id)!.id, 'L'));
    oneStep('delete (detaching all its users)', () => deleteViewTemplate(plans.id));
  });
});
