/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The head shape and the hand-added properties of a window type, on AC20-FZK-Haus (#448): an arched head draws the schedule's elevation
 * outline and the opening lines inside it as arcs, inside the IFC's overall size; a property typed in for the type (a U value, a free
 * name) is a row of the schedule, is saved with the project and is read back by the headless engine.
 */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readProjectFile, joineryScheduleData } from '@bimvoice/ifcsheet/project';
import { thermalOf } from '@bimvoice/ifcsheet';
import type { JoineryHead } from '@ifc-lite/create';
import { parseStep } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { elementFacts } from './mapped-joinery';
import { invalidateJoineryReads } from './element-spec';
import { layoutSchedule, type ScheduleLabels, type SchedulePrim } from './schedule-layout';
import { scheduleData } from './schedule-data';
import { configureElementType } from './type-config-actions';
import type { ElementFacts } from './symbol-mapping';

const MODEL = 'fzk';
const SCALE = 20;
const K = 1000 / SCALE;
const labels: ScheduleLabels = {
  locale: 'en', title: 'Joinery', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire',
  op: (op) => op,
};

async function openFzk(): Promise<void> {
  const store = await parseStep(new Uint8Array(readFileSync(new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url))));
  useViewerStore.setState({ models: new Map([[MODEL, { id: MODEL, name: MODEL, ifcDataStore: store, visible: true } as never]]) });
  invalidateJoineryReads();
}

/** A window of the type with most windows. */
function aWindow(): ElementFacts {
  const all = scheduleData('window').entries.flatMap((e) => e.occurrences)
    .map((o) => elementFacts(MODEL, o.expressId)).filter((f): f is ElementFacts => f !== null);
  const byType = new Map<string, ElementFacts[]>();
  for (const f of all) if (f.typeGlobalId) byType.set(f.typeGlobalId, [...(byType.get(f.typeGlobalId) ?? []), f]);
  const f = [...byType.values()].sort((a, b) => b.length - a.length)[0][0];
  assert.ok(f.width && f.height, 'the IFC gives the size');
  return f;
}

const DOUBLE = { operations: ['tilt-turn-left' as const, 'tilt-turn-right' as const], fanlight: false };

function configuredPrims(f: ElementFacts, extra: Parameters<typeof configureElementType>[2]): SchedulePrim[] {
  configureElementType(f, DOUBLE, extra);
  invalidateJoineryReads();
  const data = scheduleData('window');
  const entry = data.entries.find((e) => e.spec)!;
  return layoutSchedule({ ...data, entries: [entry] }, labels, { scale: SCALE }).prims;
}

type Path = Extract<SchedulePrim, { kind: 'path' }>;
const paths = (prims: SchedulePrim[]): Path[] => prims.filter((p): p is Path => p.kind === 'path');
const area = (p: Path): number => { const xs = p.pts.map((q) => q.x), ys = p.pts.map((q) => q.y); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };

/** The elevation outline: the biggest closed path of the cell other than the table's frame (which is a four-point rectangle wider than the card). */
function outline(prims: SchedulePrim[]): Path {
  const closed = paths(prims).filter((p) => p.closed && p.w === 0.25);
  return closed.sort((a, b) => area(b) - area(a))[0];
}

beforeEach(async () => { resetProject(); await openFzk(); });

describe('the head of a window type in the schedule\'s elevation', () => {
  const heads: { name: string; head: JoineryHead; springing: (w: number, h: number) => number }[] = [
    { name: 'round', head: { shape: 'round' }, springing: (w, h) => h - w / 2 },
    { name: 'segmental', head: { shape: 'segmental', rise: 0.25 }, springing: (_w, h) => h - 0.25 },
    { name: 'pointed', head: { shape: 'pointed', rise: 0.9 }, springing: (_w, h) => h - 0.9 },
  ];

  it('a square head is the rectangle it always was: four corners', () => {
    const f = aWindow();
    const o = outline(configuredPrims(f, { head: { shape: 'square' } }));
    assert.equal(o.pts.length, 4);
  });

  for (const { name, head, springing } of heads) {
    it(`${name}: the outline is an arch that stays inside the IFC's width and height, its crown at the top`, () => {
      const f = aWindow();
      const w = f.width!, h = f.height!;
      const o = outline(configuredPrims(f, { head }));
      assert.ok(o.pts.length > 12, 'an arc is drawn as many points');
      const xs = o.pts.map((p) => p.x), ys = o.pts.map((p) => p.y);
      const left = Math.min(...xs), right = Math.max(...xs), bottom = Math.max(...ys), top = Math.min(...ys);
      assert.ok(Math.abs(right - left - w * K) < 1e-6, 'the width is the IFC\'s');
      assert.ok(Math.abs(bottom - top - h * K) < 1e-6, 'the height is the IFC\'s: the crown is at the top, nothing above it');
      // The springing line: the highest point of the straight jambs. A point on the left jamb that is a corner of the outline.
      const jamb = o.pts.filter((p) => Math.abs(p.x - left) < 1e-6).map((p) => (bottom - p.y) / K);
      assert.ok(Math.abs(Math.max(...jamb) - springing(w, h)) < 1e-6, `the jamb rises to the springing line ${springing(w, h)}`);
      // The crown is in the middle.
      const crown = o.pts.find((p) => Math.abs(p.y - top) < 1e-6)!;
      assert.ok(Math.abs(crown.x - (left + right) / 2) < 1e-3);
    });
  }

  it('round is a semicircle: every point of the arch is half the width from the centre of the springing line', () => {
    const f = aWindow();
    const w = f.width!, h = f.height!;
    const o = outline(configuredPrims(f, { head: { shape: 'round' } }));
    const left = Math.min(...o.pts.map((p) => p.x)), bottom = Math.max(...o.pts.map((p) => p.y));
    const cx = left + (w * K) / 2, cy = bottom - (h - w / 2) * K;
    const arch = o.pts.filter((p) => bottom - p.y > (h - w / 2) * K + 1e-6);
    assert.ok(arch.length > 10);
    for (const p of arch) assert.ok(Math.abs(Math.hypot(p.x - cx, p.y - cy) - (w / 2) * K) < 1e-6);
  });

  it('pointed has a corner at the crown (two arcs); round is smooth there', () => {
    // A narrow opening, so that the default (equilateral) arch is clearly pointed.
    const f = { ...aWindow(), width: 0.6, height: 1.2 };
    const slopeAtCrown = (head: JoineryHead): number => {
      const o = outline(configuredPrims(f, { head }));
      const top = Math.min(...o.pts.map((p) => p.y));
      const at = o.pts.findIndex((p) => Math.abs(p.y - top) < 1e-6);
      const next = o.pts[at + 1];
      return Math.abs(next.y - o.pts[at].y) / Math.abs(next.x - o.pts[at].x);
    };
    assert.ok(slopeAtCrown({ shape: 'pointed' }) > 0.4, 'the two arcs meet at an angle');
    resetProject();
    assert.ok(slopeAtCrown({ shape: 'round' }) < 0.2, 'a semicircle is level at its crown');
  });

  it('the opening lines follow the arch: the tilt triangle of the left leaf has its apex on the frame\'s inner arch', () => {
    const f = aWindow();
    const w = f.width!, h = f.height!;
    const prims = configuredPrims(f, { head: { shape: 'round' } });
    const o = outline(prims);
    const left = Math.min(...o.pts.map((p) => p.x)), bottom = Math.max(...o.pts.map((p) => p.y));
    const frame = 0.06; // the kind's default frame (defaultWindowSpec)
    // Tilt triangles: three points with the base on the rail (first and last at the same height) and the apex above them.
    const tilt = paths(prims).filter((p) => !p.closed && p.pts.length === 3 && Math.abs(p.pts[0].y - p.pts[2].y) < 1e-6 && p.pts[1].y < p.pts[0].y);
    assert.equal(tilt.length, 2);
    for (const t of tilt) {
      const x = (t.pts[1].x - left) / K - w / 2, z = (bottom - t.pts[1].y) / K;
      const onArch = (h - w / 2) + Math.sqrt((w / 2 - frame) ** 2 - x * x);
      assert.ok(Math.abs(z - onArch) < 1e-6, `apex at ${z}, the inner arch is at ${onArch}`);
    }
  });

  it('the plan does not change with the head', () => {
    // The plan symbol reads the leaves, never the head: the same spec with and without a head gives the same plan strokes.
    const f = aWindow();
    configureElementType(f, DOUBLE, { head: { shape: 'round' } });
    const withHead = useProjectStore.getState().joineryTypes![0];
    const without = { ...withHead, head: undefined };
    return import('./symbols').then(({ planSymbol }) => assert.deepEqual(planSymbol(withHead), planSymbol(without)));
  });
});

describe('a property added by hand to a window type', () => {
  const custom = [
    { name: 'U', value: '1,1', key: 'thermalTransmittance' as const },
    { name: 'Frame material', value: 'Oak' },
  ];

  /** The value texts of the row labelled `label` in the cell. */
  function rowValue(prims: SchedulePrim[], label: string): string | undefined {
    const texts = prims.filter((p): p is Extract<SchedulePrim, { kind: 'text' }> => p.kind === 'text');
    const l = texts.find((t) => t.text === label && t.x === 2);
    return l ? texts.find((t) => t.y === l.y && t.x > 34)?.text : undefined;
  }

  it('the U value is the schedule\'s U row and a free-named property is a row of its own; the type has neither before', () => {
    const f = aWindow();
    configureElementType(f, DOUBLE);
    invalidateJoineryReads();
    const data0 = scheduleData('window');
    const before = layoutSchedule({ ...data0, entries: [data0.entries.find((e) => e.spec)!] }, labels, { scale: SCALE }).prims;
    assert.equal(rowValue(before, 'U'), '—');
    assert.equal(rowValue(before, 'Frame material'), undefined);
    const after = configuredPrims(f, { custom });
    assert.equal(rowValue(after, 'U'), '1.1', 'the U value of the type');
    assert.equal(rowValue(after, 'Frame material'), 'Oak');
  });

  it('a type without the property shows a dash in its row', () => {
    const f = aWindow();
    configureElementType(f, DOUBLE, { custom });
    invalidateJoineryReads();
    const data = scheduleData('window');
    assert.ok(data.entries.length >= 2, 'a configured type and others');
    const prims = layoutSchedule(data, labels, { scale: SCALE }).prims;
    const texts = prims.filter((p): p is Extract<SchedulePrim, { kind: 'text' }> => p.kind === 'text');
    const y = texts.find((t) => t.text === 'Frame material' && t.x === 2)!.y;
    const cells = texts.filter((t) => t.y === y && t.x > 34).map((t) => t.text).sort();
    assert.deepEqual(cells, ['Oak', ...data.entries.slice(1).map(() => '—')].sort());
  });

  it('is saved in the project and reopened, and read by the headless engine', () => {
    const f = aWindow();
    configureElementType(f, DOUBLE, { custom, head: { shape: 'segmental', rise: 0.3 } });
    const text = serializeProject(projectDocument());
    resetProject();
    assert.equal(useProjectStore.getState().joineryTypes?.length ?? 0, 0);
    loadProjectDocument(parseProjectFile(text));
    invalidateJoineryReads();
    const data = scheduleData('window');
    const entry = data.entries.find((e) => e.spec)!;
    assert.equal(thermalOf(entry.spec), 1.1);
    assert.deepEqual(entry.spec!.custom, custom);
    assert.deepEqual(entry.spec!.head, { shape: 'segmental', rise: 0.3 });
    const prims = layoutSchedule({ ...data, entries: [entry] }, labels, { scale: SCALE }).prims;
    assert.equal(rowValue(prims, 'Frame material'), 'Oak');
    // Headless: no app, no stores; the file and the model alone.
    const project = readProjectFile(text);
    const models = [...useViewerStore.getState().models].map(([modelId, m]) => ({ modelId, dataStore: m.ifcDataStore!, view: null }));
    const headless = joineryScheduleData(models, { joineryTypes: project.joineryTypes, joineryMapping: project.joineryMapping }, 'window').entries.find((e) => e.spec)!;
    assert.equal(thermalOf(headless.spec), 1.1);
    assert.equal(headless.spec!.custom?.find((p) => p.name === 'Frame material')?.value, 'Oak');
    assert.deepEqual(headless.spec!.head, { shape: 'segmental', rise: 0.3 });
  });

  it('is not written to the IFC: the model is untouched', () => {
    const f = aWindow();
    const before = useViewerStore.getState().mutationViews.size;
    configureElementType(f, DOUBLE, { custom });
    assert.equal(useViewerStore.getState().mutationViews.size, before);
  });
});
