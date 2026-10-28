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
  /** The hinged side seen along the opening direction (+Y); null for a pair of leaves, which has none. */
  hinge: 'left' | 'right' | null;
  /** One leaf or a pair. */
  leaves: 1 | 2;
  /** Swings both ways. */
  doubleActing: boolean;
}

/** A swinging door's operation from an `IfcDoorTypeOperationEnum` value (`.SINGLE_SWING_LEFT.` or bare); null for sliding, folding, revolving, NOTDEFINED and the rest, which this does not draw as a swing. */
export function parseDoorOperation(value: unknown): DoorOperation | null {
  const v = predefinedTypeText(value);
  switch (v) {
    case 'SINGLE_SWING_LEFT': return { hinge: 'left', leaves: 1, doubleActing: false };
    case 'SINGLE_SWING_RIGHT': return { hinge: 'right', leaves: 1, doubleActing: false };
    case 'DOUBLE_SWING_LEFT': return { hinge: 'left', leaves: 1, doubleActing: true };
    case 'DOUBLE_SWING_RIGHT': return { hinge: 'right', leaves: 1, doubleActing: true };
    // IFC4 / IFC4X3 swing leaf beside a fixed panel: the hand names the leaf's hinge, as SINGLE_SWING_* does and as
    // this repo's own writer emits it (joinery-ifc.ts `doorOperation`: a swing-left leaf with fixed glazing beside it).
    case 'SWING_FIXED_LEFT': return { hinge: 'left', leaves: 1, doubleActing: false };
    case 'SWING_FIXED_RIGHT': return { hinge: 'right', leaves: 1, doubleActing: false };
    // Two leaves, each swinging one way (the pair is drawn as two leaves, like DOUBLE_DOOR_SINGLE_SWING).
    case 'DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_LEFT':
    case 'DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_RIGHT':
    case 'DOUBLE_DOOR_SINGLE_SWING': return { hinge: null, leaves: 2, doubleActing: false };
    case 'DOUBLE_DOOR_DOUBLE_SWING': return { hinge: null, leaves: 2, doubleActing: true };
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
 * The plan symbol flips (bit 1: hinge on the +u jamb, bit 2: leaf to the -n side) that put the hinge and the swing
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
  const hingeOnU = op.hinge === null ? false : (op.hinge === 'left') === (along < 0);
  return (hingeOnU ? 1 : 0) | (across < 0 ? 2 : 0);
}
