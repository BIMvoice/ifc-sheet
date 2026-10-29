/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a colour scheme paints on one view's drawing (#92): for `rooms`, the
 * footprint of each room (IfcSpace) of the plan at its cut, filled under the
 * linework; for `elements`, the cut faces of the elements of the chosen
 * classes. Both come with the entries the legend lists, taken from the very
 * same elements, so a legend cannot list a value the plan does not show.
 * The app (`project/view-colour-scheme.ts`) and the headless engine
 * (`set-sheets.ts`) both call {@link resolveScheme}; only how a property is
 * read differs (`valueOf`).
 */

import { compareKeys, schemeEntries, valueKey, valueText, type ColourScheme, type SchemeEntry } from './colour-scheme.js';
import type { ProjectLevel, ProjectView } from './document.js';
import { resolveViewGraphics, type ProjectViewTemplate } from './view-templates.js';
import { elementShown } from './element-graphics.js';
import type { GlobalId, ViewGraphics } from './view-graphics-types.js';
import { roomFootprints, type Pt, type SpaceMesh } from './footprint.js';
import { levelFloorY, resolvePlanLevel } from './view-defaults.js';

/** A room filled with the colour of its value, in the drawing's frame. */
export interface SchemeFill {
  /** The space's renderer id. */
  entityId: number;
  outer: Pt[];
  holes: Pt[][];
  /** `#rrggbb`. */
  colour: string;
  /** The value key it was coloured for. */
  key: string;
  /** The pattern the value is hatched with over its colour (#493), when it has one. */
  hatch?: string;
}

export interface SchemeResult {
  /** `rooms`: the fills to draw under the linework. Empty for `elements`. */
  fills: SchemeFill[];
  /** `elements`: the colour of each painted element, by renderer id. Empty for `rooms`. */
  elementColours: Map<number, string>;
  /** The values the view shows, with their colours: what the legend lists. */
  entries: SchemeEntry[];
}

/**
 * The scheme without the rooms the view hides (the Spaces category, or the one room), and the legend entries of values none of the shown rooms carries. A room's colour and its hatch are both made from
 * `fills`, so this is the one visibility check for the two: a hidden room keeps neither on the paper. The app's sheets (`styledDrawing`)
 * and the headless build (`sheetGraphic`) both call it.
 */
export function shownRooms(scheme: SchemeResult | null | undefined, graphics: ViewGraphics | undefined, globalIdOf?: (entityId: number) => GlobalId | string | null | undefined): SchemeResult | null | undefined {
  if (!scheme || !graphics) return scheme;
  const fills = scheme.fills.filter((f) => elementShown(graphics, globalIdOf?.(f.entityId) as GlobalId | null | undefined, 'IfcSpace'));
  if (fills.length === scheme.fills.length) return scheme;
  // The legend lists the values a room still carries: a value whose only rooms are hidden is not on the sheet.
  const kept = new Set(fills.map((f) => f.key));
  return { ...scheme, fills, entries: scheme.entries.filter((e) => kept.has(e.key)) };
}

export interface SchemeSource {
  /** The geometry the drawing was cut from (the spaces among it are the rooms). */
  meshes: readonly (SpaceMesh & { expressId: number; ifcType?: string; origin?: readonly number[] })[];
  /** The cut faces of the view's drawing. */
  cutPolygons: readonly { entityId: number; ifcType?: string }[];
  /** A plan's cut height and its level's floor, in the viewer frame (metres); `null` for a view with no floor (a section): no rooms. */
  plan: { cut: number; floor: number } | null;
  /** The raw value the scheme's property has on the element with this renderer id (`undefined`: none). */
  valueOf(renderId: number, ifcType?: string): unknown;
}

/**
 * The colour scheme `view` is drawn with (#92, #493): its own, else its template's; `undefined` for neither and for a scheme that is
 * switched off. Every reader of a view's scheme (the app's drawing and legend, the headless sheets) asks here, so they cannot disagree.
 */
export function activeColourScheme(view: Pick<ProjectView, 'graphics' | 'templateId'> | undefined, templates: readonly ProjectViewTemplate[] | undefined): ColourScheme | undefined {
  const scheme = resolveViewGraphics(view, templates)?.colourScheme;
  return scheme && !scheme.off ? scheme : undefined;
}

const EMPTY: SchemeResult = { fills: [], elementColours: new Map(), entries: [] };

/** What `scheme` paints on a view drawn from `source`. */
export function resolveScheme(scheme: ColourScheme, source: SchemeSource): SchemeResult {
  // A switched-off scheme paints nothing and lists nothing (#493).
  if (scheme.off) return EMPTY;
  const found = new Map<string, { label: string; ids: Set<number> }>();
  const seen = (id: number, raw: unknown): string | null => {
    const text = valueText(raw);
    if (text === null) return null;
    const key = valueKey(text);
    const at = found.get(key) ?? { label: text, ids: new Set<number>() };
    // Two spellings of one value: the first in code-point order is the one shown, whichever the model lists first.
    if (text < at.label) at.label = text;
    at.ids.add(id);
    found.set(key, at);
    return key;
  };
  const read = new Map<number, string | null>();
  const keyOf = (id: number, ifcType?: string): string | null => {
    if (!read.has(id)) read.set(id, seen(id, source.valueOf(id, ifcType)));
    return read.get(id)!;
  };

  if (scheme.target === 'rooms') {
    if (!source.plan) return EMPTY;
    const rooms = roomFootprints(source.meshes, source.plan.cut, source.plan.floor)
      .flatMap((r) => { const key = keyOf(r.renderId, 'IfcSpace'); return key === null ? [] : [{ r, key }]; });
    const colours = schemeEntriesOf(found, scheme);
    const hatchOf = new Map(colours.entries.flatMap((e) => (e.hatch ? [[e.key, e.hatch] as const] : [])));
    return {
      fills: rooms.map(({ r, key }) => ({ entityId: r.renderId, outer: r.ring, holes: [], colour: colours.byKey.get(key)!, key, ...(hatchOf.has(key) ? { hatch: hatchOf.get(key) } : {}) })),
      elementColours: new Map(),
      entries: colours.entries,
    };
  }

  const classes = scheme.classes?.length ? new Set(scheme.classes.map((c) => c.toUpperCase())) : null;
  const painted = new Map<number, string>();
  for (const p of source.cutPolygons) {
    if (classes && !classes.has((p.ifcType ?? '').toUpperCase())) continue;
    const key = keyOf(p.entityId, p.ifcType);
    if (key !== null) painted.set(p.entityId, key);
  }
  const colours = schemeEntriesOf(found, scheme);
  const elementColours = new Map<number, string>();
  for (const [id, key] of painted) elementColours.set(id, colours.byKey.get(key)!);
  // Elements are painted by colour only: a hatch the scheme holds for a value would be listed and never drawn.
  return { fills: [], elementColours, entries: colours.entries.map(({ hatch: _hatch, ...rest }) => rest) };
}

function schemeEntriesOf(found: ReadonlyMap<string, { label: string; ids: ReadonlySet<number> }>, scheme: ColourScheme): { entries: SchemeEntry[]; byKey: Map<string, string> } {
  const entries = schemeEntries(found, scheme);
  return { entries, byKey: new Map(entries.map((e) => [e.key, e.colour])) };
}

/** The rooms' fills in the order they are drawn: by value, then renderer id, so the picture does not depend on the order the model lists spaces in. */
export function orderedFills(fills: readonly SchemeFill[]): SchemeFill[] {
  return [...fills].sort((a, b) => compareKeys(a.key, b.key) || a.entityId - b.entityId);
}

/** Where a plan cuts and where its level's floor is (the viewer frame, metres), as the room tags read them; `null` for a view that is not a plan or whose level is gone. */
export function planHeights(view: ProjectView, levels: readonly ProjectLevel[]): { cut: number; floor: number } | null {
  if (view.kind !== 'plan') return null;
  const level = resolvePlanLevel(view, levels) ?? view.level;
  return level ? { cut: levelFloorY(level) + view.cutHeight, floor: levelFloorY(level) } : null;
}
