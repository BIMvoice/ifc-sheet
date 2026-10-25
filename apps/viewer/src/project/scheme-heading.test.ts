/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The heading of the legend of a view's colours (#92): a readable, translated name rather than the raw property path, and the
 * user's own title when the scheme carries one. Read through the real legend layout, so the screen and the sheet agree.
 */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ColourScheme } from '@bimvoice/ifcsheet/colour-scheme';
import { readColourScheme } from '@bimvoice/ifcsheet/colour-scheme';
import { colourSchemeEn } from '@/i18n/catalogues/colour-scheme.en';
import { colourSchemeRo } from '@/i18n/catalogues/colour-scheme.ro';
import { addLegend } from '@/legend/legend-actions';
import { layoutOf, readLegendEnv } from '@/legend/legend-env';
import type { LegendLabels } from '@/legend/legend-layout';
import { attributeLabeller } from '@/components/viewer/legend/LegendGraphic';
import { resetProject, useProjectStore } from './project-store';
import { setColourScheme, patchColourScheme } from './colour-scheme-actions';
import { planViewFor } from './view-defaults';
import type { ProjectView } from './types';

const labelsIn = (catalogue: Record<string, unknown>): LegendLabels => ({
  heading: { materials: 'M', layers: 'L', hatches: 'H', symbols: 'S', annotations: 'A', colours: 'C' },
  tool: (tool) => tool,
  continued: (heading) => heading,
  membrane: 'membrane',
  sampleText: 'Abc',
  attribute: attributeLabeller((key) => String(catalogue[key] ?? key)),
});
const EN = labelsIn(colourSchemeEn);
const RO = labelsIn(colourSchemeRo);

let view: ProjectView;
let legendId: string;
beforeEach(() => {
  resetProject();
  view = planViewFor({ id: 'lvl', name: 'Level 1', elevation: 0, storeyGlobalIds: [] } as never, []) as ProjectView;
  useProjectStore.setState({ views: [view] });
  setColourScheme(view.id, { property: 'LongName', target: 'rooms' });
  legendId = addLegend('LongName', { scope: 'view', scopeId: view.id, categories: ['colours'], headings: false });
});

/** The heading the legend is drawn with: its first text. */
const headingIn = (labels: LegendLabels): string => {
  const legend = useProjectStore.getState().legends!.find((l) => l.id === legendId)!;
  const text = layoutOf(legend, readLegendEnv(labels)).prims.find((p) => p.kind === 'text');
  return text?.kind === 'text' ? text.text : '';
};
const scheme = (): ColourScheme => useProjectStore.getState().views[0]!.graphics!.colourScheme!;

describe('the heading of a colour legend', () => {
  it('names LongName as the room name, in English and in Romanian', () => {
    assert.equal(headingIn(EN), 'Room name');
    assert.equal(headingIn(RO), 'Denumire încăpere');
  });

  it('names ObjectType as the type', () => {
    patchColourScheme(view.id, { property: 'ObjectType' });
    assert.equal(headingIn(EN), 'Type');
    assert.equal(headingIn(RO), 'Tip');
  });

  it('shows only the property name for a Pset.Property', () => {
    patchColourScheme(view.id, { property: 'Pset_SpaceCommon.Category' });
    assert.equal(headingIn(EN), 'Category');
    assert.equal(headingIn(RO), 'Category');
  });

  it('shows the title the user wrote, over the catalogue label, and it survives a change of property', () => {
    patchColourScheme(view.id, { title: 'Function of the rooms' });
    assert.equal(headingIn(EN), 'Function of the rooms');
    assert.equal(headingIn(RO), 'Function of the rooms');
    patchColourScheme(view.id, { property: 'ObjectType' });
    assert.equal(headingIn(EN), 'Function of the rooms');
    patchColourScheme(view.id, { title: undefined });
    assert.equal(scheme().title, undefined);
    assert.equal(headingIn(EN), 'Type');
  });

  it('keeps the title through a project file, and drops a blank one', () => {
    assert.equal(readColourScheme({ property: 'LongName', target: 'rooms', title: ' Use ' })?.title, 'Use');
    assert.equal(readColourScheme({ property: 'LongName', target: 'rooms', title: '  ' })?.title, undefined);
  });
});
