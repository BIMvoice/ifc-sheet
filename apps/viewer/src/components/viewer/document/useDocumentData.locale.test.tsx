/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Numbers a document binds from the model are written in the active
 * language's separators (#269): a storey's elevation as "+2,70 m" in
 * Romanian and "+2.70 m" in English, a decimal property as "12,5" / "12.5",
 * for the parsed read and the edited read alike. A language switch builds a
 * new binding context, so the text re-resolves with no other mechanism: a
 * document resolves when it is shown or printed (unlike a label on a sheet,
 * which is stored text and is re-written by `label-sync`).
 */
import '@/test/setup-dom.js';
import '@/test/content-fixture.js';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { MutablePropertyView } from '@ifc-lite/mutations';
import { registerLocale, setLocale } from '@/i18n';
import { useViewerStore } from '@/store/index.js';
import { fixtureModel } from '@/test/store-fixture.js';
import { render, cleanup, waitFor } from '@/test/render.js';
import { renderTemplate, type BindingContext } from '@/lib/document/bindings.js';
import { useDocumentData } from './useDocumentData.js';

const WALL = '0Wall00000000000000041';
const IFC = `ISO-10303-21;
HEADER; FILE_DESCRIPTION((''),'2;1'); FILE_NAME('t','',(''),(''),'','',''); FILE_SCHEMA(('IFC4')); ENDSEC;
DATA;
#1=IFCPROJECT('0Project0000000000000a',$,'Tower',$,$,$,$,$,$);
#2=IFCSITE('0Site000000000000000002',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);
#3=IFCBUILDING('0Building00000000000003',$,'Building',$,$,$,$,$,.ELEMENT.,$,$,$);
#5=IFCBUILDINGSTOREY('0Storey00000000000005',$,'Level 1',$,$,$,$,$,.ELEMENT.,2.7);
#11=IFCRELAGGREGATES('0Agg000000000000000011',$,$,$,#1,(#2));
#12=IFCRELAGGREGATES('0Agg000000000000000012',$,$,$,#2,(#3));
#13=IFCRELAGGREGATES('0Agg000000000000000013',$,$,$,#3,(#5));
#41=IFCWALL('${WALL}',$,'Wall A',$,$,$,$,$,$);
#50=IFCPROPERTYSINGLEVALUE('Span',$,IFCREAL(12.5),$);
#51=IFCPROPERTYSET('0Pset000000000000000051',$,'Pset_Test',$,(#50));
#52=IFCRELDEFINESBYPROPERTIES('0Rel000000000000000052',$,$,$,(#41),#51);
#90=IFCRELCONTAINEDINSPATIALSTRUCTURE('0Rel000000000000000090',$,$,$,(#41),#5);
ENDSEC; END-ISO-10303-21;`;

const ELEVATION = '{IfcBuildingStorey[Level 1].Elevation}';
const SPAN = `{Element[${WALL}].Pset_Test.Span}`;

async function store(): Promise<IfcDataStore> {
  const bytes = new TextEncoder().encode(IFC);
  return new IfcParser().parseColumnar(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

const context = (ifc: IfcDataStore, locale: string | undefined, view?: MutablePropertyView): BindingContext =>
  ({ models: [{ id: 'm1', name: 'tower.ifc', store: ifc, view }], activeModelId: 'm1', today: new Date(0), locale });

describe('document bindings follow the language (#269)', () => {
  let ifc: IfcDataStore;
  beforeEach(async () => { ifc = await store(); registerLocale('ro', {}); });
  afterEach(() => { cleanup(); setLocale('en'); });

  it('writes a bound elevation and a decimal property in the locale, parsed read', () => {
    assert.equal(renderTemplate(ELEVATION, context(ifc, 'ro')).text, '+2,70 m');
    assert.equal(renderTemplate(ELEVATION, context(ifc, 'en')).text, '+2.70 m');
    assert.equal(renderTemplate(SPAN, context(ifc, 'ro')).text, '12,5');
    assert.equal(renderTemplate(SPAN, context(ifc, 'en')).text, '12.5');
    assert.equal(renderTemplate(ELEVATION, context(ifc, undefined)).text, '+2.70 m', 'English when no language is passed');
  });

  it('writes them in the locale when read through an edit overlay, and still reads an edited elevation back', () => {
    const view = new MutablePropertyView(ifc.properties, 'm1');
    view.setProperty(41, 'Pset_Test', 'Span', 7.25);
    assert.equal(renderTemplate(SPAN, context(ifc, 'ro', view)).text, '7,25');
    assert.equal(renderTemplate(SPAN, context(ifc, 'en', view)).text, '7.25');
    assert.equal(renderTemplate(ELEVATION, context(ifc, 'ro', view)).text, '+2,70 m');
  });

  it('re-resolves when the language switches', async () => {
    const model = { ...fixtureModel('m1', { idOffset: 1_000_000 }), name: 'tower.ifc', ifcDataStore: ifc, maxExpressId: 91 };
    useViewerStore.setState({ models: new Map([[model.id, model]]), activeModelId: model.id, mutationViews: new Map(), mutationVersion: 0 });
    function Probe() {
      const { bindings } = useDocumentData(null);
      return <output data-text>{renderTemplate(ELEVATION, bindings).text}</output>;
    }
    const text = (ui: HTMLElement): string | null | undefined => ui.querySelector('[data-text]')?.textContent;
    setLocale('en');
    const ui = render(<Probe />);
    assert.equal(text(ui), '+2.70 m');
    await act(async () => { setLocale('ro'); });
    await waitFor(() => text(ui) === '+2,70 m', 'a bound elevation takes the new language');
    await act(async () => { setLocale('en'); });
    await waitFor(() => text(ui) === '+2.70 m', 'and goes back');
  });
});
