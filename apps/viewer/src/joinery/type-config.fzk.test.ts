/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The opening configuration of a window type, on AC20-FZK-Haus (#448), whose windows carry only an overall size: configure one type as a
 * double tilt-turn and the joinery schedule's elevation shows the opening lines for that type, the plan shows the leaf symbol of every window
 * of the type, the configuration survives save and reopen, and the standard's direction setting flips the diagonals.
 */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MeshData } from '@ifc-lite/geometry';
import { GRAPHIC_STANDARDS, type GraphicStandard } from '@bimvoice/ifcsheet';
import { parseStep } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { setGraphicStandard } from '@/project/graphic-standard-actions';
import { openingSymbols } from '@/drafting/opening-symbols';
import { drawnJoinery, elementFacts } from './mapped-joinery';
import { invalidateJoineryReads } from './element-spec';
import { layoutSchedule, type ScheduleLabels, type SchedulePrim } from './schedule-layout';
import { scheduleData, type ScheduleEntry } from './schedule-data';
import { configureElementType, typeOpeningOf } from './type-config-actions';
import { setOpeningConvention } from './opening-convention';
import type { ElementFacts } from './symbol-mapping';

const MODEL = 'fzk';
const labels: ScheduleLabels = {
  locale: 'en', title: 'Joinery', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire',
  op: (op) => op,
};

async function openFzk(): Promise<void> {
  const store = await parseStep(new Uint8Array(readFileSync(new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url))));
  useViewerStore.setState({ models: new Map([[MODEL, { id: MODEL, name: MODEL, ifcDataStore: store, visible: true } as never]]) });
  invalidateJoineryReads();
}

/** Every window of the model with its facts, grouped by IFC type; the type with most windows, and the windows of the others. */
function windowsByType(): { biggest: ElementFacts[]; others: ElementFacts[] } {
  const all = scheduleData('window').entries.flatMap((e) => e.occurrences)
    .map((o) => elementFacts(MODEL, o.expressId)).filter((f): f is ElementFacts => f !== null);
  const byType = new Map<string, ElementFacts[]>();
  for (const f of all) if (f.typeGlobalId) byType.set(f.typeGlobalId, [...(byType.get(f.typeGlobalId) ?? []), f]);
  const biggest = [...byType.values()].sort((a, b) => b.length - a.length)[0];
  return { biggest, others: all.filter((f) => !biggest.includes(f)) };
}

const DOUBLE_TILT_TURN = { operations: ['tilt-turn-left', 'tilt-turn-right'] as const, fanlight: false };
const configure = (f: ElementFacts) => configureElementType(f, { operations: [...DOUBLE_TILT_TURN.operations], fanlight: false });

/** The schedule's cell of the window entry for `type`: its prims. Only that entry is laid out. */
function cellPrims(typeEntryName: string): SchedulePrim[] {
  const data = scheduleData('window');
  const entry = data.entries.find((e) => e.spec && e.name === typeEntryName);
  assert.ok(entry, 'the configured type has a row in the schedule');
  return layoutSchedule({ ...data, entries: [entry] }, labels, { scale: 20 }).prims;
}

/** The open three-point polylines of a cell: the triangles of the opening symbols (nothing else of a cell is one). */
const triangles = (prims: SchedulePrim[]) => prims.flatMap((p) => (p.kind === 'path' && !p.closed && p.pts.length === 3 ? [p.pts] : []));
/** A side-hung triangle has its base on a jamb (first and last points above each other); the tilt triangle has its base on the rail. */
const sideTriangles = (prims: SchedulePrim[]) => triangles(prims).filter((t) => Math.abs(t[0].x - t[2].x) < 1e-6).sort((a, b) => Math.min(a[0].x, a[1].x) - Math.min(b[0].x, b[1].x));

beforeEach(async () => { resetProject(); await openFzk(); });

describe('configuring a window type of FZK-Haus as a double tilt-turn', () => {
  it('FZK windows carry only a size: before, the schedule has no configured row and no opening lines', () => {
    const { biggest } = windowsByType();
    assert.ok(biggest.length >= 2, 'a type with several windows');
    assert.equal(typeOpeningOf(biggest[0]), null);
    assert.ok(scheduleData('window').entries.every((e) => !e.spec), 'no row is configured');
    assert.equal(drawnJoinery(MODEL, scheduleData('window').entries[0].occurrences[0].expressId), null);
  });

  it('the type has a row of its own with exactly its windows: a window of another type that shares its name is not pulled in', () => {
    const { biggest, others } = windowsByType();
    assert.ok(others.length > 0, 'FZK has windows of another type');
    // The premise of the rule: before the configuration the other type's windows are the same name as the type's.
    const name = (f: ElementFacts) => f.names[0];
    assert.ok(others.some((o) => o.names.includes(name(biggest[0]))), 'FZK has a second window type with the same name');
    const before = scheduleData('window').entries.reduce((n, e) => n + e.total, 0);
    configure(biggest[0]);
    invalidateJoineryReads();
    const data = scheduleData('window');
    const row = data.entries.find((e) => e.spec);
    assert.ok(row?.spec);
    const ids = new Set(biggest.map((f) => f.globalId));
    assert.deepEqual(new Set(row.occurrences.map((o) => o.globalId)), ids, 'the row holds the windows of the configured type and no others');
    assert.equal(row.total, biggest.length);
    assert.equal(data.entries.reduce((n, e) => n + e.total, 0), before, 'no window is lost or counted twice');
    assert.deepEqual(row.spec.panels.map((p) => p.operation), ['tilt-turn-left', 'tilt-turn-right']);
    for (const f of biggest) {
      const drawn = drawnJoinery(MODEL, row.occurrences.find((o) => o.globalId === f.globalId)!.expressId);
      assert.equal(drawn?.source, 'type');
      assert.deepEqual(drawn.spec.panels.map((p) => p.operation), ['tilt-turn-left', 'tilt-turn-right']);
      assert.deepEqual([drawn.spec.width, drawn.spec.height], [f.width, f.height], 'the size is the IFC\'s');
    }
    for (const f of others) {
      assert.equal(drawn(f)?.entry?.id ?? null, null, 'a window of another type is not drawn with the configured entry');
      const own: ScheduleEntry | undefined = data.entries.find((e) => e !== row && e.occurrences.some((o) => o.globalId === f.globalId));
      assert.ok(own && !own.spec, 'it stays in a row of its own, unconfigured');
    }
  });

  it('the schedule\'s elevation shows the opening lines of the type: a side triangle and a tilt triangle per leaf', () => {
    const { biggest } = windowsByType();
    configure(biggest[0]);
    invalidateJoineryReads();
    const entry = scheduleData('window').entries.find((e) => e.spec)!;
    const prims = cellPrims(entry.name);
    assert.equal(triangles(prims).length, 4, 'two leaves, each with a side triangle and a tilt triangle');
    assert.equal(sideTriangles(prims).length, 2);
  });

  it('the plan shows the leaf symbol of a window of the type: a dashed swing arc per leaf, none before', () => {
    const { biggest } = windowsByType();
    const f = biggest[0];
    const w = f.width!, h = f.height!;
    const pts = [-w / 2, w / 2].flatMap((x) => [0, h].flatMap((y) => [-0.1, 0.1].flatMap((z) => [x, y, z])));
    const mesh = { expressId: 7, ifcType: 'IfcWindow', positions: new Float32Array(pts), localToWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } as unknown as MeshData;
    const plan = { axis: 'y' as const, position: h / 2, flipped: false };
    const dashedBefore = openingSymbols([mesh], plan, () => 0, () => drawnJoinery(MODEL, 0))[0]?.dashed?.length ?? 0;
    assert.equal(dashedBefore, 0);
    configure(f);
    invalidateJoineryReads();
    const row = scheduleData('window').entries.find((e) => e.spec)!;
    const typed = () => ({ spec: drawnJoinery(MODEL, row.occurrences.find((o) => o.globalId === f.globalId)!.expressId)!.spec, flips: 0, source: 'type' });
    const [symbol] = openingSymbols([mesh], plan, () => 0, typed);
    assert.equal(symbol.dashed?.length, 2, 'one swing arc per hinged leaf');
  });

  it('is saved in the project and reopened: the file keeps the leaves and the type still resolves', () => {
    const { biggest } = windowsByType();
    configure(biggest[0]);
    const text = serializeProject(projectDocument());
    resetProject();
    assert.equal(typeOpeningOf(biggest[0]), null, 'a new project has none');
    loadProjectDocument(parseProjectFile(text));
    invalidateJoineryReads();
    assert.deepEqual(typeOpeningOf(biggest[0]), { operations: ['tilt-turn-left', 'tilt-turn-right'], fanlight: false });
    const row = scheduleData('window').entries.find((e) => e.spec);
    assert.ok(row && row.total >= biggest.length);
    const mine = row.occurrences.find((o) => o.globalId === biggest[0].globalId)!;
    assert.equal(drawnJoinery(mine.modelId, mine.expressId)?.source, 'type', 'chosen for its type, not found by name');
    assert.equal(triangles(cellPrims(row!.name)).length, 4);
  });
});

describe('the direction of the opening lines', () => {
  const left = (convention: 'handle' | 'hinge') => {
    const { biggest } = windowsByType();
    configure(biggest[0]);
    invalidateJoineryReads();
    setOpeningConvention(convention);
    const side = sideTriangles(cellPrims(scheduleData('window').entries.find((e) => e.spec)!.name));
    // [base, apex, base]: apex x against the base x. The left leaf has its hinges on the left.
    return side.map((t) => Math.sign(t[1].x - t[0].x));
  };

  it('towards the handle (the default) the apex is across the leaf from its hinges; towards the hinge it is on them', () => {
    assert.deepEqual(left('handle'), [1, -1], 'left leaf: apex to the right (handle side); right leaf: apex to the left');
    assert.deepEqual(left('hinge'), [-1, 1], 'left leaf: apex on its left hinges; right leaf: on its right hinges');
  });

  it('the built-in standards keep the direction IfcSheet has always drawn', () => {
    for (const g of GRAPHIC_STANDARDS) assert.equal((g as GraphicStandard).openingLines, 'towardsHandle', g.id);
  });

  it('a standard that points the lines towards the hinge flips the schedule\'s diagonals when it is chosen', () => {
    const hinge: GraphicStandard = { ...GRAPHIC_STANDARDS[0], id: 'test-towards-hinge', name: 'Test (towards the hinge)', openingLines: 'towardsHinge' };
    const standards = GRAPHIC_STANDARDS as GraphicStandard[];
    standards.push(hinge);
    try {
      const { biggest } = windowsByType();
      configure(biggest[0]);
      invalidateJoineryReads();
      const apexSides = () => sideTriangles(cellPrims(scheduleData('window').entries.find((e) => e.spec)!.name)).map((t) => Math.sign(t[1].x - t[0].x));
      setGraphicStandard('default');
      assert.deepEqual(apexSides(), [1, -1]);
      setGraphicStandard(hinge.id);
      assert.equal(useProjectStore.getState().openingLines, 'hinge');
      assert.deepEqual(apexSides(), [-1, 1]);
    } finally {
      standards.splice(standards.indexOf(hinge), 1);
    }
  });

  it('choosing a standard sets the project\'s direction from it, and the setting can still be changed after', () => {
    setOpeningConvention('hinge');
    setGraphicStandard('default');
    assert.equal(useProjectStore.getState().openingLines, 'handle', 'the standard\'s direction replaces the earlier choice');
    setOpeningConvention('hinge');
    assert.equal(useProjectStore.getState().openingLines, 'hinge');
  });
});

function drawn(f: ElementFacts) {
  const row = scheduleData('window').entries.flatMap((e) => e.occurrences).find((o) => o.globalId === f.globalId);
  return row ? drawnJoinery(row.modelId, row.expressId) : null;
}
