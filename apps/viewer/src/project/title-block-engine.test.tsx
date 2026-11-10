/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectTitleFields, readStoreFacts, standardTitleBlock as engineStandard, STANDARD_CAPTIONS_EN, STANDARD_CAPTIONS_RO, type TitleSources } from '@bimvoice/ifcsheet';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import { en } from '@/i18n/en';
import { sheetsRo } from '@/i18n/catalogues/sheets.ro';
import { titleBlockSourcesRo } from '@/i18n/catalogues/title-block-sources.ro';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { resetProject } from './project-store';
import { effectiveTitleBlock } from './title-block-model';
import { standardTitleBlock } from './title-block-template';

/**
 * The app and the engine's PDF fill the title block from the IFC with one
 * reader (`packages/ifcsheet/src/title-block-records.ts`): over the same parsed
 * model, what the app's sheet prints is what the engine prints, field by field.
 * The app reads names and properties through its label reader, the engine from
 * the record; this is where the two are held to the same answers. The engine's
 * side of it, from the bytes, is `packages/ifcsheet/src/title-block-ifc.test.ts`.
 */

const STEP = `ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCPERSON($,'Ionescu','Ion',$,$,$,$,$);
#2=IFCORGANIZATION($,'Birou de arhitectura',$,$,$);
#3=IFCPERSONANDORGANIZATION(#1,#2,$);
#4=IFCORGANIZATION($,'Graphisoft',$,$,$);
#5=IFCAPPLICATION(#4,'27','ARCHICAD','AC');
#6=IFCOWNERHISTORY(#3,#5,$,.ADDED.,$,$,$,1);
#10=IFCPOSTALADDRESS(.SITE.,$,$,$,('Strada Pacii 12'),$,'Cluj-Napoca',$,'400000','Romania');
#11=IFCPROJECT('0lY6P5Ur90TAQnnnI6wt01',#6,'Casa',$,$,'Casa Taran','Faza DTAC',$,$);
#12=IFCSITE('0lY6P5Ur90TAQnnnI6wt02',#6,'Teren',$,$,$,$,$,.ELEMENT.,$,$,$,'CF 123456',#10);
#20=IFCACTORROLE(.PROJECTMANAGER.,$,$);
#21=IFCPERSON($,'Popescu','Ana',$,$,$,$,$);
#22=IFCACTOR('0lY6P5Ur90TAQnnnI6wt04',$,$,$,$,#21);
#23=IFCRELASSIGNSTOACTOR('0lY6P5Ur90TAQnnnI6wt05',$,$,$,(#11),$,#22,#20);
#24=IFCACTORROLE(.ARCHITECT.,$,$);
#25=IFCORGANIZATION($,'Atelier Verde',$,(#24),$);
#26=IFCACTOR('0lY6P5Ur90TAQnnnI6wt06',$,$,$,$,#25);
#27=IFCRELASSIGNSTOACTOR('0lY6P5Ur90TAQnnnI6wt07',$,$,$,(#11),$,#26,#24);
#30=IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('P-2026-014'),$);
#31=IFCPROPERTYSET('0lY6P5Ur90TAQnnnI6wt08',$,'Pset_ProjectCommon',$,(#30));
#32=IFCRELDEFINESBYPROPERTIES('0lY6P5Ur90TAQnnnI6wt09',$,$,$,(#11),#31);
ENDSEC;
END-ISO-10303-21;`;

beforeEach(() => {
  resetProject();
  useViewerStore.setState({ models: new Map() });
});
afterEach(() => useViewerStore.setState({ models: new Map() }));

describe('the app and the engine fill the title block from the IFC alike', () => {
  const mapping: TitleSources = {
    projectNumber: [{ kind: 'pset', pset: 'Pset_ProjectCommon', property: 'Reference' }],
    client: [{ kind: 'owner', part: 'person' }],
    drawnBy: [{ kind: 'owner', part: 'developer' }],
    checkedBy: [{ kind: 'attribute', on: 'IfcSite', name: 'LandTitleNumber' }],
  };

  for (const [label, typed, custom] of [
    ['by default', undefined, undefined],
    ['with a typed value over the model', { phase: 'PTh', designer: 'Typed' }, undefined],
    ['with the office\'s own mapping (a property, the owner, an attribute)', undefined, mapping],
  ] as const) {
    it(label, async () => {
      const store = await parseStep(STEP);
      seedModel('m', 0, store, 1);
      const app = effectiveTitleBlock(typed ? { ...typed } : {}, custom);
      const engine = projectTitleFields(typed ? { ...typed } : {}, custom, readStoreFacts(store));
      assert.deepEqual(app, engine);
      // Not vacuous: the model said something.
      assert.equal(app.projectManager, 'Ana Popescu');
      assert.equal(app.organisation, 'Birou de arhitectura');
      assert.equal(app.phase, typed?.phase ?? 'Faza DTAC');
      if (custom) assert.deepEqual([app.projectNumber, app.client, app.drawnBy, app.checkedBy], ['P-2026-014', 'Ion Ionescu', 'Graphisoft', 'CF 123456']);
    });
  }
});

describe('the standard layout is one layout', () => {
  it('the app\'s, with its captions in English, is the engine\'s default item for item', () => {
    assert.deepEqual(standardTitleBlock((k) => String(en[k]), DEFAULT_GRAPHIC_STANDARD), engineStandard());
  });

  it('the engine\'s English captions are the app\'s English catalogue', () => {
    for (const [key, caption] of Object.entries(STANDARD_CAPTIONS_EN)) assert.equal(caption, en[key as keyof typeof en], key);
  });

  it('the engine\'s Romanian captions (what ifcsheet build --locale ro prints) are the app\'s Romanian catalogue', () => {
    const ro: Record<string, string> = { ...sheetsRo, ...titleBlockSourcesRo };
    const rows = Object.entries(STANDARD_CAPTIONS_RO);
    assert.equal(rows.length, Object.keys(STANDARD_CAPTIONS_EN).length);
    for (const [key, caption] of rows) assert.equal(caption, ro[key], key);
  });
});
