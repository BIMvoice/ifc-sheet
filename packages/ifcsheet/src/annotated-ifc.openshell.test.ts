/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The annotated copy read by IfcOpenShell (#82), an implementation that is not ours: it opens the file, validates every entity the
 * copy added against the schema (attribute types and WHERE rules) and finds the annotations on their storeys. Skipped, and said,
 * where no Python with `ifcopenshell` is on the machine (set `IFCSHEET_PYTHON` to pick one). Findings the SOURCE already has are not
 * the copy's doing, so only those on added entities count.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildAnnotatedIfc, type AnnotatedView } from './annotated-ifc.js';

const SCRIPT = fileURLToPath(new URL('../test-support/check-annotated.py', import.meta.url));
const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));

function findPython(): string | null {
  for (const py of [process.env.IFCSHEET_PYTHON, 'python3.11', 'python3', 'python'].filter((p): p is string => !!p)) {
    try {
      execFileSync(py, ['-c', 'import ifcopenshell.validate'], { stdio: 'ignore' });
      return py;
    } catch {
      /* not this one */
    }
  }
  return null;
}
const python = findPython();
if (!python) console.warn('[ifcsheet] skipping the IfcOpenShell reading of the annotated copy: no python with ifcopenshell (set IFCSHEET_PYTHON)');

interface Reading {
  schema: string;
  new_findings: string[];
  annotations: { name: string; storey: string; storey_class: string; literals: string[]; curves: number; pset: Record<string, unknown> }[];
  marked: { guid: string; Mark: string }[];
}

const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-annotated-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function read(name: string, bytes: Uint8Array, source: Uint8Array): Reading {
  const file = join(dir, name);
  writeFileSync(file, bytes);
  const highest = Math.max(...[...new TextDecoder().decode(source).matchAll(/^#(\d+)\s*=/gm)].map((m) => Number(m[1])));
  return JSON.parse(execFileSync(python as string, [SCRIPT, file, String(highest)], { encoding: 'utf8', maxBuffer: 1 << 26 })) as Reading;
}

const planView = (id: string, name: string, storey: string, text: string): AnnotatedView => ({
  viewId: id, name, scale: 100, storeyGlobalIds: [storey],
  curves: [
    { type: 'polyline', points: [{ x: 2, y: 3 }, { x: 3, y: 4 }] },
    { type: 'polyline', points: [{ x: 1, y: 0.6 }, { x: 5, y: 0.6 }] },
    { type: 'circle', centre: { x: 3, y: 4 }, radius: 0.2 },
  ],
  texts: [{ position: { x: 3, y: 4 }, text, width: 0.9, height: 0.25 }, { position: { x: 2.5, y: 0.7 }, direction: { x: 1, y: 0 }, text: '4,00', width: 0.8, height: 0.25 }],
});

describe.skipIf(!python)('IfcOpenShell reads the annotated copy', () => {
  it('IFC2X3 in millimetres: the added entities validate against the 2X3 schema, the mark is a property of its wall', async () => {
    const source = new Uint8Array(readFileSync(fileURLToPath(new URL('./__fixtures__/annotated-2x3.ifc', import.meta.url))));
    const r = await buildAnnotatedIfc({
      source,
      views: [planView('a', 'Level 1', '0storey000000000000000', 'W-9')],
      marks: [{ globalId: '0wall200000000000000000', mark: 'W-9', views: ['Level 1'] }],
    });
    const seen = read('x23.ifc', r.bytes, source);
    expect(seen.schema).toBe('IFC2X3');
    expect(seen.new_findings).toEqual([]);
    expect(seen.annotations.map((a) => [a.name, a.storey, a.literals, a.curves])).toEqual([['Level 1', 'Level 1', ['W-9', '4,00'], 3]]);
    expect(seen.marked).toEqual([{ guid: '0wall200000000000000000', Mark: 'W-9' }]);
  });

  it('FZK (IFC4): the added entities validate and each annotation is on its own storey', async () => {
    const source = new Uint8Array(readFileSync(FZK));
    const r = await buildAnnotatedIfc({
      source,
      views: [planView('a', 'Ground floor', '2eyxpyOx95m90jmsXLOuR0', 'W1'), planView('b', 'Roof floor', '273g3wqLzDtfYIl7qqkgcO', 'R1')],
    });
    const seen = read('fzk.ifc', r.bytes, source);
    expect(seen.schema).toBe('IFC4');
    expect(seen.new_findings).toEqual([]);
    expect(seen.annotations.map((a) => [a.name, a.storey, a.storey_class, a.literals, a.curves])).toEqual([
      ['Ground floor', 'Erdgeschoss', 'IfcBuildingStorey', ['W1', '4,00'], 3],
      ['Roof floor', 'Dachgeschoss', 'IfcBuildingStorey', ['R1', '4,00'], 3],
    ]);
    expect(seen.annotations[0].pset).toMatchObject({ View: 'Ground floor', Scale: '1:100' });
  });
});
