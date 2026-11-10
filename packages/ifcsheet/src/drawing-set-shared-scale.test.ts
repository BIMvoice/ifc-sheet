/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #634: the views of one kind in a starter set share one scale, the largest that fits every one of them. */

import { describe, expect, it } from 'vitest';
import { sheetScaleReason } from './scale-reason.js';
import { buildDrawingSet, drawingArea, fitsScale, sheetGroup, viewExtent, type ModelExtent } from './drawing-set.js';
import type { ElevationDirection, ProjectView } from './document.js';

/** 10 m along X, 7 m along Z, 6 m tall: north and south are wide, east and west are narrower. */
const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const elevation = (direction: ElevationDirection): ProjectView => ({ id: direction, name: direction, createdAt: 0, kind: 'elevation', direction, planeOffset: 0 } as ProjectView);
const plan = (id: string, elevationM: number): ProjectView => ({ id, name: id, createdAt: 0, kind: 'plan', level: { name: id, elevation: elevationM, storeyGlobalIds: [] }, cutHeight: 1.2 } as ProjectView);
const scalesOf = (sheets: ReturnType<typeof buildDrawingSet>) => sheets.map((s) => [s.number, s.paper, (s.viewports ?? []).map((v) => v.scale)]);

describe('one scale per kind of view in a starter set (#634)', () => {
  const views = [plan('p0', 0), plan('p1', 3), plan('p2', 6), elevation('south'), elevation('north'), elevation('east'), elevation('west')];
  const sheets = buildDrawingSet({ views, extent: HOUSE });

  it('prints all four elevations at the one scale the widest pair fits (A-201 and A-202 alike)', () => {
    // Before: A-201 at 1:100 and A-202 at 1:50 on the same paper.
    expect(scalesOf(sheets).filter(([n]) => String(n).startsWith('A-2'))).toEqual([['A-201', 'A3', [100, 100]], ['A-202', 'A3', [100, 100]]]);
  });

  it('gives every sheet of a kind one scale, and every viewport of the sheet', () => {
    const byKind = new Map<string, Set<number>>();
    for (const s of sheets) for (const v of s.viewports ?? []) byKind.set(sheetGroup(s) ?? '?', (byKind.get(sheetGroup(s) ?? '?') ?? new Set()).add(v.scale));
    expect([...byKind.keys()].sort()).toEqual(['elevations', 'plans']);
    for (const scales of byKind.values()) expect(scales.size).toBe(1);
  });

  it('keeps every sheet inside its drawing area at the shared scale', () => {
    for (const s of sheets) {
      const members = (s.viewports ?? []).map((vp) => viewExtent(views.find((v) => v.id === vp.viewId) as ProjectView, HOUSE));
      expect(fitsScale(members, drawingArea(s), s.viewports?.[0].scale ?? 0), s.number).toBe(true);
    }
  });

  it('says a sheet at its group\'s shared scale is that, not "chosen"', () => {
    const eastWest = sheets.find((s) => s.name.includes('east')) as (typeof sheets)[number];
    const southNorth = sheets.find((s) => s.name.includes('south')) as (typeof sheets)[number];
    expect(sheetScaleReason(eastWest, views, HOUSE, sheets)?.reason.key).toBe('wall.reason.shared');
    expect(sheetScaleReason(eastWest, views, HOUSE)?.reason.key).toBe('wall.reason.chosen');
    expect(sheetScaleReason(southNorth, views, HOUSE, sheets)?.reason.key).toBe('wall.reason.fits');
  });

  it('lets different kinds differ: the plans of a deep building need 1:100 where its facades keep 1:50', () => {
    const long: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 6, y: 2, z: 11 } };
    const mixed = buildDrawingSet({ views: [plan('p0', 0), plan('p1', 3), elevation('south'), elevation('north')], extent: long });
    const kinds = new Map(mixed.map((s) => [sheetGroup(s), new Set((s.viewports ?? []).map((v) => v.scale))]));
    expect([...(kinds.get('plans') ?? [])]).toEqual([100]);
    expect([...(kinds.get('elevations') ?? [])]).toEqual([50]);
  });
});
