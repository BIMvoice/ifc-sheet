/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan is framed on the building, not on an element the framing left out of the extent. skolebygg (ISSUE_068)
 * carries a survey marker, `NUS - 0,0 - Kake`, 161 m from the building: its plans' drawings reach out to it, and a
 * frame fitted to the whole drawing grew about 315 mm on the paper to hold it. The engine's sheet clips a plan to the
 * room the layout made for it (`viewExtent` about the viewport's centre); `boundsInRoom` is that rule for a frame
 * fitted to the drawing.
 */

import { describe, expect, it } from 'vitest';
import type { ProjectView } from './document.js';
import { boundsInRoom } from './bounds-in-room.js';
import { viewCentre, viewExtent, type ModelExtent } from './drawing-set.js';
import { placer } from './sheet-graphic.js';
import { boundsAbout, fitViewportBox } from './viewport-fit.js';

// A building 90 x 84 m, a storey 70 x 69 m to one side of it, and a marker 161 m south-west.
const extent: ModelExtent = { min: { x: -45, y: 0, z: -42 }, max: { x: 45, y: 30, z: 42 } };
const plan = { id: 'p', kind: 'plan', name: 'Plan 01', createdAt: 0, level: { name: 'Plan 01', elevation: 3, storeyGlobalIds: [] }, cutHeight: 1.2 } as ProjectView;
const storey = { min: { x: -26, y: -40.5 }, max: { x: 44, y: 28.5 } };
const withMarker = { min: { x: -140, y: -40.5 }, max: { x: 44, y: 120 } };
const scale = 200;
const k = 1000 / scale;
const centre = viewCentre(plan, extent);
const room = viewExtent(plan, extent);

describe('a plan framed on the building, not on a far element (skolebygg survey marker)', () => {
  it('keeps the drawing inside the room and leaves the marker out', () => {
    expect(centre).not.toBeNull();
    if (!centre) return;
    const inRoom = boundsInRoom(plan, centre, withMarker, extent);
    expect(inRoom.min.x).toBeGreaterThanOrEqual(centre.x - room.w / 2);
    expect(inRoom.max.y).toBeLessThanOrEqual(centre.y + room.h / 2);
    // The building's own geometry is all still there.
    expect(inRoom.min.x).toBeLessThanOrEqual(storey.min.x);
    expect(inRoom.max.x).toBeGreaterThanOrEqual(storey.max.x);
  });

  it('gives a frame no larger than the room and its margin, which still holds the building where it lands', () => {
    if (!centre) throw new Error('no centre');
    const vp = { id: 'vp', viewId: 'p', x: 400, y: 300, scale, width: 0, height: 0, center: centre };
    const box = fitViewportBox(boundsAbout(boundsInRoom(plan, centre, withMarker, extent), centre, scale), scale);
    expect(box.width).toBeLessThanOrEqual(room.w * k + 20 + 1e-9);
    expect(box.height).toBeLessThanOrEqual(room.h * k + 20 + 1e-9);
    const at = placer({ bounds: storey, config: { plane: { axis: 'y', position: 1.2, flipped: false } } }, vp);
    for (const p of [storey.min, storey.max].map(at)) {
      expect(Math.abs(p.x - vp.x)).toBeLessThanOrEqual(box.width / 2);
      expect(Math.abs(p.y - vp.y)).toBeLessThanOrEqual(box.height / 2);
    }
  });

  it('leaves a drawing inside its room, an elevation and a site plan as they are', () => {
    if (!centre) throw new Error('no centre');
    expect(boundsInRoom(plan, centre, storey, extent)).toBe(storey);
    const elevation = { id: 'e', kind: 'elevation', name: 'South', createdAt: 0, direction: 'south' } as ProjectView;
    expect(boundsInRoom(elevation, centre, withMarker, extent)).toBe(withMarker);
    const site = { ...plan, site: true } as ProjectView;
    expect(boundsInRoom(site, centre, withMarker, extent)).toBe(withMarker);
  });
});
