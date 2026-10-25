/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** View templates (#44): the layers of a view's graphics, and what the starting set gives a project. */

import { describe, expect, it } from 'vitest';
import type { ProjectView } from './document.js';
import {
  assignDefaultTemplates, defaultViewTemplates, hiddenClassesOf, resolveViewGraphics, resolveViewport, templateGraphicsOf, untemplatedGraphics, viewportHiddenLayers,
  type ProjectViewTemplate,
} from './view-templates.js';

const plans: ProjectViewTemplate = {
  id: 'vt-plans', name: 'Plans', kind: 'plan',
  graphics: { presetId: 'preset-3d-colors', categories: { furniture: { visible: false }, walls: { lineWeight: 'heavy', lineColor: '#112233' } } },
};
const plan = (extra: Partial<ProjectView> = {}): ProjectView => ({ id: 'v1', name: 'Plan', kind: 'plan', createdAt: 0, level: { name: 'L', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, ...extra }) as ProjectView;

describe('resolveViewGraphics', () => {
  it('a view with no template draws with its own graphics, the very same object', () => {
    const own = { categories: { doors: { visible: false } } };
    expect(resolveViewGraphics(plan({ graphics: own }), [plans])).toBe(own);
    expect(resolveViewGraphics(plan(), [plans])).toBeUndefined();
  });

  it('a template the project no longer has leaves the view with its own graphics', () => {
    const own = { categories: { doors: { visible: false } } };
    expect(resolveViewGraphics(plan({ graphics: own, templateId: 'gone' }), [plans])).toBe(own);
    expect(resolveViewGraphics(plan({ graphics: own, templateId: 'vt-plans' }), undefined)).toBe(own);
  });

  it('a view follows its template by reference: change the template and the view draws the change', () => {
    const view = plan({ templateId: 'vt-plans' });
    expect(hiddenClassesOf(resolveViewGraphics(view, [plans])).has('IFCFURNISHINGELEMENT')).toBe(true);
    const edited: ProjectViewTemplate = { ...plans, graphics: { ...plans.graphics, categories: { ...plans.graphics.categories, furniture: { visible: true } } } };
    expect(hiddenClassesOf(resolveViewGraphics(view, [edited])).size).toBe(0);
  });

  it('the template first, the view over it, field by field: an override beats the template and leaves its other fields', () => {
    const view = plan({ templateId: 'vt-plans', graphics: { categories: { furniture: { visible: true }, walls: { lineWeight: 'light' } } } });
    const g = resolveViewGraphics(view, [plans]);
    expect(g?.categories?.furniture?.visible).toBe(true);
    expect(g?.categories?.walls).toEqual({ lineWeight: 'light', lineColor: '#112233' });
    expect(g?.presetId).toBe('preset-3d-colors');
  });

  it('a view that turns the preset off (null) beats the template\'s preset', () => {
    expect(resolveViewGraphics(plan({ templateId: 'vt-plans', graphics: { presetId: null } }), [plans])?.presetId).toBeNull();
  });

  it('keeps what no template carries: the colour scheme and the phases stay the view\'s', () => {
    const scheme = { property: 'LongName', target: 'rooms' as const };
    const phases = { show: ['new' as const] };
    const g = resolveViewGraphics(plan({ templateId: 'vt-plans', graphics: { colourScheme: scheme, phases } }), [plans]);
    expect(g?.colourScheme).toBe(scheme);
    expect(g?.phases).toBe(phases);
    expect(templateGraphicsOf({ colourScheme: scheme, phases, categories: { doors: { visible: false } } })).toEqual({ categories: { doors: { visible: false } } });
    expect(untemplatedGraphics({ colourScheme: scheme, phases, categories: { doors: { visible: false } } })).toEqual({ colourScheme: scheme, phases });
  });

  it('the same inputs resolve to the same object, so a memo keyed on it holds', () => {
    const view = plan({ templateId: 'vt-plans', graphics: { categories: { doors: { visible: false } } } });
    expect(resolveViewGraphics(view, [plans])).toBe(resolveViewGraphics(view, [plans]));
  });
});

describe('a viewport\'s hidden layers', () => {
  it('lie over the view\'s: this viewport hides what its view shows, and the view\'s own stay hidden', () => {
    expect(viewportHiddenLayers({ hiddenLayers: ['a'] }, { hiddenLayers: ['b'] }).sort()).toEqual(['a', 'b']);
    expect(viewportHiddenLayers({ hiddenLayers: ['a'] }, undefined)).toEqual(['a']);
    expect(viewportHiddenLayers(undefined, { hiddenLayers: ['b'] })).toEqual(['b']);
  });

  it('are one viewport\'s: another viewport of the same view is not affected', () => {
    const view = plan({ templateId: 'vt-plans' });
    const one = resolveViewport(view, { hiddenLayers: ['walls-layer'] }, [plans]);
    const other = resolveViewport(view, {}, [plans]);
    expect(one.hiddenLayers).toEqual(['walls-layer']);
    expect(other.hiddenLayers).toEqual([]);
    expect(one.graphics).toBe(other.graphics);
  });
});

describe('the starting templates', () => {
  const made = defaultViewTemplates((k) => ({ plan: 'Plans', section: 'Sections', elevation: 'Elevations' })[k], (k) => `vt-${k}`);

  it('are one per kind, empty graphics (the default look), named', () => {
    expect(made.map((t) => [t.kind, t.name, t.graphics])).toEqual([['plan', 'Plans', {}], ['section', 'Sections', {}], ['elevation', 'Elevations', {}]]);
  });

  it('are named on the plans, sections and elevations; a 3D view and a view with a template already keep theirs', () => {
    const views = [plan(), plan({ id: 'v2', templateId: 'mine' }), { ...plan({ id: 'v3' }), kind: 'section' }, { ...plan({ id: 'v4' }), kind: '3d' }] as ProjectView[];
    expect(assignDefaultTemplates(views, made).map((v) => v.templateId)).toEqual(['vt-plan', 'mine', 'vt-section', undefined]);
  });
});
