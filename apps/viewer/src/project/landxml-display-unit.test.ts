/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #204: a LandXML file in feet reads in feet on a dimension; a metric one and an explicit project unit are unchanged. */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDimension, DEFAULT_DIM_STYLE } from '@bimvoice/ifcsheet';
import { useViewerStore } from '@/store';
import type { FederatedModel } from '@/store/types';
import { resetProject, useProjectStore } from '@/project/project-store';
import { currentSheetLocale } from '@/project/units-and-numbers';
import { landXmlDisplayUnit } from './landxml-display-unit';

const open = (linearUnit: string): void => {
  const landXmlDocument = { units: { linearUnit } };
  const model = { id: 'm', name: 'f.xml', ifcDataStore: null, visible: true, landXmlDocument } as unknown as FederatedModel;
  useViewerStore.setState({ models: new Map([['m', model]]) });
};

// The model is in metres: 30.48 m is 100 ft; 3048 m is 10000 ft but 9999.98 US survey feet (2 ppm shorter).
const dimension = (metres = 30.48): string => formatDimension(currentSheetLocale('en'), metres, DEFAULT_DIM_STYLE);

beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map() }); });

describe('LandXML units on dimension text', () => {
  it('maps the foot tokens and leaves metric alone', () => {
    assert.equal(landXmlDisplayUnit('foot'), 'ft');
    assert.equal(landXmlDisplayUnit('USSurveyFoot'), 'ftUS');
    assert.equal(landXmlDisplayUnit('meter'), undefined);
  });

  it('a metric file reads in metres', () => {
    open('meter');
    assert.equal(dimension(), '30.48');
  });

  it('a file in feet reads in feet', () => {
    open('foot');
    assert.equal(dimension(), '100.00');
  });

  it('a file in US survey feet reads in survey feet', () => {
    open('USSurveyFoot');
    assert.equal(dimension(3048), '9999.98');
  });

  it('the unit the project names wins over the file', () => {
    open('foot');
    useProjectStore.setState({ unitsAndNumbers: { lengthUnit: 'm' } });
    assert.equal(dimension(), '30.48');
  });
});
