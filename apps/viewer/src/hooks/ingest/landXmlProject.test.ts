/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #204: a LandXML file's own project name fills the title block; without one the file name does (#203). */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useViewerStore } from '@/store';
import type { FederatedModel } from '@/store/types';
import { resetProject } from '@/project/project-store';
import { effectiveTitleBlock } from '@/project/title-block-model';
import { readLandXmlProject, readLandXmlProjectFromFile } from './landXmlProject';
import type { LandXmlTinDocument } from './landXmlSemantics';

const XML = (project: string, application = '<Application name="Civil &amp; Co" version="3"/>') => `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2">
  <Units><Metric linearUnit="meter"/></Units>
  <Project ${project}/>
  ${application}
</LandXML>`;

const open = (xml: string | null, file: string): void => {
  const project = xml ? readLandXmlProject(xml) : undefined;
  const model = { id: 'm', name: file, ifcDataStore: null, visible: true, landXmlDocument: project ? { project } as LandXmlTinDocument : undefined } as unknown as FederatedModel;
  useViewerStore.setState({ models: new Map([['m', model]]) });
};

beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map() }); });

describe('LandXML project in the title block', () => {
  it('reads Project and Application names, entities decoded', () => {
    assert.deepEqual(readLandXmlProject(XML('name="A &lt;1&gt; Road" desc="x"')), { name: 'A <1> Road', application: 'Civil & Co' });
  });

  it('reads the head of a file', async () => {
    assert.equal((await readLandXmlProjectFromFile(new Blob([XML("name='Bridge'")])))?.name, 'Bridge');
  });

  it('prints the file project name instead of the file name', () => {
    open(XML('name="Ring Road East"'), 'terrain_v2.xml');
    assert.equal(effectiveTitleBlock().project, 'Ring Road East');
  });

  it('falls back to the file name without a Project name', () => {
    open(XML('desc="no name"', ''), 'terrain_v2.xml');
    assert.equal(effectiveTitleBlock().project, 'terrain v2');
    open(null, 'terrain_v2.xml');
    assert.equal(effectiveTitleBlock().project, 'terrain v2');
  });
});
