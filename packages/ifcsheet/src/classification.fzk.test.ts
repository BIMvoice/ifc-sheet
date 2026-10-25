/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Classification mapping on AC20-FZK-Haus (#89). The FZK-Haus carries ONE IfcClassificationReference ('000', "Allgemeines", no IfcClassification
 * above it) on its seven rooms (an ARCHICAD "zone category"); its walls and doors carry none. The codes below are EXAMPLES made up for the test:
 * IfcSheet ships no Uniclass or OmniClass table. For the walls, a copy of the model gets a reference on one wall of the 240 type.
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { RelationshipType } from '@ifc-lite/data';
import { run } from './cli.js';
import { classificationOf, classifiedTypes, type ClassificationMapping } from './classification.js';
import { storeClassifications } from './classification-read.js';
import { readBoqElements, storeSource } from './boq-read.js';
import { openModel, type OpenedModel } from './model.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus classification test: ${missing}`);

const TYPE_240 = 'Leichtbeton 102890359 240';
const EXAMPLE: ClassificationMapping = {
  id: 'ex', system: { name: 'Uniclass', edition: '2015' },
  rules: [
    { by: 'type', match: TYPE_240, code: 'EXAMPLE-Ss_25', title: 'EXAMPLE: wall systems' },
    { by: 'class', match: 'IfcDoor', code: 'EXAMPLE-Ss_32', title: 'EXAMPLE: door systems' },
    { by: 'class', match: 'IfcSpace', code: 'EXAMPLE-Sp_10', title: 'EXAMPLE: spaces' },
  ],
};

describe.skipIf(missing !== null)('classification on AC20-FZK-Haus', () => {
  let text: string;
  let model: OpenedModel;
  beforeAll(async () => {
    text = readFileSync(FZK, 'latin1');
    model = await openModel(new Uint8Array(Buffer.from(text, 'latin1')), { geometry: false });
  }, 120_000);

  const typeRows = (m: OpenedModel, mappings: ClassificationMapping[]) =>
    classifiedTypes(readBoqElements(storeSource('m', m.dataStore), new Set()), mappings, storeClassifications(new Map([['m', m.dataStore]])));

  it('maps the wall type and the doors, and leaves what no rule reaches without a code', () => {
    const rows = typeRows(model, [EXAMPLE]);
    const walls = rows.filter((r) => r.typeName === TYPE_240);
    expect(walls).toEqual([{ className: 'IfcWallType', typeName: TYPE_240, code: 'EXAMPLE-Ss_25', title: 'EXAMPLE: wall systems', source: 'mapping', count: 5 }]);
    const doors = rows.filter((r) => r.code === 'EXAMPLE-Ss_32');
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.reduce((n, r) => n + r.count, 0)).toBe(5);
    expect(rows.filter((r) => r.typeName === 'Leichtbeton 102890359 300').map((r) => r.source)).toEqual(['none']);
  });

  it('the model\'s own reference wins: the rooms keep \'000\' although the mapping has a rule for IfcSpace', () => {
    const store = model.dataStore;
    const spaces = store.entityIndex.byType.get('IFCSPACE') ?? [];
    expect(spaces.length).toBe(7);
    const reader = storeClassifications(new Map([['m', store]]));
    for (const id of spaces) {
      expect(classificationOf({ className: 'IfcSpace', modelId: 'm', expressId: id }, [EXAMPLE], reader)).toEqual({ code: '000', title: 'Allgemeines', source: 'model', system: '' });
    }
    // The same elements with no model reader are the mapping's.
    expect(classificationOf({ className: 'IfcSpace', modelId: 'm', expressId: spaces[0] }, [EXAMPLE])).toMatchObject({ code: 'EXAMPLE-Sp_10', source: 'mapping' });
  });

  it('a reference on one wall wins for that wall only', async () => {
    const store = model.dataStore;
    const typeId = [...(store.entityIndex.byType.get('IFCWALLTYPE') ?? [])].find((id) => store.entities.getName(id) === TYPE_240)!;
    const wallId = store.relationships!.getRelated(typeId, RelationshipType.DefinesByType, 'forward')[0];
    const injected = text.replace(/\nENDSEC;\s*\nEND-ISO-10303-21;\s*$/, `\n#900001= IFCCLASSIFICATION('EXAMPLE','2015',$,'Uniclass 2015',$,$,$);\n#900002= IFCCLASSIFICATIONREFERENCE($,'EXAMPLE-OWN','EXAMPLE: the model says',#900001,$,$);\n#900003= IFCRELASSOCIATESCLASSIFICATION('0EXAMPLEclassification',#12,$,$,(#${wallId}),#900002);\nENDSEC;\nEND-ISO-10303-21;\n`);
    expect(injected).not.toBe(text);
    const withRef = await openModel(new Uint8Array(Buffer.from(injected, 'latin1')), { geometry: false });
    const walls = typeRows(withRef, [EXAMPLE]).filter((r) => r.typeName === TYPE_240);
    expect(walls).toEqual([
      { className: 'IfcWallType', typeName: TYPE_240, code: 'EXAMPLE-OWN', title: 'EXAMPLE: the model says', source: 'model', count: 1 },
      { className: 'IfcWallType', typeName: TYPE_240, code: 'EXAMPLE-Ss_25', title: 'EXAMPLE: wall systems', source: 'mapping', count: 4 },
    ]);
  }, 120_000);

  it('is what the command line prints, as text, CSV (formula-guarded) and JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'classify-'));
    const projectFile = join(dir, 'p.ifclite-project.json');
    const guarded: ClassificationMapping = { ...EXAMPLE, rules: [...EXAMPLE.rules, { by: 'type', match: 'Leichtbeton 102890359 300', code: '=EXAMPLE()', title: 'EXAMPLE: guarded' }] };
    writeFileSync(projectFile, JSON.stringify({ format: 'ifclite-project', version: 1, name: 'p', classificationMappings: [guarded] }));
    const out: string[] = [];
    const io = { stdout: (t: string) => void out.push(t), stderr: (t: string) => void out.push(`ERR ${t}`) };
    expect(await run(['classify', FZK, '--project', projectFile, '--json'], io)).toBe(0);
    const json = JSON.parse(out.join(''));
    expect(json.system).toBe('Uniclass 2015');
    expect(json.types.find((t: { type: string }) => t.type === TYPE_240)).toMatchObject({ code: 'EXAMPLE-Ss_25', source: 'mapping', count: 5 });
    out.length = 0;
    expect(await run(['classify', FZK, '--project', projectFile, '--csv'], io)).toBe(0);
    expect(out.join('')).toContain('Class,Type,Code,Title,Source,Count');
    expect(out.join('')).toContain(`WallType,${TYPE_240},EXAMPLE-Ss_25,EXAMPLE: wall systems,mapping,5`);
    expect(out.join('')).toContain("'=EXAMPLE()");
    out.length = 0;
    expect(await run(['classify', FZK, '--project', projectFile, '--system', 'OmniClass'], io)).toBe(1);
    expect(out.join('')).toContain('has no classification system "OmniClass"');
    out.length = 0;
    expect(await run(['classify', FZK, '--project', projectFile], io)).toBe(0);
    expect(out.join('')).toContain('EXAMPLE-Ss_25');
  }, 120_000);
});
