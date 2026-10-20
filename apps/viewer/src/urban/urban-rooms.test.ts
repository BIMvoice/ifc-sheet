/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Review of #111, items 3 and 4: which IfcSpace Au counts, read from a parsed
 * model, and the spaces' attributes parsed once.
 *
 * Au counts the spaces marked INTERNAL or NOTDEFINED (or unmarked, which says
 * the same). An EXTERNAL space (a balcony), a GFA area-scheme space, and a
 * space that aggregates spaces of its own (counted by its parts) are left out.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useViewerStore } from '@/store';
import { loadUrbanModel, urbanWasm } from '@/test/urban-fixture';
import { collectUrbanAreas } from './urban-models';
import { urbanIndicators } from './indicators';

const FZK = resolve(import.meta.dirname, '../../public/_fixtures/AC20-FZK-Haus.ifc');

const space = (id: number, name: string, longName: string, kind: string, area: number) => [
  `#${id}=IFCSPACE('${String(id).padStart(22, '0')}',$,'${name}',$,$,$,$,'${longName}',.ELEMENT.,${kind},$);`,
  `#${id + 1}=IFCQUANTITYAREA('NetFloorArea',$,$,${area.toFixed(1)},$);`,
  `#${id + 2}=IFCELEMENTQUANTITY('${String(id + 2).padStart(22, '0')}',$,'Qto_SpaceBaseQuantities',$,$,(#${id + 1}));`,
  `#${id + 3}=IFCRELDEFINESBYPROPERTIES('${String(id + 3).padStart(22, '0')}',$,$,$,(#${id}),#${id + 2});`,
].join('\n');

/** One storey; its rooms, a balcony, a GFA space, and an apartment split into two rooms. */
const ROOMS = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,(#20),#30);
#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);
#21=IFCAXIS2PLACEMENT3D(#22,$,$);
#22=IFCCARTESIANPOINT((0.,0.,0.));
#30=IFCUNITASSIGNMENT((#31,#32));
#31=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#32=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#40=IFCBUILDINGSTOREY('2hQBAVPOr5VxhS3Jl0O47h',$,'Parter',$,$,$,$,$,.ELEMENT.,0.);
#41=IFCRELAGGREGATES('0kTvXnbbzCWw8lcMd1dR4o',$,$,$,#1,(#40));
${space(100, '1', 'Living', '.INTERNAL.', 20)}
${space(110, '2', 'Kitchen', '.NOTDEFINED.', 10)}
${space(120, '3', 'Hall', '$', 5)}
${space(130, '4', 'Balcony', '.EXTERNAL.', 6)}
${space(140, '5', 'Gross floor area', '.GFA.', 120)}
${space(150, '6', 'Apartment', '.INTERNAL.', 30)}
${space(160, '6.1', 'Bedroom', '.INTERNAL.', 18)}
${space(170, '6.2', 'Bath', '.INTERNAL.', 12)}
#200=IFCRELAGGREGATES('1Aggr000000000000000001',$,$,$,#40,(#100,#110,#120,#130,#140,#150));
#201=IFCRELAGGREGATES('1Aggr000000000000000002',$,$,$,#150,(#160,#170));
ENDSEC;
END-ISO-10303-21;
`;

describe('which spaces Au counts (review of #111)', () => {
  beforeEach(() => useViewerStore.setState({ models: new Map() }));

  it('counts internal and undefined rooms, and the parts of a split space once; leaves out balconies and area schemes', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('rooms', new TextEncoder().encode(ROOMS), []);
    const areas = collectUrbanAreas(() => undefined);
    assert.deepEqual(areas.spaces.map((s) => s.category).sort(), ['Bath', 'Bedroom', 'Hall', 'Kitchen', 'Living']);
    assert.deepEqual(areas.spacesLeftOut, { external: 1, otherType: 1, parents: 1 });
    const result = urbanIndicators({ ...areas, siteArea: null });
    // 20 + 10 + 5 + 18 + 12: not the balcony's 6, not the GFA's 120, not the apartment's 30 on top of its rooms.
    assert.equal(result.au, 65);
  });

  // Item 4: each space's LongName was parsed off the source again on every edit (`mutationVersion`).
  it('parses a space\'s attributes once per model: an edit measures again without reading them off the source', async (t) => {
    if (!urbanWasm(t)) return;
    const bytes = new Uint8Array(readFileSync(FZK));
    await loadUrbanModel('fzk', bytes);
    const first = collectUrbanAreas();
    assert.ok(first.spaces.some((s) => s.category === 'Schlafzimmer'));
    // Overwrite the LongName in the source the model was parsed from: a reader that parses again sees the new text.
    const store = useViewerStore.getState().models.get('fzk')!.ifcDataStore!;
    assert.ok(store.source.isResident, 'a parsed file keeps its source resident, so its bytes are a view');
    const source = store.source.materialize();
    // The space's own LongName (#20909), not one of the property values that repeat the text.
    const at = Buffer.from(source.buffer, source.byteOffset, source.byteLength).indexOf("#20904,'Schlafzimmer'") + '#20904,'.length;
    assert.ok(at > 7);
    source.set(new TextEncoder().encode("'Xxxxxxxxxxxx'"), at);
    assert.equal(store.source.decodeUtf8(at, at + 14), "'Xxxxxxxxxxxx'", 'the source now reads differently');
    useViewerStore.setState({ mutationVersion: useViewerStore.getState().mutationVersion + 1 });
    const again = collectUrbanAreas();
    assert.notEqual(again, first, 'the edit measured again');
    assert.ok(again.spaces.some((s) => s.category === 'Schlafzimmer'), again.spaces.map((s) => s.category).join(', '));
    assert.equal(again.spaces.length, 7, 'FZK-Haus: all seven rooms are unmarked spaces, and Au counts them all');
  });
});
