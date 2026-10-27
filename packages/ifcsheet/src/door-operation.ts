/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A door's handedness as the model states it: `IfcDoor.OperationType`, else its
 * type's (`IfcDoorType.OperationType`, `IfcDoorStyle.OperationType` in IFC2X3). The one rule
 * the plan symbols, the schedule and the headless engine all use.
 *
 * Convention (IFC4.3 `IfcDoorTypeOperationEnum`, buildingSMART
 * https://standards.buildingsmart.org/IFC/DEV/IFC4_3/HTML/lexical/IfcDoorTypeOperationEnum.htm):
 * "SINGLE_SWING_LEFT: the hinges are on the left side as viewed in the direction of the positive
 * y-axis", RIGHT likewise on the right; "open to the outside is declared as open into the
 * direction of the positive y-axis", both of the door's ObjectPlacement. Bonsai
 * (IfcOpenShell `bonsai/bim/module/model/door.py`) agrees: a LEFT type puts the hinge at the
 * door's local x = 0 (its minimum X) and a RIGHT type at x = OverallWidth, the leaf opening to +Y.
 * Seen along +Y with Z up, +X is on the right, so LEFT = hinge on local -X, RIGHT = local +X, and
 * the leaf swings to local +Y. A mirrored placement (negative determinant of its axes) is handled
 * by mapping those local directions through the placement as it is, not by assuming it is right-handed.
 */

import type { IfcDataStore } from '@ifc-lite/parser';
import { getAttributeNamesForSchema } from '@ifc-lite/parser';
import { predefinedTypeText } from './schedule-filter.js';
import { attributes, type Live } from './joinery-schedule.js';

export interface DoorOperation {
  /** How the leaf moves: swings on hinges, slides along the wall, folds, or turns about a centre. */
  motion: 'swing' | 'sliding' | 'folding' | 'revolving';
  /** The hinged side seen along the opening direction (+Y) of a swinging door; null for a pair of leaves, which has none, and for the other motions. */
  hinge: 'left' | 'right' | null;
  /** The side a single sliding leaf slides to, or a single folding leaf stacks at, seen along +Y; null for a pair and for the other motions. */
  towards: 'left' | 'right' | null;
  /** One leaf or a pair. */
  leaves: 1 | 2;
  /** Swings both ways. */
  doubleActing: boolean;
}

/**
 * A door's operation from an `IfcDoorTypeOperationEnum` value (`.SINGLE_SWING_LEFT.` or bare); null for NOTDEFINED, USERDEFINED and the values
 * not drawn. IFC4.3 names what each value means, and the plan and elevation symbols draw exactly that:
 * - SINGLE_SWING_LEFT / RIGHT: one leaf hinged on that side, opening to +Y;
 * - DOUBLE_SWING_LEFT / RIGHT: one leaf hinged on that side that swings to both sides (double-acting);
 * - DOUBLE_DOOR_SINGLE_SWING / DOUBLE_DOOR_DOUBLE_SWING: a pair of leaves, one hinged on each jamb, swinging one way or both;
 * - SLIDING_TO_LEFT / RIGHT: one leaf sliding along the wall to that side;
 * - DOUBLE_DOOR_SLIDING: two leaves sliding apart, one to each side;
 * - FOLDING_TO_LEFT / RIGHT: one folding leaf stacking on that side;
 * - DOUBLE_DOOR_FOLDING: two folding leaves, one stacking on each jamb;
 * - REVOLVING: leaves turning about a vertical axis in the middle of the opening.
 * Left and right are read in the view the swing values name: along the placement's +Y. (The enum's own page could not be fetched
 * when the sliding and folding values were added, so that reading for them follows the swing values, not a quoted definition.)
 */
export function parseDoorOperation(value: unknown): DoorOperation | null {
  const v = predefinedTypeText(value);
  const swing = (hinge: 'left' | 'right' | null, leaves: 1 | 2, doubleActing: boolean): DoorOperation => ({ motion: 'swing', hinge, towards: null, leaves, doubleActing });
  const moving = (motion: 'sliding' | 'folding', towards: 'left' | 'right' | null): DoorOperation => ({ motion, hinge: null, towards, leaves: towards ? 1 : 2, doubleActing: false });
  switch (v) {
    case 'SINGLE_SWING_LEFT': return swing('left', 1, false);
    case 'SINGLE_SWING_RIGHT': return swing('right', 1, false);
    case 'DOUBLE_SWING_LEFT': return swing('left', 1, true);
    case 'DOUBLE_SWING_RIGHT': return swing('right', 1, true);
    case 'DOUBLE_DOOR_SINGLE_SWING': return swing(null, 2, false);
    case 'DOUBLE_DOOR_DOUBLE_SWING': return swing(null, 2, true);
    case 'SLIDING_TO_LEFT': return moving('sliding', 'left');
    case 'SLIDING_TO_RIGHT': return moving('sliding', 'right');
    case 'DOUBLE_DOOR_SLIDING': return moving('sliding', null);
    case 'FOLDING_TO_LEFT': return moving('folding', 'left');
    case 'FOLDING_TO_RIGHT': return moving('folding', 'right');
    case 'DOUBLE_DOOR_FOLDING': return moving('folding', null);
    case 'REVOLVING': return { motion: 'revolving', hinge: null, towards: null, leaves: 1, doubleActing: false };
    default: return null;
  }
}

function operationTextAt(dataStore: IfcDataStore, attrs: unknown[] | null, type: string | undefined): string | null {
  if (!attrs || !type) return null;
  const slot = getAttributeNamesForSchema(type, dataStore.schemaVersion).indexOf('OperationType');
  return slot < 0 ? null : predefinedTypeText(attrs[slot]);
}

/**
 * The operation of door `expressId`: its own OperationType, and only when that is NOTDEFINED or absent
 * (IFC2X3 has none on the door) its type's (`typeId`). A USERDEFINED door states no handedness and does not fall through.
 */
export function doorOperationOf(live: Live, expressId: number, typeId: number | null): DoorOperation | null {
  const { dataStore, view } = live;
  const typeName = (id: number) => String((view?.getNewEntity(id) ?? dataStore.getEntity(id))?.type ?? '');
  const own = operationTextAt(dataStore, attributes(live, expressId), typeName(expressId));
  if (own && own !== 'NOTDEFINED') return parseDoorOperation(own);
  if (typeId === null) return null;
  const inherited = operationTextAt(dataStore, attributes(live, typeId), typeName(typeId));
  return inherited ? parseDoorOperation(inherited) : null;
}

export interface Dir2 { x: number; y: number }

/**
 * The plan symbol flips (bit 1: hinge, or the side a sliding / folding leaf goes to, on the +u jamb, bit 2: leaf to the -n side) that put the hinge and the swing
 * where `op` says, given the placement's local X and Y axes and the opening's width axis `u` and normal `n`, all in the
 * drawing's frame. null when the placement's X does not run along the opening's width (the symbol is left as it was).
 * Because the axes are the placement's own, a mirrored one flips the result.
 */
export function doorSwingFlips(op: DoorOperation, localX: Dir2, localY: Dir2, u: Dir2, n: Dir2): number | null {
  const dot = (a: Dir2, b: Dir2) => a.x * b.x + a.y * b.y;
  const len = (a: Dir2) => Math.hypot(a.x, a.y);
  if (len(localX) < 1e-9 || len(localY) < 1e-9) return null;
  const along = dot(localX, u) / len(localX);
  const across = dot(localY, n) / len(localY);
  if (Math.abs(along) < 0.7 || Math.abs(across) < 0.7) return null;
  // LEFT: the hinge on local -X.
  const side = op.hinge ?? op.towards;
  const hingeOnU = side === null ? false : (side === 'left') === (along < 0);
  return (hingeOnU ? 1 : 0) | (across < 0 ? 2 : 0);
}
