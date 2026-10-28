/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The detail level of a view template (#444), set in the template list: a view that follows the template draws at the template's
 * level (coarse at 1:50, where the scale alone says fine), a view's own level wins, the project keeps the template's level, and the
 * view's Visibility / Graphics dialog says when the level is the template's. Texts in both languages.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { atDetailLevel, resolveDetailLevel, resolveViewGraphics } from '@bimvoice/ifcsheet';
import { cleanup, render } from '@/test/render.js';
import { clearDraftHistory } from '@/drafting/draft-store';
import { loadProjectDocument, projectDocument, resetProject, syncProjectWithModels, updateProjectView, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { ViewGraphicsDialog } from '@/components/viewer/project/ViewGraphicsDialog';
import { ViewTemplatesPanel } from './ViewTemplatesPanel';

const state = () => useProjectStore.getState();
const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const plans = () => state().viewTemplates!.find((t) => t.name === 'Plans')!;
const rect = (x: number) => [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }, { x, y: 1 }];
const band = (x: number, materialId: number) => ({ entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true, materialId, color: [0.5, 0.5, 0.5, 1], polygon: { outer: rect(x), holes: [] } });
/** One wall of three layers, and the cut line between two of them. */
const drawing = {
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  config: { plane: { axis: 'y' } },
  cutPolygons: [band(0, 7), band(1, 8), band(2, 9)],
  lines: [
    { entityId: 1, ifcType: 'IfcWall', category: 'cut', visibility: 'visible', line: { start: { x: 0, y: 0 }, end: { x: 3, y: 0 } } },
    { entityId: 1, ifcType: 'IfcWall', category: 'cut', visibility: 'visible', line: { start: { x: 1, y: 0 }, end: { x: 1, y: 1 } } },
  ],
} as unknown as Drawing2D;

/** The lines the view draws of the wall at 1:`scale`: the app's own calls (`DraftingView`). */
function linesAt(viewId: string, scale: number): number {
  const graphics = resolveViewGraphics(state().views.find((v) => v.id === viewId), state().viewTemplates);
  return atDetailLevel(drawing, resolveDetailLevel(graphics, scale)).lines.length;
}
function choose(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  act(() => { setter.call(select, value); select.dispatchEvent(new window.Event('change', { bubbles: true })); });
}
function templateSelect() {
  const ui = render(<ViewTemplatesPanel />);
  ui.querySelector('details')!.open = true;
  const row = [...ui.querySelectorAll('li')].find((li) => (li.querySelector('input') as HTMLInputElement | null)?.value === 'Plans')!;
  return row.querySelector<HTMLSelectElement>('select[aria-label="Detail level"], select[aria-label="Nivel de detaliu"]')!;
}

let viewId = '';
beforeEach(() => {
  resetProject();
  clearDraftHistory();
  registerLocale('ro', checkCatalogue(ro).catalogue);
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }]);
  startDrawingSet(null, bounds);
  viewId = state().views.find((v) => v.kind === 'plan')!.id;
  clearDraftHistory();
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

describe('the detail level of a view template', () => {
  it('follows the scale by default, then a template set to coarse makes a view that uses it draw coarse at 1:50', () => {
    const select = templateSelect();
    assert.equal(select.value, '');
    assert.equal(select.options[0].textContent, 'Follow the scale');
    assert.equal(plans().graphics.detailLevel, undefined);
    assert.equal(linesAt(viewId, 50), 2, 'fine at 1:50: the layer line is drawn');

    choose(select, 'coarse');
    assert.equal(plans().graphics.detailLevel, 'coarse');
    assert.equal(linesAt(viewId, 50), 1, 'coarse: no layer line');

    choose(select, '');
    assert.equal('detailLevel' in plans().graphics, false);
    assert.equal(linesAt(viewId, 50), 2);
  });

  it("a view's own level wins over the template's", () => {
    choose(templateSelect(), 'coarse');
    updateProjectView(viewId, { graphics: { ...state().views.find((v) => v.id === viewId)!.graphics, detailLevel: 'fine' } });
    assert.equal(linesAt(viewId, 50), 2);
  });

  it('the project keeps the level of the template across save and reopen', () => {
    choose(templateSelect(), 'medium');
    const reopened = parseProjectFile(serializeProject(projectDocument()));
    resetProject();
    loadProjectDocument(reopened);
    assert.equal(plans().graphics.detailLevel, 'medium');
    assert.equal(templateSelect().value, 'medium');
  });

  it("the view's own select shows the level it inherits, and a view's own level replaces it", () => {
    choose(templateSelect(), 'coarse');
    const view = () => state().views.find((v) => v.id === viewId)!;
    render(<ViewGraphicsDialog view={view()} open onOpenChange={() => {}} />);
    const select = document.querySelector<HTMLSelectElement>('[role="dialog"] select[aria-label="Detail level"]')!;
    assert.equal(select.options[0].textContent, 'From the template (Coarse (outlines only))');
    assert.equal(select.value, '');
  });

  it('has its texts in Romanian too', () => {
    act(() => setLocale('ro'));
    const select = templateSelect();
    assert.equal(select.getAttribute('aria-label'), 'Nivel de detaliu');
    assert.equal(select.options[0].textContent, 'După scară');
  });
});
