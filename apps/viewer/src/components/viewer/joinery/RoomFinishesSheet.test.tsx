/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room finishes of the synthetic rooms-with-finishes fixture (#77), read
 * through the real parser:
 *  - every room lists its finishes and areas, the expected values computed
 *    here from the fixture's own STEP text, not by the module under test;
 *  - placed on an A-6xx sheet, the table is in the sheet's SVG and its DXF.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanup, render } from '@/test/render.js';
import { parseStep } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet, addScheduleToSet } from '@/project/drawing-set-actions';
import { finishLines, roomFinishes } from '@/joinery/room-finishes';
import { collectRoomInputs } from '@/joinery/room-finishes-models';
import { roomFinishesCsv } from '@/joinery/room-finishes-layout';
import { WallSheet } from '../wall/WallSheet';
import { sheetSvgText } from '../sheets/sheet-export';
import { sheetDxf } from '../sheets/sheet-dxf';

const FIXTURE = new URL('../../../../public/_fixtures/rooms-with-finishes.ifc', import.meta.url);

/**
 * What the fixture says, read straight off its STEP text: per room (by Name),
 * the finishes as [surface, name, area|null] in file order. Net area, else
 * gross; CoversSpaces beats SpaceBoundary beats containment for a surface,
 * and the Pset_SpaceCoveringRequirements property is the last resort.
 */
function expectedFromStep(step: string): Map<string, [string, string, number | null][]> {
  /** A STEP entity's top-level arguments (parentheses and quotes respected). */
  const split = (args: string): string[] => {
    const out: string[] = [];
    let depth = 0, quoted = false, cur = '';
    for (const ch of args) {
      if (ch === "'") quoted = !quoted;
      if (!quoted && ch === '(') depth++;
      if (!quoted && ch === ')') depth--;
      if (!quoted && depth === 0 && ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    return [...out, cur];
  };
  const rows = new Map<number, { type: string; a: string[] }>();
  for (const m of step.matchAll(/^#(\d+)=(\w+)\((.*)\);$/gm)) rows.set(Number(m[1]), { type: m[2], a: split(m[3]) });
  const ids = (s: string) => [...s.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  const text = (s: string) => s.replace(/^'|'$/g, '');
  const ofType = (type: string) => [...rows.values()].filter((r) => r.type === type);
  /** NetArea, else GrossArea, of the Qto_CoveringBaseQuantities defined on a covering. */
  const areaOf = (cov: number): number | null => {
    for (const rel of ofType('IFCRELDEFINESBYPROPERTIES')) {
      if (!ids(rel.a[4]).includes(cov)) continue;
      const qset = rows.get(ids(rel.a[5])[0])!;
      if (text(qset.a[2]) !== 'Qto_CoveringBaseQuantities') continue;
      const q = new Map(ids(qset.a[5]).map((i) => rows.get(i)!).map((r) => [text(r.a[0]), Number(r.a[3])] as const));
      return q.get('NetArea') ?? q.get('GrossArea') ?? null;
    }
    return null;
  };
  const surface = (cov: number) => ({ FLOORING: 'floor', CLADDING: 'wall', CEILING: 'ceiling' } as Record<string, string>)[rows.get(cov)!.a[8].replace(/\./g, '')];
  const out = new Map<string, [string, string, number | null][]>();
  for (const [id, space] of rows) {
    if (space.type !== 'IFCSPACE') continue;
    const covers = ofType('IFCRELCOVERSSPACES').filter((r) => ids(r.a[4])[0] === id).flatMap((r) => ids(r.a[5]));
    const boundary = ofType('IFCRELSPACEBOUNDARY').filter((r) => ids(r.a[4])[0] === id).flatMap((r) => ids(r.a[5]));
    const contained = ofType('IFCRELCONTAINEDINSPATIALSTRUCTURE').filter((r) => ids(r.a[5])[0] === id).flatMap((r) => ids(r.a[4]));
    const props = ofType('IFCRELDEFINESBYPROPERTIES').filter((r) => ids(r.a[4]).includes(id)).map((r) => rows.get(ids(r.a[5])[0])!)
      .filter((p) => p.type === 'IFCPROPERTYSET' && text(p.a[2]) === 'Pset_SpaceCoveringRequirements')
      .flatMap((p) => ids(p.a[4]).map((i) => rows.get(i)!));
    const finishes: [string, string, number | null][] = [];
    for (const s of ['floor', 'wall', 'ceiling']) {
      const pool = [covers, boundary, contained].map((c) => c.filter((x) => surface(x) === s)).find((c) => c.length);
      if (pool) { for (const c of pool) finishes.push([s, text(rows.get(c)!.a[2]), areaOf(c)]); continue; }
      const prop = props.find((p) => text(p.a[0]) === `${s[0].toUpperCase()}${s.slice(1)}Covering`);
      if (prop) finishes.push([s, prop.a[2].replace(/^IFCLABEL\('|'\)$/g, ''), null]);
    }
    out.set(text(space.a[2]), finishes);
  }
  return out;
}

async function loadFixture() {
  const bytes = new Uint8Array(readFileSync(FIXTURE));
  const store = await parseStep(bytes);
  useViewerStore.setState({ models: new Map([['fx', { id: 'fx', name: 'fx', ifcDataStore: store, visible: true } as never]]) });
  return new TextDecoder().decode(bytes);
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('room finishes of the rooms-with-finishes fixture (#77)', () => {
  it('lists each room with the finishes and areas its Qto and relations give', async () => {
    const step = await loadFixture();
    const expected = expectedFromStep(step);
    const rooms = roomFinishes(collectRoomInputs());
    assert.deepEqual(rooms.map((r) => r.number), ['101', '102', '103']);
    for (const r of rooms) {
      const got = (['floor', 'wall', 'ceiling'] as const).flatMap((s) => r.finishes[s].map((f) => [s, f.name, f.area] as const));
      assert.deepEqual(got.map((g) => [...g]), expected.get(r.number)!.map((e) => [...e]), `room ${r.number}`);
    }
    // The independent reading is not empty and carries each fallback: gross area, containment, boundary, property.
    assert.deepEqual(expected.get('101')!.map((e) => e[2]), [24.5, 52, 24.8]);
    assert.deepEqual(expected.get('102')!, [['floor', 'Carpet tile', 14.2], ['wall', 'Oak veneer panel', 9.5], ['ceiling', 'Painted plaster', 14]]);
    assert.deepEqual(expected.get('103')!, [['floor', 'Concrete, sealed', null], ['ceiling', 'Acoustic tile', null]]);
    assert.equal(rooms[1].finishes.wall[0].source, 'containment');
    assert.equal(finishLines(rooms).length, 3);
    assert.equal(roomFinishesCsv(rooms, { title: 'T', number: 'No.', room: 'Room', level: 'Level', floor: 'Floor', wall: 'Wall', ceiling: 'Ceiling', area: 'm²' }).split('\n')[1], '101,Living room,Level 1,Oak parquet,24.5,"Plaster, painted white",52,Suspended plasterboard,24.8');
  });

  it('prints the table into the sheet SVG and the DXF', async () => {
    await loadFixture();
    startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
    const sheetId = addScheduleToSet('finishes', 'Room finishes');
    const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
    assert.match(sheet.number, /^A-6\d\d$/);

    const ui = render(<WallSheet sheet={sheet} width={1000} />);
    const svg = ui.querySelector<SVGSVGElement>(`svg[data-sheet-id="${sheet.id}"]`);
    assert.ok(svg, 'the sheet is drawn');
    const text = sheetSvgText(svg, sheet);
    const dxf = new TextDecoder().decode(sheetDxf(svg, sheet));
    for (const t of ['Room finishes', 'Living room', 'Oak parquet', '24.50', '52.00', '24.80', 'Oak veneer panel', '9.50', 'Concrete, sealed', 'Acoustic tile']) {
      assert.ok(text.includes(`>${t}<`), `${t} in the SVG`);
      assert.ok(dxf.includes(t), `${t} in the DXF`);
    }
  });
});
