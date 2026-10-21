/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Opening a level in the navigator opens that level's own plan, never a discipline plan of the same level. */

import '@/test/setup-dom.js';
import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { IfcParser } from '@ifc-lite/parser';
import { cleanup, render } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useDocumentTabs } from '@/project/document-tabs';
import { disciplineViewFor } from '@/project/discipline-views';
import { planViewFor } from '@/project/view-defaults';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { LevelsFolder } from './LevelsFolder.js';

const IFC = `ISO-10303-21;
HEADER;FILE_DESCRIPTION((''),'2;1');FILE_NAME('levels.ifc','',(''),(''),'','','');FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCPROJECT('0Proj00000000000000001',$,'P',$,$,$,$,$,$);
#2=IFCSITE('0Site00000000000000001',$,'S',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);
#3=IFCBUILDING('0Bldg00000000000000001',$,'B',$,$,$,$,$,.ELEMENT.,$,$,$);
#10=IFCBUILDINGSTOREY('0Stor00000000000000001',$,'Ground Floor',$,$,$,$,$,.ELEMENT.,0.);
#4=IFCRELAGGREGATES('0Agg000000000000000001',$,$,$,#1,(#2));
#5=IFCRELAGGREGATES('0Agg000000000000000002',$,$,$,#2,(#3));
#6=IFCRELAGGREGATES('0Agg000000000000000003',$,$,$,#3,(#10));
ENDSEC;
END-ISO-10303-21;
`;

const LEVEL: ProjectLevel = { name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['0Stor00000000000000001'] };

before(async () => {
  const bytes = new TextEncoder().encode(IFC);
  const ds = await new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true });
  useViewerStore.setState({ models: new Map([['m', { id: 'm', name: 'm', ifcDataStore: ds, visible: true, idOffset: 0, maxExpressId: 20 }]]) } as never);
});
afterEach(() => cleanup());

describe('LevelsFolder', () => {
  it('opens the level\'s own plan when a structural plan of the level comes first', () => {
    resetProject();
    const plain = { ...planViewFor(LEVEL, []), id: 'plain-ground' } as ProjectView;
    const structural = { ...disciplineViewFor('structural', LEVEL, [plain]), id: 'structural-ground' } as ProjectView;
    useProjectStore.setState({ levels: [LEVEL], views: [structural, plain] });
    const ui = render(<LevelsFolder query="" onNewLevel={() => {}} />);
    const row = [...ui.querySelectorAll('button')].find((b) => /Ground Floor/.test(b.textContent ?? '') && b.getAttribute('aria-expanded') === null);
    assert.ok(row, 'the level row');
    act(() => { row.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true })); });
    assert.equal(useDocumentTabs.getState().activeId, 'plain-ground');
    assert.equal(useProjectStore.getState().views.length, 2, 'no plan was added');
  });
});
