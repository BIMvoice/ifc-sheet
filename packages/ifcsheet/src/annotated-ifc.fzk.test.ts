/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The annotated copy of AC20-FZK-Haus (#82): tags and dimensions on its two storeys written into a copy of the file. The copy is
 * read back with the repo's own parser, every original STEP line is held byte for byte, and the source bytes are not touched.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IfcParser } from '@ifc-lite/parser';
import { buildAnnotatedIfc, type AnnotatedIfcInput, type AnnotatedView } from './annotated-ifc.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : null;

const GROUND = '2eyxpyOx95m90jmsXLOuR0';
const ROOF = '273g3wqLzDtfYIl7qqkgcO';

/** A tag (a leader and its text) and a dimension (two extension lines, the dimension line, the figure) on a plan. */
function planView(id: string, name: string, storey: string, text: string): AnnotatedView {
  return {
    viewId: id,
    name,
    scale: 100,
    storeyGlobalIds: [storey],
    curves: [
      { type: 'polyline', points: [{ x: 2, y: 3 }, { x: 3, y: 4 }] },
      { type: 'polyline', points: [{ x: 1, y: 1 }, { x: 1, y: 0.5 }] },
      { type: 'polyline', points: [{ x: 5, y: 1 }, { x: 5, y: 0.5 }] },
      { type: 'polyline', points: [{ x: 1, y: 0.6 }, { x: 5, y: 0.6 }] },
    ],
    texts: [
      { position: { x: 3, y: 4 }, text, width: 0.9, height: 0.25 },
      { position: { x: 2.5, y: 0.7 }, text: '4,00', width: 0.8, height: 0.25, direction: { x: 1, y: 0 } },
    ],
  };
}

const stepLines = (text: string): Map<number, string> => {
  const out = new Map<number, string>();
  for (const m of text.matchAll(/^#(\d+)\s*=[^\n]*;$/gm)) out.set(Number(m[1]), m[0]);
  return out;
};

describe.skipIf(missing !== null)('AC20-FZK-Haus with its annotations written back (#82)', () => {
  const source = new Uint8Array(readFileSync(FZK));
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const input: AnnotatedIfcInput = {
    source,
    views: [planView('v-ground', 'Ground floor', GROUND, 'W1'), planView('v-roof', 'Roof floor', ROOF, 'R1')],
  };

  it('writes one IfcAnnotation per plan view, contained in the view\'s own storey', async () => {
    const result = await buildAnnotatedIfc(input);
    // Only what was added: FZK has curve sets and annotations of its own.
    const original = stepLines(new TextDecoder().decode(source));
    const out = [...stepLines(new TextDecoder().decode(result.bytes))].filter(([id]) => !original.has(id)).map(([, line]) => line).join('\n');
    const ds = await new IfcParser().parseColumnar(result.bytes.slice().buffer as ArrayBuffer, { disableWorkerScan: true });
    const storeyOf = (guid: string) => [...ds.spatialHierarchy!.byStorey.keys()].find((id) => ds.entities.getGlobalId(id) === guid) as number;

    expect(result.schema).toBe('IFC4');
    expect(result.annotations.map((a) => a.name)).toEqual(['Ground floor', 'Roof floor']);
    const contained = (guid: string) => ds.spatialHierarchy!.byStorey.get(storeyOf(guid)) ?? [];
    const [ground, roof] = result.annotations;
    expect(contained(GROUND)).toContain(ground.expressId);
    expect(contained(ROOF)).toContain(roof.expressId);
    // And each only in its own storey.
    expect(contained(GROUND)).not.toContain(roof.expressId);
    expect(contained(ROOF)).not.toContain(ground.expressId);

    expect(out.match(/IFCANNOTATION\('[^']+',#12,'(Ground floor|Roof floor)',\$,'IfcSheet:PlanAnnotations'/g)).toHaveLength(2);
    expect(out.match(/IFCANNOTATION\(/g)).toHaveLength(2);
    expect(out.match(/IFCTEXTLITERALWITHEXTENT\('(W1|R1|4,00)'/g)).toHaveLength(4);
    expect(out.match(/IFCGEOMETRICCURVESET\(/g)).toHaveLength(2);
    // Four curves in each view's set.
    const curveSets = [...out.matchAll(/IFCGEOMETRICCURVESET\(\(([^)]*)\)\)/g)].map((m) => m[1].split(',').length);
    expect(curveSets).toEqual([4, 4]);
  });

  it('keeps every original line byte for byte, and puts the new entities after the highest original id', async () => {
    const result = await buildAnnotatedIfc(input);
    const before = stepLines(new TextDecoder().decode(source));
    const after = stepLines(new TextDecoder().decode(result.bytes));
    const changed = [...before].filter(([id, line]) => after.get(id) !== line).map(([id]) => id);
    expect(changed).toEqual([]);
    const highest = Math.max(...before.keys());
    const added = [...after.keys()].filter((id) => !before.has(id));
    expect(added.length).toBeGreaterThan(30);
    expect(Math.min(...added)).toBeGreaterThan(highest);
  });

  it('reuses the Annotation / Plan subcontext the file already has instead of adding a second', async () => {
    const result = await buildAnnotatedIfc(input);
    const original = stepLines(new TextDecoder().decode(source));
    const added = [...stepLines(new TextDecoder().decode(result.bytes))].filter(([id]) => !original.has(id)).map(([, line]) => line).join('\n');
    expect(added).not.toMatch(/IFCGEOMETRICREPRESENTATION(SUB)?CONTEXT/);
    expect(added.match(/IFCSHAPEREPRESENTATION\(#15265,'Annotation','Annotation2D'/g)).toHaveLength(2);
  });

  it('leaves the source bytes as they were', async () => {
    await buildAnnotatedIfc(input);
    expect(createHash('sha256').update(source).digest('hex')).toBe(sourceHash);
    expect(createHash('sha256').update(readFileSync(FZK)).digest('hex')).toBe(sourceHash);
  });
});
