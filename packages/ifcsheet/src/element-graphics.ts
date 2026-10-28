/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Graphics of single elements in a view (#32, #33): hide one element, draw one differently, hide one line of the model drawing.
 *
 * Everything is keyed by the element's IFC GlobalId, never by the express id the drawing carries (that changes with every load),
 * so it survives a model reload. A line has no GlobalId of its own; it is keyed by its element's plus where it lies (`lineKey`).
 *
 * The layers, the later winning field by field (`resolveViewGraphics` in `view-templates.ts` builds the first two, this module the
 * last, over the SAME resolved graphics, so the web app, the sheets and the command line cannot disagree):
 *
 *   template  <  the view's category graphics  <  the element's override
 *
 * with the viewport's hidden drafting layers on top for what a sheet draws (those are drafting layers, not model elements).
 * An element listed in `hiddenElements` is hidden whatever else says: an element override cannot show it. To show it again the
 * element is taken off the list.
 */

import type { CategoryLineWeight, ElementGraphics, ElementLineStyle, GlobalId, ViewGraphics } from './view-graphics-types.js';
import { VIEW_CATEGORY_CLASSES } from './view-templates.js';

const CATEGORY_OF = new Map<string, string>(VIEW_CATEGORY_CLASSES.flatMap((c) => c.classes.map((k) => [k.toUpperCase(), c.id] as const)));

/** The category an IFC class belongs to in a view's graphics, or null. */
export function categoryIdOf(ifcType: string | undefined): string | null {
  return ifcType ? CATEGORY_OF.get(ifcType.toUpperCase()) ?? null : null;
}

/** What an element draws with in a view once the category's and its own graphics are laid together. */
export interface ElementStyle {
  visible: boolean;
  lineColor?: string;
  fillColor?: string;
  cutWeight?: CategoryLineWeight;
  projectionWeight?: CategoryLineWeight;
  /** Absent: the line style the category or the phase gives. */
  lineStyle?: ElementLineStyle;
  cutHatch?: string;
  hatchScale?: number;
  /**
   * Only what the ELEMENT says (its override, without `about`). The fields above lay it over the category's; a client with a layer of
   * its own between the two (the app's phases draw over their category) puts this over that layer instead.
   */
  own: Omit<ElementGraphics, 'about' | 'visible'>;
}

const SEP = '|';

/** Millimetres in a drawing metre: line ends are rounded to this, so a rebuilt drawing of the same geometry gives the same key. */
const KEY_STEP = 1000;

interface Pt { x: number; y: number }

/** Where a line lies, as text: its two ends rounded to a millimetre in the view's drawing coordinates, the lower end first so the direction does not matter. */
export function lineKey(line: { start: Pt; end: Pt }): string {
  const a = [Math.round(line.start.x * KEY_STEP), Math.round(line.start.y * KEY_STEP)];
  const b = [Math.round(line.end.x * KEY_STEP), Math.round(line.end.y * KEY_STEP)];
  const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
  return `${p[0] + 0},${p[1] + 0},${q[0] + 0},${q[1] + 0}`;
}

/** The entry `hiddenLines` holds for a line of an element. */
export const hiddenLineEntry = (globalId: GlobalId, line: { start: Pt; end: Pt }): string => `${globalId}${SEP}${lineKey(line)}`;

/** The element an entry of `hiddenLines` belongs to. */
export const hiddenLineElement = (entry: string): GlobalId => entry.slice(0, Math.max(entry.indexOf(SEP), 0));

interface Index {
  hidden: ReadonlySet<GlobalId>;
  lines: ReadonlySet<string>;
  elements: Readonly<Record<GlobalId, ElementGraphics>>;
}

const NO_ELEMENTS: Readonly<Record<GlobalId, ElementGraphics>> = Object.freeze({});
const indexes = new WeakMap<object, Index>();

function indexOf(graphics: ViewGraphics): Index {
  let made = indexes.get(graphics);
  if (!made) indexes.set(graphics, (made = { hidden: new Set(graphics.hiddenElements), lines: new Set(graphics.hiddenLines), elements: graphics.elements ?? NO_ELEMENTS }));
  return made;
}

/** Whether `graphics` says anything about single elements or lines (a view that does not takes the cheap path everywhere). */
export function hasElementGraphics(graphics: ViewGraphics | undefined): graphics is ViewGraphics {
  return !!graphics && ((graphics.hiddenElements?.length ?? 0) > 0 || (graphics.hiddenLines?.length ?? 0) > 0 || Object.keys(graphics.elements ?? {}).length > 0);
}

/**
 * How `globalId` draws in a view whose resolved graphics are `graphics` (`ifcType`: its class, which picks its category). `null`
 * when the view says nothing about this element: it draws as its category says, nothing more to apply.
 */
export function resolveElementGraphics(graphics: ViewGraphics | undefined, globalId: GlobalId | null | undefined, ifcType: string | undefined): ElementStyle | null {
  if (!graphics || !globalId || !hasElementGraphics(graphics)) return null;
  const { hidden, elements } = indexOf(graphics);
  const own = elements[globalId];
  if (!own && !hidden.has(globalId)) return null;
  const categoryId = categoryIdOf(ifcType);
  const category = categoryId ? graphics.categories?.[categoryId] : undefined;
  // Layer 1 (template, then the view's category graphics: already one object) …
  const base: ElementGraphics = {
    ...(category?.visible !== undefined ? { visible: category.visible } : {}),
    ...(category?.lineColor ? { lineColor: category.lineColor } : {}),
    ...(category?.fillColor ? { fillColor: category.fillColor } : {}),
    ...(category?.lineWeight ? { cutWeight: category.lineWeight, projectionWeight: category.lineWeight } : {}),
    ...(category?.cutHatch ? { cutHatch: category.cutHatch } : {}),
    ...(category?.hatchScale ? { hatchScale: category.hatchScale } : {}),
  };
  // … then the element's own, the most specific, over it, field by field.
  const merged: ElementGraphics = { ...base };
  for (const [key, value] of Object.entries(own ?? {}) as [keyof ElementGraphics, unknown][]) if (value !== undefined) Object.assign(merged, { [key]: value });
  const { about: _about, visible: _visible, ...ownStyle } = own ?? {};
  return {
    own: ownStyle,
    visible: hidden.has(globalId) ? false : merged.visible !== false,
    ...(merged.lineColor ? { lineColor: merged.lineColor } : {}),
    ...(merged.fillColor ? { fillColor: merged.fillColor } : {}),
    ...(merged.cutWeight ? { cutWeight: merged.cutWeight } : {}),
    ...(merged.projectionWeight ? { projectionWeight: merged.projectionWeight } : {}),
    ...(merged.lineStyle ? { lineStyle: merged.lineStyle } : {}),
    ...(merged.cutHatch ? { cutHatch: merged.cutHatch } : {}),
    ...(merged.hatchScale ? { hatchScale: merged.hatchScale } : {}),
  };
}

/** Whether the element's faces and lines are drawn: its own word (hidden / visible) over its category's. */
export function elementShown(graphics: ViewGraphics | undefined, globalId: GlobalId | null | undefined, ifcType: string | undefined): boolean {
  const style = resolveElementGraphics(graphics, globalId, ifcType);
  if (style) return style.visible;
  const id = categoryIdOf(ifcType);
  return !(id && graphics?.categories?.[id]?.visible === false);
}

/** The elements the view hides one by one: the ones in `hiddenElements` and those whose override says `visible: false`. */
export function hiddenElementIds(graphics: ViewGraphics | undefined): GlobalId[] {
  if (!graphics) return [];
  const ids = new Set(graphics.hiddenElements);
  for (const [id, g] of Object.entries(graphics.elements ?? {})) if (g.visible === false) ids.add(id);
  return [...ids];
}

/** Whether this one line of `globalId`'s is hidden. */
export function lineHidden(graphics: ViewGraphics | undefined, globalId: GlobalId | null | undefined, line: { start: Pt; end: Pt }): boolean {
  if (!graphics || !globalId || !graphics.hiddenLines?.length) return false;
  return indexOf(graphics).lines.has(hiddenLineEntry(globalId, line));
}

/** What a view says about an element the model no longer has (or has under another GlobalId): kept, and listed so it can be looked at. */
export interface OrphanElement {
  globalId: GlobalId;
  hidden: boolean;
  /** It has an override. */
  overridden: boolean;
  /** Hidden lines of it. */
  lines: number;
  /** What it was called when it was set. */
  about?: string;
}

/** The elements `graphics` speaks of that `present` does not know, in the order they were first mentioned. */
export function orphanElements(graphics: ViewGraphics | undefined, present: (globalId: GlobalId) => boolean): OrphanElement[] {
  if (!hasElementGraphics(graphics)) return [];
  const found = new Map<GlobalId, OrphanElement>();
  const at = (globalId: GlobalId): OrphanElement | null => {
    if (present(globalId)) return null;
    let o = found.get(globalId);
    if (!o) found.set(globalId, (o = { globalId, hidden: false, overridden: false, lines: 0 }));
    return o;
  };
  for (const id of hiddenElementIds(graphics)) { const o = at(id); if (o) o.hidden = true; }
  for (const [id, g] of Object.entries(graphics.elements ?? {})) { const o = at(id); if (o) { o.overridden = true; if (g.about) o.about = g.about; } }
  for (const entry of graphics.hiddenLines ?? []) { const o = at(hiddenLineElement(entry)); if (o) o.lines += 1; }
  return [...found.values()];
}

/** `graphics` with everything it says about `globalIds` taken off (the elements shown again, their overrides and hidden lines dropped). */
export function withoutElements(graphics: ViewGraphics, globalIds: Iterable<GlobalId>): ViewGraphics {
  const drop = new Set(globalIds);
  const { hiddenElements, elements, hiddenLines, ...rest } = graphics;
  const keptHidden = hiddenElements?.filter((id) => !drop.has(id));
  const keptElements = Object.entries(elements ?? {}).filter(([id]) => !drop.has(id));
  const keptLines = hiddenLines?.filter((e) => !drop.has(hiddenLineElement(e)));
  return {
    ...rest,
    ...(keptHidden?.length ? { hiddenElements: keptHidden } : {}),
    ...(keptElements.length ? { elements: Object.fromEntries(keptElements) } : {}),
    ...(keptLines?.length ? { hiddenLines: keptLines } : {}),
  };
}
