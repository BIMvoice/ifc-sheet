/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * View templates (#44) on the demo set (bloc-p4, five storeys): one change to the "Plans" template takes a category out of
 * every plan at once, and the elevations and sections, which follow other templates, are not touched. The demo model holds
 * no furniture, so the category is the doors (86 of them): the rule is the same for any category.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet, type ProjectDocument } from './index.js';
import { generateViewDrawings, openModel, sheetGraphic, type OpenedModel } from './headless.js';

const BLOC = fileURLToPath(new URL('../../../apps/viewer/public/samples/bloc-p4.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const noWasm = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

/** The doc with the template `name` changed by `edit`: the one write the Wall's template list makes. */
const withTemplate = (doc: ProjectDocument, name: string, edit: (g: NonNullable<ProjectDocument['viewTemplates']>[number]['graphics']) => void): ProjectDocument => ({
  ...doc,
  viewTemplates: doc.viewTemplates?.map((t) => (t.name === name ? { ...t, graphics: (() => { const g = structuredClone(t.graphics); edit(g); return g; })() } : t)),
});

describe.skipIf(noWasm !== null)('turning a category off in the Plans template (#44)', () => {
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;

  beforeAll(async () => {
    const model: OpenedModel = await openModel(new Uint8Array(readFileSync(BLOC)));
    const made = generateDefaultSet(model, { now: Date.UTC(2026, 9, 25) });
    if (!made || !model.extent) throw new Error('no set');
    set = made;
    drawings = await generateViewDrawings(set.document.views, model.buildingMeshes, set.levels, model.extent);
  }, 300_000);

  const count = (doc: ProjectDocument, kind: string): Map<string, number> => {
    const out = new Map<string, number>();
    for (const sheet of doc.sheets) {
      for (const vp of sheet.viewports ?? []) {
        const view = doc.views.find((v) => v.id === vp.viewId);
        if (view?.kind !== kind) continue;
        const one = { ...sheet, viewports: [vp] };
        const g = sheetGraphic(one, doc, drawings, null);
        out.set(view.id, g.cut.length + g.lines.length);
      }
    }
    return out;
  };

  it('the starting set names the three templates on the plans, elevations and sections', () => {
    const { views, viewTemplates } = set.document;
    expect(viewTemplates?.map((t) => t.name)).toEqual(['Plans', 'Sections', 'Elevations']);
    for (const v of views) {
      if (v.kind === '3d') expect(v.templateId).toBeUndefined();
      else expect(viewTemplates?.find((t) => t.id === v.templateId)?.kind).toBe(v.kind);
    }
  });

  it('removes the doors from every plan at once, and leaves the sections and elevations as they were', () => {
    const before = set.document;
    const after = withTemplate(before, 'Plans', (g) => { g.categories = { doors: { visible: false } }; });
    const plansBefore = count(before, 'plan');
    const plansAfter = count(after, 'plan');
    expect(plansBefore.size).toBe(5);
    for (const [id, n] of plansBefore) expect(plansAfter.get(id), `plan ${id}`).toBeLessThan(n);
    for (const kind of ['section', 'elevation']) expect(count(after, kind)).toEqual(count(before, kind));
  });

  it('a plan whose own graphics show the doors again keeps them: the view\'s override beats the template', () => {
    const hidden = withTemplate(set.document, 'Plans', (g) => { g.categories = { doors: { visible: false } }; });
    const first = hidden.views.find((v) => v.kind === 'plan')!;
    const overridden: ProjectDocument = { ...hidden, views: hidden.views.map((v) => (v.id === first.id ? { ...v, graphics: { categories: { doors: { visible: true } } } } : v)) };
    expect(count(overridden, 'plan').get(first.id)).toBe(count(set.document, 'plan').get(first.id));
    const others = [...count(overridden, 'plan')].filter(([id]) => id !== first.id);
    for (const [id, n] of others) expect(n, id).toBeLessThan(count(set.document, 'plan').get(id)!);
  });

  it('a project from before templates (no template named) draws as its own graphics say', () => {
    const old: ProjectDocument = { ...set.document, viewTemplates: undefined, views: set.document.views.map(({ templateId: _t, ...v }) => v as typeof v) };
    expect(count(old, 'plan')).toEqual(count(set.document, 'plan'));
  });
});
