/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Two review points on phases (#117), on a small model parsed into the viewer store:
 * - a multi-skin wall exported as IfcBuildingElementParts carries its Status on the wall, and the
 *   renderer draws the parts, so a part with no Status of its own takes its host wall's phase;
 * - a survey records the building as it stands: what is to be demolished draws as plain existing,
 *   while the demolition plan marks it.
 */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import { EMPTY_PROJECT } from './project-store.js';
import { phaseHiddenIds, phaseOfRenderId, phaseViewOf } from './phase-view.js';
import { PHASE_VIEW_PRESETS, phasesFromPreset } from './phases.js';
import { styledDrawing } from './view-graphics.js';
import type { PlanProjectView, ViewGraphics } from './types.js';

const status = (n: number, value: string, of: number) => [
  `#${n}=IFCPROPERTYENUMERATEDVALUE('Status',$,(IFCLABEL('${value}')),$);`,
  `#${n + 1}=IFCPROPERTYSET('0PhPset${String(n).padStart(15, '0')}',$,'Pset_${of === 13 ? 'BuildingElementPart' : 'Wall'}Common',$,(#${n}));`,
  `#${n + 2}=IFCRELDEFINESBYPROPERTIES('0PhRel0${String(n).padStart(15, '0')}',$,$,$,(#${of}),#${n + 1});`,
].join('\n');

/** #10 a wall to demolish with parts #12 and #13 (#13 says NEW itself); #11 a wall with no Status and part #14; #15 a part of no wall. */
const STEP = `ISO-10303-21;
HEADER;FILE_DESCRIPTION((''),'2;1');FILE_NAME('','',(''),(''),'','','');FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCPROJECT('0PhaseProject0000000001',$,'P',$,$,$,$,$,$);
#10=IFCWALL('0PhaseWallDemolish00001',$,'Demolish',$,$,$,$,$,$);
#11=IFCWALL('0PhaseWallNoStatus00001',$,'No status',$,$,$,$,$,$);
#12=IFCBUILDINGELEMENTPART('0PhasePartOuter00000001',$,'Outer skin',$,$,$,$,$,$);
#13=IFCBUILDINGELEMENTPART('0PhasePartInner00000001',$,'Inner skin',$,$,$,$,$,$);
#14=IFCBUILDINGELEMENTPART('0PhasePartOther00000001',$,'Skin',$,$,$,$,$,$);
#15=IFCBUILDINGELEMENTPART('0PhasePartLoose00000001',$,'Loose',$,$,$,$,$,$);
#16=IFCRELAGGREGATES('0PhaseAggregates000001',$,$,$,#10,(#12,#13));
#17=IFCRELAGGREGATES('0PhaseAggregates000002',$,$,$,#11,(#14));
${status(20, 'DEMOLISH', 10)}
${status(30, 'NEW', 13)}
ENDSEC;
END-ISO-10303-21;
`;

const PROPOSED: ViewGraphics = { phases: { show: [...PHASE_VIEW_PRESETS.proposed] } };
const DEMOLITION: ViewGraphics = { phases: phasesFromPreset('demolition') };
const SURVEY: ViewGraphics = { phases: phasesFromPreset('survey') };

beforeEach(async () => {
  seedModel('m', 0, await parseStep(STEP), 10);
});

describe('the phase of a wall part', () => {
  it('is its host wall\'s when it says none, its own when it does', () => {
    assert.equal(phaseOfRenderId(10, undefined), 'demolish', 'the wall');
    assert.equal(phaseOfRenderId(12, undefined), 'demolish', 'a part of the wall to demolish');
    assert.equal(phaseOfRenderId(13, undefined), 'new', 'a part with a Status of its own keeps it');
    assert.equal(phaseOfRenderId(14, undefined), 'existing', 'a part of a wall with no Status: the default');
    assert.equal(phaseOfRenderId(14, { unmarked: 'new' }), 'new', '...or the project\'s default');
    assert.equal(phaseOfRenderId(15, undefined), 'existing', 'a part of no wall');
  });

  it('is hidden in the proposed plan with its wall to demolish', () => {
    const meshes = [12, 13, 14, 15].map((expressId) => ({ expressId }));
    assert.deepEqual([...(phaseHiddenIds(meshes, phaseViewOf(PROPOSED, undefined)) ?? [])], [12]);
  });
});

describe('a survey against a demolition plan', () => {
  const drawing = {
    lines: [10, 11].map((entityId) => ({ entityId, ifcType: 'IfcWall', line: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, category: 'cut', visibility: 'visible' })),
    cutPolygons: [],
  } as unknown as Drawing2D;
  const phasesDrawn = (graphics: ViewGraphics) => styledDrawing(drawing, graphics, undefined, undefined, undefined, phaseViewOf(graphics, undefined)).lines.map((l) => l.phase);

  it('draws what is to be demolished as plain existing; the demolition plan marks it', () => {
    assert.deepEqual(phasesDrawn(SURVEY), ['existing', 'existing']);
    assert.deepEqual(phasesDrawn(DEMOLITION), ['demolish', 'existing']);
  });

  it('shows the same elements as the demolition plan', () => {
    const meshes = [10, 11].map((expressId) => ({ expressId }));
    assert.equal(phaseHiddenIds(meshes, phaseViewOf(SURVEY, undefined)), null);
    assert.equal(phaseHiddenIds(meshes, phaseViewOf(DEMOLITION, undefined)), null);
  });

  it('starts from the survey preset, and another preset drops it; the project file keeps it', () => {
    assert.deepEqual(SURVEY.phases, { show: ['existing', 'demolish'], demolishAsExisting: true });
    assert.deepEqual(phasesFromPreset('demolition', { ...SURVEY.phases!, styles: { new: { dashed: true } } }), { show: ['existing', 'demolish'], styles: { new: { dashed: true } } });
    const view: PlanProjectView = { id: 'v', name: 'Survey', createdAt: 0, scale: 100, kind: 'plan', level: { name: 'EG', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, graphics: SURVEY };
    const back = parseProjectFile(serializeProject({ ...EMPTY_PROJECT, views: [view] })).views[0];
    assert.deepEqual(back.graphics?.phases, SURVEY.phases);
  });
});
