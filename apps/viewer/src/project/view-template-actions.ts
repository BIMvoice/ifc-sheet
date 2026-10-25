/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Wall does with view templates (#44): name a drawing's graphics, apply them to other drawings, change them once for all
 * that use them, detach a drawing, delete a template. Plain functions on the project store, so the card, the template list and a
 * test all take the same path; every call is ONE undo step, however many views and templates it touches. The layering itself is the
 * engine's (`resolveViewGraphics`): this only decides what is written where.
 */

import {
  freshProjectId, ownGraphicsOf, resolveViewGraphics, templateGraphicsOf, templateKindOf, templateOf, untemplatedGraphics,
  type CategoryGraphics, type ProjectViewTemplate, type StyleRule, type TemplateGraphics,
} from '@bimvoice/ifcsheet';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { toggleViewportLayer } from './drafting-standards';
import { useProjectStore } from './project-store';
import type { ProjectView, ViewGraphics } from './types';

const state = () => useProjectStore.getState();
const viewOf = (id: string): ProjectView | undefined => state().views.find((v) => v.id === id);
const templatesOf = (): ProjectViewTemplate[] => state().viewTemplates ?? [];

/** `name` made different from the other templates' (case aside): "Plans", "Plans 2". */
export function uniqueTemplateName(name: string, others: readonly ProjectViewTemplate[]): string {
  const taken = new Set(others.map((t) => t.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`.toLowerCase())) return `${name} ${n}`;
}

/** The templates a view can follow: those of its kind (none for a 3D or drafting view). */
export function templatesFor(view: ProjectView | undefined, templates: readonly ProjectViewTemplate[] = templatesOf()): ProjectViewTemplate[] {
  const kind = view && templateKindOf(view);
  return kind ? templates.filter((t) => t.kind === kind) : [];
}

/** The views that follow `templateId`. */
export function usersOf(templateId: string, views: readonly ProjectView[] = state().views): ProjectView[] {
  return views.filter((v) => v.templateId === templateId);
}

/** The fields of `category` that matter once a template or the default gives the rest: `visible: true` is the default, an empty category is nothing. */
function tidy(category: CategoryGraphics): CategoryGraphics | undefined {
  const out: CategoryGraphics = { ...category };
  if (out.visible !== false) delete out.visible;
  for (const key of Object.keys(out) as (keyof CategoryGraphics)[]) if (out[key] === undefined) delete out[key];
  return Object.keys(out).length > 0 ? out : undefined;
}

/** `patch` laid over `base` (a field set to `undefined` is taken off); `null` when nothing is left. */
function patched(base: CategoryGraphics | undefined, patch: Partial<CategoryGraphics>): CategoryGraphics | undefined {
  return tidy({ ...base, ...patch });
}

/** A template's graphics with `category` changed by `patch`. */
function withCategory(graphics: TemplateGraphics, category: string, patch: Partial<CategoryGraphics>): TemplateGraphics {
  const next = patched(graphics.categories?.[category], patch);
  const { [category]: _old, ...rest } = graphics.categories ?? {};
  const categories = next ? { ...rest, [category]: next } : rest;
  const { categories: _c, ...others } = graphics;
  return Object.keys(categories).length > 0 ? { ...others, categories } : others;
}

function setViews(patch: (view: ProjectView) => ProjectView): void {
  useProjectStore.setState({ views: state().views.map(patch), dirty: true });
}

function setGraphics(viewId: string, graphics: ViewGraphics | undefined, templateId?: string | null): void {
  setViews((v) => {
    if (v.id !== viewId) return v;
    const { graphics: _g, templateId: _t, ...rest } = v;
    const keep = templateId === undefined ? v.templateId : templateId ?? undefined;
    return { ...rest, ...(graphics && Object.keys(graphics).length > 0 ? { graphics } : {}), ...(keep !== undefined ? { templateId: keep } : {}) } as ProjectView;
  });
}

// ---- Making and applying a template ----

/**
 * Name the graphics `viewId` draws with as a template, and make the view follow it. The template holds the view's EFFECTIVE graphics
 * (its old template's, then its overrides), so the drawing looks as it did; the view keeps no overrides of the parts a template carries.
 * Returns the template's id; `null` for a view no template is for.
 */
export function saveViewAsTemplate(viewId: string, name: string): string | null {
  const view = viewOf(viewId);
  const kind = view && templateKindOf(view);
  const trimmed = name.trim();
  if (!view || !kind || !trimmed) return null;
  let id = '';
  runAsOneUndoStep(() => {
    id = freshProjectId('viewtemplate');
    const template: ProjectViewTemplate = { id, name: uniqueTemplateName(trimmed, templatesOf()), kind, graphics: templateGraphicsOf(resolveViewGraphics(view, templatesOf())) };
    useProjectStore.setState({ viewTemplates: [...templatesOf(), template], dirty: true });
    setGraphics(viewId, untemplatedGraphics(view.graphics), id);
  });
  return id;
}

/** Make `viewIds` follow `templateId` (those of its kind only). Their own overrides of what a template carries are dropped: the drawing becomes the template's. */
export function applyViewTemplate(viewIds: readonly string[], templateId: string): void {
  const template = templatesOf().find((t) => t.id === templateId);
  if (!template) return;
  const targets = viewIds.filter((id) => { const v = viewOf(id); return v && templateKindOf(v) === template.kind && v.templateId !== templateId; });
  if (targets.length === 0) return;
  runAsOneUndoStep(() => { for (const id of targets) setGraphics(id, untemplatedGraphics(viewOf(id)?.graphics), templateId); });
}

/** Stop following the template and keep what it drew: the effective graphics become the view's own. */
export function detachViewTemplate(viewId: string): void {
  const view = viewOf(viewId);
  if (!view || !templateOf(view, templatesOf())) return;
  runAsOneUndoStep(() => setGraphics(viewId, ownGraphicsOf(resolveViewGraphics(view, templatesOf())), null));
}

/** Drop the view's own overrides of its template: it draws as the template says (colour scheme and phases are not overrides and stay). */
export function resetViewOverrides(viewId: string): void {
  const view = viewOf(viewId);
  if (!view || !templateOf(view, templatesOf())) return;
  runAsOneUndoStep(() => setGraphics(viewId, untemplatedGraphics(view.graphics)));
}

/** How many categories the view overrides of its template (for the card's "Reset overrides"); 0 without a template. */
export function overrideCount(view: ProjectView | undefined, templates: readonly ProjectViewTemplate[]): number {
  if (!view || !templateOf(view, templates)) return 0;
  return Object.keys(view.graphics?.categories ?? {}).length + (view.graphics?.presetId !== undefined ? 1 : 0) + (view.graphics?.grid ? 1 : 0);
}

// ---- Editing graphics ----

/**
 * Change how `category` draws in `viewId`: a view with a template overrides the template's (an override equal to what the template
 * already says is not kept), a view without one changes its own graphics. `visible: true` and an `undefined` field are the defaults.
 */
export function setViewCategory(viewId: string, category: string, patch: Partial<CategoryGraphics>): void {
  const view = viewOf(viewId);
  if (!view) return;
  runAsOneUndoStep(() => {
    const own = view.graphics ?? {};
    const template = templateOf(view, templatesOf());
    const merged: CategoryGraphics = { ...own.categories?.[category], ...patch };
    // What the view would draw without its own word on a field: the template's, else the default. A value equal to that is no override
    // (`visible: true` stays when the template hides the category: that is the override).
    const given = template?.graphics.categories?.[category];
    for (const key of Object.keys(merged) as (keyof CategoryGraphics)[]) {
      if (merged[key] === undefined || merged[key] === (given?.[key] ?? (key === 'visible' ? true : undefined))) delete merged[key];
    }
    const { [category]: _old, ...rest } = own.categories ?? {};
    const categories = Object.keys(merged).length > 0 ? { ...rest, [category]: merged } : rest;
    const { categories: _c, ...others } = own;
    const graphics: ViewGraphics = Object.keys(categories).length > 0 ? { ...others, categories } : others;
    setGraphics(viewId, graphics);
  });
}

/** Change how `category` draws in a template: every view that follows it draws the change. */
export function setTemplateCategory(templateId: string, category: string, patch: Partial<CategoryGraphics>): void {
  if (!templatesOf().some((t) => t.id === templateId)) return;
  runAsOneUndoStep(() => {
    useProjectStore.setState({ viewTemplates: templatesOf().map((t) => (t.id === templateId ? { ...t, graphics: withCategory(t.graphics, category, patch) } : t)), dirty: true });
  });
}

export function renameViewTemplate(templateId: string, name: string): void {
  const trimmed = name.trim();
  const template = templatesOf().find((t) => t.id === templateId);
  if (!template || !trimmed || trimmed === template.name) return;
  runAsOneUndoStep(() => {
    const unique = uniqueTemplateName(trimmed, templatesOf().filter((t) => t.id !== templateId));
    useProjectStore.setState({ viewTemplates: templatesOf().map((t) => (t.id === templateId ? { ...t, name: unique } : t)), dirty: true });
  });
}

/** Delete a template. The drawings that followed it keep what they drew: each takes its effective graphics as its own. */
export function deleteViewTemplate(templateId: string): void {
  const template = templatesOf().find((t) => t.id === templateId);
  if (!template) return;
  runAsOneUndoStep(() => {
    const before = templatesOf();
    setViews((v) => {
      if (v.templateId !== templateId) return v;
      const { graphics: _g, templateId: _t, ...rest } = v;
      const own = ownGraphicsOf(resolveViewGraphics(v, before));
      return { ...rest, ...(own && Object.keys(own).length > 0 ? { graphics: own } : {}) } as ProjectView;
    });
    useProjectStore.setState({ viewTemplates: before.filter((t) => t.id !== templateId), dirty: true });
  });
}

// ---- The class and material mapping (#31) ----

/** A template's graphics with its rules changed by `change` (none left: the field goes, so a template without a mapping saves as it did). */
function withRules(graphics: TemplateGraphics, change: (rules: StyleRule[]) => StyleRule[]): TemplateGraphics {
  const rules = change(graphics.styleRules ?? []);
  const { styleRules: _old, ...others } = graphics;
  return rules.length > 0 ? { ...others, styleRules: rules } : others;
}

function setRules(templateId: string, change: (rules: StyleRule[]) => StyleRule[]): void {
  if (!templatesOf().some((t) => t.id === templateId)) return;
  runAsOneUndoStep(() => {
    useProjectStore.setState({ viewTemplates: templatesOf().map((t) => (t.id === templateId ? { ...t, graphics: withRules(t.graphics, change) } : t)), dirty: true });
  });
}

/** Map `match` (an IFC class, or a material name) of `by` to `style` in a template. Returns the rule's id; `null` for a template that is gone or nothing to match. */
export function addStyleRule(templateId: string, by: StyleRule['by'], match: readonly string[], style: StyleRule['style'] = {}): string | null {
  const names = match.map((m) => m.trim()).filter(Boolean);
  if (names.length === 0 || !templatesOf().some((t) => t.id === templateId)) return null;
  const id = freshProjectId('stylerule');
  setRules(templateId, (rules) => [...rules, { id, by, match: names, style }]);
  return id;
}

/** Change a rule: what it matches, and/or its style (a style field set to `undefined` or empty is taken off). */
export function updateStyleRule(templateId: string, ruleId: string, patch: { match?: readonly string[]; style?: Partial<StyleRule['style']> }): void {
  setRules(templateId, (rules) => rules.map((r) => {
    if (r.id !== ruleId) return r;
    const style = { ...r.style, ...patch.style } as StyleRule['style'];
    for (const key of Object.keys(style) as (keyof StyleRule['style'])[]) if (style[key] === undefined || style[key] === '') delete style[key];
    const match = patch.match ? patch.match.map((m) => m.trim()).filter(Boolean) : r.match;
    return { ...r, match: match.length > 0 ? match : r.match, style };
  }));
}

export function removeStyleRule(templateId: string, ruleId: string): void {
  setRules(templateId, (rules) => rules.filter((r) => r.id !== ruleId));
}

/** The layers `viewportId` hides on its sheet: show or hide `layerId` there (one step). */
export function toggleViewportHiddenLayer(sheetId: string, viewportId: string, layerId: string): void {
  runAsOneUndoStep(() => toggleViewportLayer(sheetId, viewportId, layerId));
}
