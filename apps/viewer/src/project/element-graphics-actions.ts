/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Wall and the drawing in front do with single elements of a view (#32, #33): hide them, draw them differently, hide one
 * line, bring them back, forget the ones the model no longer has. Plain functions on the project store, so the bar, the card and a
 * test take the same path; every call is ONE undo step, however many elements it touches.
 *
 * Everything is written to the view's OWN graphics, by GlobalId, whatever template the view follows: a template cannot carry single
 * elements. The layering and the rules are the engine's (`element-graphics.ts`); this only decides what is written where.
 */

import { hiddenElementIds, hiddenLineElement, hiddenLineEntry, withoutElements, type ElementGraphics, type GlobalId } from '@bimvoice/ifcsheet';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { useProjectStore } from './project-store';
import type { ProjectView, ViewGraphics } from './types';

const state = () => useProjectStore.getState();

/** `graphics` as a view keeps it: an object with nothing in it is no graphics at all. */
const tidy = (graphics: ViewGraphics): ViewGraphics | undefined => {
  const out: ViewGraphics = { ...graphics };
  for (const key of Object.keys(out) as (keyof ViewGraphics)[]) if (out[key] === undefined) delete out[key];
  if (!out.hiddenElements?.length) delete out.hiddenElements;
  if (!out.hiddenLines?.length) delete out.hiddenLines;
  if (out.elements && Object.keys(out.elements).length === 0) delete out.elements;
  return Object.keys(out).length > 0 ? out : undefined;
};

/** Change the view's own graphics in one undo step. */
function edit(viewId: string, change: (graphics: ViewGraphics) => ViewGraphics): void {
  const view = state().views.find((v) => v.id === viewId);
  if (!view) return;
  runAsOneUndoStep(() => {
    const next = tidy(change(view.graphics ?? {}));
    useProjectStore.setState({
      views: state().views.map((v) => {
        if (v.id !== viewId) return v;
        const { graphics: _old, ...rest } = v;
        return (next ? { ...rest, graphics: next } : rest) as ProjectView;
      }),
      dirty: true,
    });
  });
}

const without = <T>(list: readonly T[] | undefined, drop: ReadonlySet<T>): T[] => (list ?? []).filter((x) => !drop.has(x));

/** Hide `ids` in the view (and only there: the 3D view and the other drawings keep them). */
export function hideElements(viewId: string, ids: readonly GlobalId[]): void {
  if (ids.length === 0) return;
  edit(viewId, (g) => {
    const elements = { ...g.elements };
    // An override that says `visible: true` would otherwise keep showing what the person just hid.
    for (const id of ids) if (elements[id]?.visible !== undefined) elements[id] = { ...elements[id], visible: undefined };
    return { ...g, hiddenElements: [...new Set([...(g.hiddenElements ?? []), ...ids])], elements: stripUndefined(elements) };
  });
}

/** Bring `ids` back (their lines too). Overrides of their colour, weight and so on stay. */
export function showElements(viewId: string, ids: readonly GlobalId[]): void {
  if (ids.length === 0) return;
  const drop = new Set(ids);
  edit(viewId, (g) => {
    const elements = { ...g.elements };
    for (const id of ids) if (elements[id]?.visible === false) elements[id] = { ...elements[id], visible: undefined };
    return { ...g, hiddenElements: without(g.hiddenElements, drop), elements: stripUndefined(elements), hiddenLines: g.hiddenLines?.filter((e) => !drop.has(hiddenLineElement(e))) };
  });
}

/** Bring back everything the view hides: elements and lines. */
export function showAllHidden(viewId: string): void {
  const view = state().views.find((v) => v.id === viewId);
  const ids = hiddenElementIds(view?.graphics);
  edit(viewId, (g) => {
    const elements = { ...g.elements };
    for (const id of ids) if (elements[id]?.visible === false) elements[id] = { ...elements[id], visible: undefined };
    const { hiddenElements: _e, hiddenLines: _l, ...rest } = g;
    return { ...rest, elements: stripUndefined(elements) };
  });
}

/** Hide one line of one element's drawing (`line`: its end points, in the view's drawing coordinates). */
export function hideLine(viewId: string, globalId: GlobalId, line: { start: { x: number; y: number }; end: { x: number; y: number } }): void {
  const entry = hiddenLineEntry(globalId, line);
  edit(viewId, (g) => ({ ...g, hiddenLines: [...new Set([...(g.hiddenLines ?? []), entry])] }));
}

/** Bring one hidden line back. */
export function showLine(viewId: string, entry: string): void {
  edit(viewId, (g) => ({ ...g, hiddenLines: without(g.hiddenLines, new Set([entry])) }));
}

/** Drop the fields that are `undefined`, and the elements left with none. */
function stripUndefined(elements: Record<GlobalId, ElementGraphics>): Record<GlobalId, ElementGraphics> | undefined {
  const out: Record<GlobalId, ElementGraphics> = {};
  for (const [id, g] of Object.entries(elements)) {
    const kept = Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined)) as ElementGraphics;
    if (Object.keys(kept).filter((k) => k !== 'about').length > 0) out[id] = kept;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Draw `ids` with `patch` laid over what their overrides already say (a field set to `undefined` is taken off). `about` names each
 * element so it can be recognised once the model no longer has it.
 */
export function setElementGraphics(viewId: string, ids: readonly GlobalId[], patch: Partial<ElementGraphics>, about: ReadonlyMap<GlobalId, string> = new Map()): void {
  if (ids.length === 0) return;
  edit(viewId, (g) => {
    const elements = { ...g.elements };
    for (const id of ids) elements[id] = { ...elements[id], ...patch, ...(about.has(id) ? { about: about.get(id) } : {}) };
    return { ...g, elements: stripUndefined(elements) };
  });
}

/** Take the overrides of `ids` off: they draw as their category says. (Hiding is separate: `showElements`.) */
export function resetElementGraphics(viewId: string, ids: readonly GlobalId[]): void {
  if (ids.length === 0) return;
  edit(viewId, (g) => {
    const elements = { ...g.elements };
    for (const id of ids) if (elements[id]) elements[id] = { visible: elements[id].visible === false ? false : undefined, about: elements[id].about };
    return { ...g, elements: stripUndefined(elements) };
  });
}

/** Forget everything the view says about `ids` (the elements the model no longer has, once the person has looked at them). */
export function forgetElements(viewId: string, ids: readonly GlobalId[]): void {
  if (ids.length === 0) return;
  edit(viewId, (g) => withoutElements(g, ids));
}
