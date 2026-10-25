/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet_add_view` (#165): a plan, elevation, section or axonometric view added to the session's set. */

import {
  defaultPlanCutHeight, elevationDepth, elevationName, elevationPlaneOffset, freshProjectId, nameOf, planViewFor, sectionPlaneThrough, uniqueViewName,
  type ElevationDirection, type ProjectLevel, type ProjectView, type SectionProjectView,
} from '@bimvoice/ifcsheet';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import { getSheetSet, replaceSheetDocument, type SheetSetEntry } from './ifcsheet-store.js';
import { DOCUMENT_ID, DRY_RUN, dryPrefix, extentOf, invalid, optBoolean, optChoice, optNumber, optText, text, unplacedViews, workingEntry } from './ifcsheet-shared.js';
import type { Tool } from './types.js';
import { okResult } from './util.js';

const KINDS = ['plan', 'elevation', 'section', 'axonometric'] as const;
const DIRECTIONS: readonly ElevationDirection[] = ['north', 'south', 'east', 'west'];
const PRESETS = ['se', 'sw', 'ne', 'nw'] as const;

/** `[x, z]` or `[x, y, z]` metres in the viewer frame from an input array. */
function point(input: Record<string, unknown>, key: string, length: 2 | 3): number[] | undefined {
  const v = input[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length !== length || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw invalid(`${key} must be [${length === 2 ? 'x, z' : 'x, y, z'}]: ${length} finite numbers, metres in the viewer frame (X east, Y up, Z south).`);
  }
  return v as number[];
}

function levelNamed(entry: SheetSetEntry, name: string): ProjectLevel {
  const key = name.trim().toLowerCase();
  const found = entry.set.levels.find((l) => l.name.trim().toLowerCase() === key);
  if (found) return found;
  throw new ToolExecutionError({
    code: ToolErrorCode.ENTITY_NOT_FOUND,
    message: `No storey '${name}'. Give one of the storey names ifcsheet_open_model lists.`,
    details: { storeys: entry.set.levels.map((l) => l.name) },
  });
}

/** The first mark (A, B, ... Z) no section is named with. */
function sectionName(views: readonly ProjectView[]): string {
  const taken = new Set(views.map((v) => v.name.toLowerCase()));
  for (let i = 0; i < 26; i++) {
    const name = nameOf('names.view.section', { mark: String.fromCharCode(65 + i) });
    if (!taken.has(name.toLowerCase())) return name;
  }
  return uniqueViewName(nameOf('names.view.section', { mark: 'Z' }), views);
}

function newView(entry: SheetSetEntry, input: Record<string, unknown>): ProjectView {
  const kind = optChoice(input, 'kind', KINDS);
  if (!kind) throw invalid(`kind is required: one of ${KINDS.join(', ')}.`);
  const views = entry.set.document.views;
  const now = Date.now();
  const name = optText(input, 'name')?.trim() || undefined;
  const extent = extentOf(entry);
  const base = { id: freshProjectId('view'), createdAt: now };
  switch (kind) {
    case 'plan': {
      const level = levelNamed(entry, text(input, 'level'));
      const cut = optNumber(input, 'cut_height_m', 0.1, 50);
      const plan = planViewFor(level, views, now, entry.set.levels);
      const { auto: _auto, ...rest } = plan;
      return { ...rest, ...(name ? { name: uniqueViewName(name, views) } : {}), ...(cut !== undefined ? { cutHeight: cut } : {}) };
    }
    case 'elevation': {
      const direction = optChoice(input, 'direction', DIRECTIONS);
      if (!direction) throw invalid(`direction is required for an elevation: one of ${DIRECTIONS.join(', ')}.`);
      return {
        ...base, kind: 'elevation', direction, name: uniqueViewName(name ?? elevationName(direction), views),
        planeOffset: elevationPlaneOffset(direction, extent), viewDepth: elevationDepth(direction, extent),
      };
    }
    case 'section': {
      const from = point(input, 'from', 2);
      const to = point(input, 'to', 2);
      const flipped = optBoolean(input, 'flipped') ?? false;
      const depth = optNumber(input, 'depth_m', 0.1, 10_000);
      const sectionBase = { ...base, kind: 'section' as const, name: uniqueViewName(name ?? sectionName(views), views), ...(depth !== undefined ? { viewDepth: depth } : {}) };
      if (from || to) {
        if (!from || !to) throw invalid('A section along a line needs both from and to: [x, z] points in plan, metres, viewer frame (X east, Z south).');
        const side = point(input, 'look_towards', 2) ?? [from[0] - (to[1] - from[1]), from[1] + (to[0] - from[0])];
        const custom = sectionPlaneThrough({ x: from[0], y: 0, z: from[1] }, { x: to[0], y: 0, z: to[1] }, { x: side[0], y: 0, z: side[1] });
        if (!custom) throw invalid('from and to are the same point: a section needs a line.');
        return { ...sectionBase, plane: { axis: 'front', offset: custom.distance, flipped: false, custom } } satisfies SectionProjectView;
      }
      const axis = optChoice(input, 'axis', ['front', 'side'] as const);
      if (!axis) throw invalid('A section needs axis ("front": plane perpendicular to Z, "side": perpendicular to X) with offset_m, or a line from/to.');
      const centre = axis === 'front' ? (extent.min.z + extent.max.z) / 2 : (extent.min.x + extent.max.x) / 2;
      return { ...sectionBase, plane: { axis, offset: optNumber(input, 'offset_m', -1e6, 1e6) ?? centre, flipped } } satisfies SectionProjectView;
    }
    case 'axonometric': {
      const preset = optChoice(input, 'preset', PRESETS) ?? 'se';
      const cutLevel = optText(input, 'cut_level');
      const cutHeight = optNumber(input, 'cut_height_m', 0.1, 50);
      const min = point(input, 'box_min', 3);
      const max = point(input, 'box_max', 3);
      if ((min === undefined) !== (max === undefined)) throw invalid('A cut-away box needs both box_min and box_max: [x, y, z] metres, viewer frame.');
      if (min && max && min.some((n, i) => n >= max[i])) throw invalid('box_min must be below box_max on every axis.');
      if (cutHeight !== undefined && !cutLevel) throw invalid('cut_height_m needs cut_level: the storey the cut is measured from.');
      const level = cutLevel ? levelNamed(entry, cutLevel) : undefined;
      const cutaway = level || min
        ? {
            ...(level ? { storey: { level, cutHeight: cutHeight ?? defaultPlanCutHeight(level, entry.set.levels) } } : {}),
            ...(min && max ? { box: { min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] } } } : {}),
          }
        : undefined;
      return { ...base, kind: '3d', name: uniqueViewName(name ?? (cutaway ? 'Cut-away axonometric' : 'Axonometric'), views), viewpoint: null, projection: 'axonometric', preset, ...(cutaway ? { cutaway } : {}) };
    }
  }
}

export const ifcsheetAddView: Tool = {
  name: 'ifcsheet_add_view',
  description:
    'Add a view to a drawing set; it is not on any sheet until ifcsheet_place_view. All lengths are metres in the viewer frame: X east, Y up, Z south (the building\'s box is "extent" in ifcsheet_open_model). kind "plan": give level (a storey name) and optionally cut_height_m (above the floor, default about 1.2). kind "elevation": give direction (north, south, east or west; the facade it looks at). kind "section": either axis ("front": a plane perpendicular to Z, "side": perpendicular to X) with offset_m (the plane\'s coordinate on that axis, default the middle of the building) and flipped, or a line in plan from [x, z] to [x, z] (optional look_towards [x, z], the side the section looks to); optional depth_m, how far past the cut it sees. kind "axonometric": preset se, sw, ne or nw (default se); optional cut-away: cut_level (a storey) with cut_height_m, nothing above that height is drawn, and/or box_min and box_max [x, y, z] (only what lies inside is drawn). name is optional (made unique). Returns the new view (id, name, kind) and how many views are unplaced. With dry_run true nothing is added: the view it would add is returned (its id is not kept).',
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      dry_run: DRY_RUN,
      kind: { type: 'string', enum: [...KINDS], description: 'The kind of view.' },
      name: { type: 'string', description: 'The view\'s name. Default: the storey, the facade, "Section A", "Axonometric".' },
      level: { type: 'string', description: 'plan: the storey name.' },
      cut_height_m: { type: 'number', description: 'plan, axonometric cut-away: the cut height in metres above the storey\'s floor.' },
      direction: { type: 'string', enum: [...DIRECTIONS], description: 'elevation: the facade it looks at.' },
      axis: { type: 'string', enum: ['front', 'side'], description: 'section: "front" cuts perpendicular to the Z axis, "side" perpendicular to X.' },
      offset_m: { type: 'number', description: 'section: the plane\'s coordinate on its axis, metres. Default: the middle of the building.' },
      flipped: { type: 'boolean', description: 'section: look the other way. Default false.' },
      from: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'section along a line: start [x, z], metres.' },
      to: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'section along a line: end [x, z], metres.' },
      look_towards: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'section along a line: a point [x, z] on the side the section looks to.' },
      depth_m: { type: 'number', description: 'section: how far beyond the cut the view sees, metres. Default: the whole building.' },
      preset: { type: 'string', enum: [...PRESETS], description: 'axonometric: the corner it is seen from. Default se.' },
      cut_level: { type: 'string', description: 'axonometric cut-away: the storey whose cut height removes everything above.' },
      box_min: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'axonometric cut-away: [x, y, z] corner of the box that is kept.' },
      box_max: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'axonometric cut-away: the opposite corner.' },
    },
    required: ['document_id', 'kind'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const session = getSheetSet(ctx, text(input, 'document_id'));
    const dry = optBoolean(input, 'dry_run') ?? false;
    const entry = workingEntry(session, dry);
    const view = newView(entry, input);
    replaceSheetDocument(entry, { ...entry.set.document, views: [...entry.set.document.views, view] });
    const unplaced = unplacedViews(entry.set.document).length;
    return okResult(
      dryPrefix(dry, `${dry ? 'Would add' : 'Added'} ${view.kind} view '${view.name}' (${view.id}); ${unplaced} view${unplaced === 1 ? '' : 's'} not on a sheet. Next: ifcsheet_place_view.`),
      { document_id: entry.id, dry_run: dry, view: { id: view.id, name: view.name, kind: view.kind }, unplaced_views: unplaced },
    );
  },
};
