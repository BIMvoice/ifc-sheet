/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The readings of a plan's parts that every DIMALL figure shares, outer chain or room: the plan's frame (the walls'
 * main direction), each wall as one box of its whole thickness, the walls at an angle to that frame, and the openings
 * as the gaps they fill. One function, so a figure inside a room and one outside it are read the same way.
 */

import type { Pt } from '@/drafting/types';
import { bridgedOpenings, type Opening } from './facades';
import { joinLayers } from './layers';
import { boxOf, mainDirection, ringOnAxes, rotate, unionBox, type Box } from './outline';
import type { PlanPart } from './types';

/** A wall further than this off the plan's axes (degrees) is at an angle: a box in the plan's frame would no longer measure it to the millimetre. */
export const ON_AXES_DEG = 0.1;

export interface PlanReading {
  /** How far the walls' main direction is turned from the drawing's x axis, radians. */
  angle: number;
  /** Every wall outline, in the walls' frame. */
  walls: Pt[][];
  /** One box per wall piece with its material layers joined, per wall element. */
  wholeWalls: Box[][];
  wallBoxes: Box[];
  /** The outlines of walls at an angle to the frame: they shape the outline and give no figure. */
  offAxis: Pt[][];
  openings: Opening[];
  bridged: Opening[];
}

export function readPlan(parts: readonly PlanPart[]): PlanReading {
  const wallParts = parts.filter((p) => p.kind === 'wall');
  const angle = mainDirection(wallParts.flatMap((p) => p.rings));
  const turn = (ring: readonly Pt[]) => ring.map((p) => rotate(p, -angle));
  const walls = wallParts.flatMap((p) => p.rings.map(turn));
  // A wall's material layers are one wall to a plan: the boxes the facades and openings read are whole walls. A wall at an angle to the plan's axes has no such box (its box measures nothing along the wall): it still shapes the outline, and gives no figure.
  const wholeWalls = wallParts.map((p) => joinLayers(p.rings.map(turn).filter((r) => ringOnAxes(r, ON_AXES_DEG)).map(boxOf)));
  const wallBoxes = wholeWalls.flat();
  const offAxis = walls.filter((r) => !ringOnAxes(r, ON_AXES_DEG));
  const openings: Opening[] = parts.filter((p) => p.kind !== 'wall' && p.rings.length > 0).map((part) => ({ part, box: part.rings.map(turn).map(boxOf).reduce(unionBox), onAxes: part.rings.map(turn).every((r) => ringOnAxes(r, ON_AXES_DEG)), ...(part.body?.length ? { body: boxOf(turn(part.body)) } : {}) }));
  return { angle, walls, wholeWalls, wallBoxes, offAxis, openings, bridged: bridgedOpenings(openings, wallBoxes) };
}
