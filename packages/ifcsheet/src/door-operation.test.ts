/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Door handedness (#486): IfcDoor.OperationType, else the type's (IfcDoorStyle in IFC2X3), and the flips that
 * draw it against the door's placement. Convention: IFC4.3 IfcDoorTypeOperationEnum, hinges "as viewed in the
 * direction of the positive y-axis"; the leaf opens to +Y.
 */

import { describe, expect, it } from 'vitest';
import { doorOperationOf, doorSwingFlips, parseDoorOperation } from './door-operation.js';
import { typeIndex, joineryScheduleData } from './joinery-schedule.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { openModel } from './headless.js';

const HEAD = (schema: string) => `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('doors'),'2;1');\nFILE_NAME('d.ifc','2026-10-27T00:00:00',(''),(''),'','','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n`;
const SPATIAL = `#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#3=IFCPROJECT('0000000000000000000001',$,'P',$,$,$,$,$,#2);
#6=IFCBUILDINGSTOREY('0000000000000000000004',$,'Ground',$,$,$,$,$,.ELEMENT.,0.);
`;
const ifc4 = HEAD('IFC4') + SPATIAL + `#20=IFCDOOR('00000000000000000000L0',$,'Left',$,$,$,$,'L',2.1,0.9,.DOOR.,.SINGLE_SWING_LEFT.,$);
#21=IFCDOOR('00000000000000000000R0',$,'Right',$,$,$,$,'R',2.1,0.9,.DOOR.,.SINGLE_SWING_RIGHT.,$);
#22=IFCDOOR('00000000000000000000T0',$,'Typed',$,$,$,$,'T',2.1,0.9,.DOOR.,.NOTDEFINED.,$);
#23=IFCDOOR('00000000000000000000O0',$,'Own wins',$,$,$,$,'O',2.1,0.9,.DOOR.,.SINGLE_SWING_LEFT.,$);
#24=IFCDOOR('00000000000000000000S0',$,'Sliding',$,$,$,$,'S',2.1,0.9,.DOOR.,.SLIDING_TO_LEFT.,$);
#30=IFCDOORTYPE('00000000000000000000Y0',$,'T type',$,$,$,$,$,$,.DOOR.,.SINGLE_SWING_RIGHT.,.F.,$);
#31=IFCRELDEFINESBYTYPE('0000000000000000000011',$,$,$,(#22,#23),#30);
#32=IFCRELCONTAINEDINSPATIALSTRUCTURE('0000000000000000000010',$,$,$,(#20,#21,#22,#23,#24),#6);
ENDSEC;\nEND-ISO-10303-21;\n`;
const ifc2x3 = HEAD('IFC2X3') + SPATIAL + `#22=IFCDOOR('00000000000000000000T0',$,'Typed',$,$,$,$,'T',2.1,0.9);
#30=IFCDOORSTYLE('00000000000000000000Y0',$,'T style',$,$,$,$,$,.SINGLE_SWING_RIGHT.,.NOTDEFINED.,.F.,.F.);
#31=IFCRELDEFINESBYTYPE('0000000000000000000011',$,$,$,(#22),#30);
#32=IFCRELCONTAINEDINSPATIALSTRUCTURE('0000000000000000000010',$,$,$,(#22),#6);
ENDSEC;\nEND-ISO-10303-21;\n`;

/** One door per value of the operations drawn besides the single swing, then a door typed by a sliding type (IFC4.3 IfcDoorTypeOperationEnum). */
const MOVING = ['DOUBLE_SWING_RIGHT', 'DOUBLE_DOOR_DOUBLE_SWING', 'SLIDING_TO_LEFT', 'SLIDING_TO_RIGHT', 'DOUBLE_DOOR_SLIDING', 'FOLDING_TO_LEFT', 'FOLDING_TO_RIGHT', 'DOUBLE_DOOR_FOLDING', 'REVOLVING'];
const ifc4Moving = HEAD('IFC4') + SPATIAL + MOVING.map((v, i) => `#${40 + i}=IFCDOOR('0000000000000000000${String(i).padStart(3, '0')}',$,'${v}',$,$,$,$,'M',2.1,0.9,.DOOR.,.${v}.,$);`).join('\n') + `
#60=IFCDOOR('00000000000000000000N0',$,'Typed',$,$,$,$,'N',2.1,0.9,.DOOR.,.NOTDEFINED.,$);
#61=IFCDOORTYPE('00000000000000000000Y1',$,'Sliding type',$,$,$,$,$,$,.DOOR.,.SLIDING_TO_RIGHT.,.F.,$);
#62=IFCRELDEFINESBYTYPE('0000000000000000000012',$,$,$,(#60),#61);
ENDSEC;\nEND-ISO-10303-21;\n`;

const open = (text: string) => openModel(new TextEncoder().encode(text), { geometry: false });

describe('parseDoorOperation', () => {
  const swing = (hinge: 'left' | 'right' | null, leaves: 1 | 2, doubleActing: boolean) => ({ motion: 'swing', hinge, towards: null, leaves, doubleActing });
  it('reads the swing values', () => {
    expect(parseDoorOperation('.SINGLE_SWING_LEFT.')).toEqual(swing('left', 1, false));
    expect(parseDoorOperation('SINGLE_SWING_RIGHT')).toEqual(swing('right', 1, false));
    expect(parseDoorOperation('DOUBLE_SWING_LEFT')).toEqual(swing('left', 1, true));
    expect(parseDoorOperation('DOUBLE_DOOR_SINGLE_SWING')).toEqual(swing(null, 2, false));
    expect(parseDoorOperation('DOUBLE_DOOR_DOUBLE_SWING')).toEqual(swing(null, 2, true));
    expect(parseDoorOperation('SWING_FIXED_LEFT')).toEqual(swing('left', 1, false));
    expect(parseDoorOperation('.SWING_FIXED_RIGHT.')).toEqual(swing('right', 1, false));
    expect(parseDoorOperation('DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_LEFT')).toEqual(swing(null, 2, false));
    expect(parseDoorOperation('DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_RIGHT')).toEqual(swing(null, 2, false));
  });

  it('reads the sliding, folding and revolving values (#486)', () => {
    const moving = (motion: 'sliding' | 'folding', towards: 'left' | 'right' | null) => ({ motion, hinge: null, towards, leaves: towards ? 1 : 2, doubleActing: false });
    expect(parseDoorOperation('.SLIDING_TO_LEFT.')).toEqual(moving('sliding', 'left'));
    expect(parseDoorOperation('SLIDING_TO_RIGHT')).toEqual(moving('sliding', 'right'));
    expect(parseDoorOperation('DOUBLE_DOOR_SLIDING')).toEqual(moving('sliding', null));
    expect(parseDoorOperation('FOLDING_TO_LEFT')).toEqual(moving('folding', 'left'));
    expect(parseDoorOperation('FOLDING_TO_RIGHT')).toEqual(moving('folding', 'right'));
    expect(parseDoorOperation('DOUBLE_DOOR_FOLDING')).toEqual(moving('folding', null));
    expect(parseDoorOperation('REVOLVING')).toEqual({ motion: 'revolving', hinge: null, towards: null, leaves: 1, doubleActing: false });
    expect(parseDoorOperation('REVOLVING_VERTICAL')).toEqual({ motion: 'revolving', hinge: null, towards: null, leaves: 1, doubleActing: false });
  });

  it('reads the lifting and rolling-up values as an overhead door, which swings nowhere (#486)', () => {
    const overhead = (leaves: 1 | 2) => ({ motion: 'overhead', hinge: null, towards: null, leaves, doubleActing: false });
    for (const v of ['LIFTING_HORIZONTAL', 'LIFTING_VERTICAL_LEFT', 'LIFTING_VERTICAL_RIGHT', 'ROLLINGUP']) expect(parseDoorOperation(v)).toEqual(overhead(1));
    expect(parseDoorOperation('DOUBLE_DOOR_LIFTING_VERTICAL')).toEqual(overhead(2));
  });

  it('draws nothing for the values that state no operation', () => {
    for (const v of ['NOTDEFINED', 'USERDEFINED', null, undefined]) expect(parseDoorOperation(v)).toBeNull();
  });
});

describe('doorOperationOf on a model', () => {
  it('takes the door\'s own value, else its type\'s (IFC4)', async () => {
    const { dataStore } = await open(ifc4);
    const live = { dataStore, view: null };
    const types = typeIndex(live);
    const op = (id: number) => doorOperationOf(live, id, types.get(id) ?? null)?.hinge ?? null;
    expect([op(20), op(21), op(22), op(23), op(24)]).toEqual(['left', 'right', 'right', 'left', null]);
  });

  it('reads every operation the symbols draw from the file, and a sliding door type\'s value for a door that states none (#486)', async () => {
    const { dataStore } = await open(ifc4Moving);
    const live = { dataStore, view: null };
    const types = typeIndex(live);
    const at = (id: number) => doorOperationOf(live, id, types.get(id) ?? null);
    expect(MOVING.map((_, i) => at(40 + i)?.motion)).toEqual(['swing', 'swing', 'sliding', 'sliding', 'sliding', 'folding', 'folding', 'folding', 'revolving']);
    expect(MOVING.map((_, i) => at(40 + i)?.hinge ?? at(40 + i)?.towards ?? null)).toEqual(['right', null, 'left', 'right', null, 'left', 'right', null, null]);
    expect(at(40)?.doubleActing).toBe(true);
    expect(at(41)).toMatchObject({ leaves: 2, doubleActing: true });
    expect(at(60)).toMatchObject({ motion: 'sliding', towards: 'right' });
  });

  it('takes IfcDoorStyle.OperationType in IFC2X3, where the door has none', async () => {
    const { dataStore } = await open(ifc2x3);
    const live = { dataStore, view: null };
    expect(doorOperationOf(live, 22, typeIndex(live).get(22) ?? null)?.hinge).toBe('right');
  });

  it('names the hands a group of one size states, under the key saved filters use', async () => {
    const { dataStore } = await open(ifc4);
    const data = joineryScheduleData([{ modelId: 'm', dataStore, view: null }], { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING });
    expect(data.entries.map((e) => [e.key, e.operations])).toEqual([['untyped:door:900×2100', ['swing-left', 'swing-right']]]);
  });
});

describe('doorSwingFlips', () => {
  const X = { x: 1, y: 0 }, Y = { x: 0, y: 1 };
  const left = { motion: 'swing' as const, hinge: 'left' as const, towards: null, leaves: 1 as const, doubleActing: false };
  const right = { ...left, hinge: 'right' as const };
  const neg = (d: { x: number; y: number }) => ({ x: -d.x, y: -d.y });

  it('hinges LEFT on the placement\'s -X and swings to its +Y', () => {
    // The opening's u = +x, n = +y: hinge on -u is the default (bit 1 clear), swing to +n (bit 2 clear).
    expect(doorSwingFlips(left, X, Y, X, Y)).toBe(0);
    expect(doorSwingFlips(right, X, Y, X, Y)).toBe(1);
  });

  it('follows a placement turned half a turn', () => {
    expect(doorSwingFlips(left, neg(X), neg(Y), X, Y)).toBe(1 | 2);
    expect(doorSwingFlips(right, neg(X), neg(Y), X, Y)).toBe(2);
  });

  it('flips with a mirrored placement (negative determinant)', () => {
    // X reversed, Y kept: det -1. The hinge of a LEFT door lands on the other jamb than for the right-handed placement.
    expect(doorSwingFlips(left, neg(X), Y, X, Y)).toBe(1);
    expect(doorSwingFlips(left, X, neg(Y), X, Y)).toBe(2);
  });

  it('reads the side a sliding or folding leaf goes to as it reads a hinge (#486)', () => {
    const slideLeft = { ...left, motion: 'sliding' as const, hinge: null, towards: 'left' as const };
    expect(doorSwingFlips(slideLeft, X, Y, X, Y)).toBe(0);
    expect(doorSwingFlips({ ...slideLeft, towards: 'right' }, X, Y, X, Y)).toBe(1);
    expect(doorSwingFlips(slideLeft, neg(X), Y, X, Y), 'a mirrored placement flips the side').toBe(1);
  });

  it('leaves a placement not running along the opening alone', () => {
    expect(doorSwingFlips(left, Y, X, X, Y)).toBeNull();
  });
});
