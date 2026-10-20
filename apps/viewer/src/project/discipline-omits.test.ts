/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a discipline plan leaves out (`viewOmits`), read off a parsed model with no geometry: a wall exported
 * as parts is drawn by a structural plan through its host's facts, and a roof plan keeps a skylight although
 * a plain plan draws windows from their symbols.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IfcParser } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from './project-store';
import { viewOmits } from './discipline-facts';
import type { ProjectView } from './types';

const IFC = `ISO-10303-21;
HEADER;FILE_DESCRIPTION((''),'2;1');FILE_NAME('omits.ifc','',(''),(''),'','','');FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCPROJECT('0Proj00000000000000001',$,'P',$,$,$,$,$,$);
#2=IFCSITE('0Site00000000000000001',$,'S',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);
#3=IFCBUILDING('0Bldg00000000000000001',$,'B',$,$,$,$,$,.ELEMENT.,$,$,$);
#10=IFCBUILDINGSTOREY('0Stor00000000000000001',$,'Level 1',$,$,$,$,$,.ELEMENT.,0.);
#4=IFCRELAGGREGATES('0Agg000000000000000001',$,$,$,#1,(#2));
#5=IFCRELAGGREGATES('0Agg000000000000000002',$,$,$,#2,(#3));
#6=IFCRELAGGREGATES('0Agg000000000000000003',$,$,$,#3,(#10));
#20=IFCWALL('0Wall00000000000000001',$,'Bearing wall',$,$,$,$,$,.STANDARD.);
#21=IFCBUILDINGELEMENTPART('0Part00000000000000001',$,'Bearing skin',$,$,$,$,$,.NOTDEFINED.);
#22=IFCRELAGGREGATES('0Agg000000000000000004',$,$,$,#20,(#21));
#23=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$);
#24=IFCPROPERTYSET('0Pset00000000000000001',$,'Pset_WallCommon',$,(#23));
#25=IFCRELDEFINESBYPROPERTIES('0Rdp000000000000000001',$,$,$,(#20),#24);
#30=IFCWALL('0Wall00000000000000002',$,'Partition',$,$,$,$,$,.STANDARD.);
#31=IFCBUILDINGELEMENTPART('0Part00000000000000002',$,'Partition skin',$,$,$,$,$,.NOTDEFINED.);
#32=IFCRELAGGREGATES('0Agg000000000000000005',$,$,$,#30,(#31));
#33=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.F.),$);
#34=IFCPROPERTYSET('0Pset00000000000000002',$,'Pset_WallCommon',$,(#33));
#35=IFCRELDEFINESBYPROPERTIES('0Rdp000000000000000002',$,$,$,(#30),#34);
#50=IFCSLAB('0Slab00000000000000001',$,'Roof slab',$,$,$,$,$,.ROOF.);
#51=IFCOPENINGELEMENT('0Open00000000000000001',$,'Opening',$,$,$,$,$,.OPENING.);
#52=IFCRELVOIDSELEMENT('0Void00000000000000001',$,$,$,#50,#51);
#60=IFCWINDOW('0Wind00000000000000001',$,'Skylight',$,$,$,$,$,$,$,.NOTDEFINED.,.NOTDEFINED.,$);
#61=IFCRELFILLSELEMENT('0Fill00000000000000001',$,$,$,#51,#60);
#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('0Cont00000000000000001',$,$,$,(#20,#30,#50,#60),#10);
ENDSEC;
END-ISO-10303-21;
`;

const LEVEL = { name: 'Level 1', elevation: 0, storeyGlobalIds: ['0Stor00000000000000001'] };
const planOf = (discipline?: 'structural' | 'roof') =>
  ({ id: 'v', kind: 'plan', name: 'p', scale: 100, level: LEVEL, cutHeight: 1.2, ...(discipline ? { discipline } : {}) }) as unknown as ProjectView;

before(async () => {
  const bytes = new TextEncoder().encode(IFC);
  const ds = await new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true });
  useViewerStore.setState({ models: new Map([['m', { id: 'm', name: 'm', ifcDataStore: ds, visible: true, idOffset: 0, maxExpressId: 100 }]]) } as never);
  resetProject();
  useProjectStore.setState({ levels: [LEVEL] });
});

describe('a structural plan of a wall exported as parts', () => {
  it('draws the parts of a load-bearing wall', () => {
    const omits = viewOmits(planOf('structural'));
    assert.ok(omits);
    assert.equal(omits(21, 'IfcBuildingElementPart'), false);
  });

  it('leaves out the parts of a partition', () => {
    assert.equal(viewOmits(planOf('structural'))?.(31, 'IfcBuildingElementPart'), true);
  });
});

describe('a roof plan', () => {
  it('draws a window in a roof slab from its cut, not leaving it to a symbol', () => {
    assert.equal(viewOmits(planOf('roof'))?.(60, 'IfcWindow'), false);
  });

  it('while a plain plan leaves the window to its symbol', () => {
    assert.equal(viewOmits(planOf())?.(60, 'IfcWindow'), true);
  });
});
