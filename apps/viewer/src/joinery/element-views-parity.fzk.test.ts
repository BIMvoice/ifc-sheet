/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The headless engine cuts and lays out the element views of the joinery schedule's cards as the app does (#581, PR 7). AC20-FZK-Haus is
 * loaded into the app's stores and geometry (`entryViews` over `loadedScheduleModels`, the project store's types) and opened by the engine
 * (`entryViews` over `scheduleModelsOf(openModel)`, the project's facts). Per type, both sides' views are laid out by `viewPrims` and
 * compared primitive by primitive. Both sides share the layout code, so a case also states what its kind must draw (a comparison that
 * holds for an empty or a plain drawing is no comparison): each kind of type has a case that first asserts the rows hold it.
 */

import '@/test/setup-dom.js';
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { JoineryGlazingBars, JoineryHead, JoineryBlockSymbol } from '@ifc-lite/create';
import { joineryScheduleData, planFrame, planRoom, readDxfBlock, scheduleModelsOf, viewPrims, entryViews as engineEntryViews, type ElementViews, type ScheduleEntry } from '@bimvoice/ifcsheet/project';
import { openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { resetProject, useProjectStore } from '@/project/project-store';
import { configureElementType, setTypePlanBlock } from './type-config-actions';
import { elementFacts } from './mapped-joinery';
import { invalidateJoineryReads } from './element-spec';
import { scheduleData } from './schedule-data';
import { entryViews as appEntryViews } from './element-views-source';
import type { ElementFacts } from './symbol-mapping';

const MODEL = 'm';
const K = 20;
const DXF = readFileSync(new URL('../../../../packages/ifcsheet/src/__fixtures__/door-window-blocks.dxf', import.meta.url), 'utf8');
const BLOCK: JoineryBlockSymbol = readDxfBlock(DXF, 'DOOR90').symbol!;

interface Side { entries: ScheduleEntry[]; views: Map<string, ElementViews>; prims: Map<string, unknown> }

/** A primitive as compared: every shape, to a micrometre. */
const rounded = (x: unknown) => JSON.parse(JSON.stringify(x, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)));

describe('the engine cuts and lays out the element views of AC20-FZK-Haus as the app does', { skip: planModelMissing(FZK_HAUS) }, () => {
  let engine: OpenedModel;

  before(async () => {
    await loadPlanModel(FZK_HAUS);
    engine = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
  });
  beforeEach(() => { resetProject(); invalidateJoineryReads(); });

  const primsOf = (entries: ScheduleEntry[], views: Map<string, ElementViews>) =>
    new Map(entries.flatMap((e) => { const v = views.get(e.key); return v ? [[e.key, rounded({ prims: viewPrims(v, e.spec, { fx: 0, base: 0 }, K, 'handle'), room: planRoom(v, K, e.spec) })] as const] : []; }));

  async function app(kind: 'door' | 'window'): Promise<Side> {
    const data = scheduleData(kind);
    const views = await appEntryViews(data, 50);
    return { entries: data.entries, views, prims: primsOf(data.entries, views) };
  }
  async function eng(kind: 'door' | 'window'): Promise<Side> {
    const { joineryTypes, joineryMapping, symbolFlips, openingLines } = useProjectStore.getState();
    const models = scheduleModelsOf(engine, '', MODEL);
    const data = joineryScheduleData(models, { joineryTypes: joineryTypes ?? [], joineryMapping: joineryMapping!, symbolFlips, openingLines }, kind);
    const b = engine.coordinateInfo!.shiftedBounds;
    const views = await engineEntryViews(data.entries, 50, models, { awayFrom: () => ({ x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2 }) });
    return { entries: data.entries, views, prims: primsOf(data.entries, views) };
  }

  /** Both sides' views of the kind, equal per type; the engine's side. */
  async function compare(kind: 'door' | 'window'): Promise<Side> {
    const [a, e] = [await app(kind), await eng(kind)];
    assert.ok(e.entries.length >= 1, `the ${kind} schedule has rows`);
    assert.deepEqual(e.entries.map((x) => x.key), a.entries.map((x) => x.key), `${kind}: the same types`);
    assert.ok(e.views.size >= 1, `${kind}: at least one type has views`);
    assert.deepEqual([...e.views.keys()].sort(), [...a.views.keys()].sort(), `${kind}: the same types have views`);
    for (const key of e.views.keys()) {
      assert.deepEqual(e.prims.get(key), a.prims.get(key), `${kind} ${key}: primitives, engine vs app`);
      const [ev, av] = [e.views.get(key)!, a.views.get(key)!];
      assert.equal(ev.front.lines.length, av.front.lines.length);
      assert.ok(ev.front.lines.length > 0 && ev.plan.lines.length > 0 && ev.section.lines.length > 0, 'each view has lines');
    }
    return e;
  }
  const primsInView = (s: Side, key: string, view: string) => (s.prims.get(key) as { prims: { view?: string }[] }).prims.filter((p) => p.view === view);
  const symbolCount = (s: Side) => [...s.prims.keys()].reduce((n, k) => n + primsInView(s, k, 'symbol').length, 0);

  const factsOf = (kind: 'door' | 'window'): ElementFacts[] =>
    scheduleData(kind).entries.flatMap((e) => e.occurrences).map((o) => elementFacts(MODEL, o.expressId)).filter((f): f is ElementFacts => f !== null);
  /** Configures the type of every element of the kind (each type once). */
  function configure(kind: 'door' | 'window', operations: ('swing-left' | 'swing-right' | 'tilt-turn-left' | 'tilt-turn-right')[], opening: { fanlight?: boolean; bars?: JoineryGlazingBars } = {}, extra: { head?: JoineryHead } = {}): ElementFacts[] {
    const seen = new Map<string, ElementFacts>();
    for (const f of factsOf(kind)) {
      if (!f.typeGlobalId || seen.has(f.typeGlobalId)) continue;
      seen.set(f.typeGlobalId, f);
      configureElementType(f, { operations, fanlight: opening.fanlight ?? false, ...(opening.bars ? { bars: opening.bars } : {}) }, extra);
    }
    assert.ok(seen.size >= 1, `the ${kind}s have types to configure`);
    invalidateJoineryReads();
    return [...seen.values()];
  }

  it('types without a configuration: the views cut from the model, the same on both sides', async () => {
    const doors = await compare('door'), windows = await compare('window');
    assert.ok(doors.entries.every((e) => !e.spec) && windows.entries.every((e) => !e.spec), 'no type is configured');
    assert.equal(symbolCount(windows), 0, 'an unconfigured type has no opening marks');
  });

  it('a configured window type carries its opening marks over the front view', async () => {
    const plain = await compare('window');
    configure('window', ['tilt-turn-left', 'tilt-turn-right']);
    const configured = await compare('window');
    assert.ok(configured.entries.some((e) => e.spec), 'a type is configured');
    assert.equal(symbolCount(plain), 0);
    assert.ok(symbolCount(configured) >= configured.views.size, 'each configured type has marks');
  });

  it('a fanlight row adds the marks of its panes to the front view', async () => {
    configure('window', ['tilt-turn-left', 'tilt-turn-right']);
    const plain = await compare('window');
    configure('window', ['tilt-turn-left', 'tilt-turn-right'], { fanlight: true });
    const fanlit = await compare('window');
    assert.equal(fanlit.views.size, plain.views.size);
    assert.ok(symbolCount(fanlit) > symbolCount(plain), 'the transom row adds marks');
  });

  /** The primitives the views carry, by type: what a type's own geometry changes of them is what a case compares. */
  const drawn = (s: Side) => new Map([...s.prims].map(([k, v]) => [k, (v as { prims: unknown }).prims] as const));

  it('glazing bars belong to the generated symbol: the views stay the model\'s cut (#582)', async () => {
    configure('window', ['tilt-turn-left', 'tilt-turn-right']);
    const plain = await compare('window');
    configure('window', ['tilt-turn-left', 'tilt-turn-right'], { bars: { horizontal: 2, vertical: 1 } });
    const barred = await compare('window');
    assert.ok(barred.entries.length >= 1 && barred.entries.every((e) => e.spec?.glazingBars), 'the types carry bars');
    assert.ok(symbolCount(barred) > 0, 'the views carry their marks');
    assert.deepEqual(drawn(barred), drawn(plain), 'the bars add nothing to what is cut from the model');
  });

  it('an arched head belongs to the generated symbol: the views stay the model\'s cut (#572)', async () => {
    configure('window', ['tilt-turn-left', 'tilt-turn-right']);
    const plain = await compare('window');
    configure('window', ['tilt-turn-left', 'tilt-turn-right'], {}, { head: { shape: 'round' } });
    const arched = await compare('window');
    assert.ok(arched.entries.length >= 1 && arched.entries.every((e) => e.spec?.head?.shape === 'round'), 'every window type has an arched head');
    assert.ok(symbolCount(arched) > 0, 'the views carry their marks');
    assert.deepEqual(drawn(arched), drawn(plain), 'the arch adds nothing to what is cut from the model');
  });

  it('a DXF block is the plan of a door type, and the card reserves its scaled, mirrored extent with the swing (#448, #584)', async () => {
    const left = configure('door', ['swing-left']);
    const plain = await compare('door');
    for (const f of left) setTypePlanBlock(f, BLOCK);
    invalidateJoineryReads();
    const blocked = await compare('door');
    assert.ok(blocked.entries.some((e) => e.spec?.planBlock), 'a type has the block');
    for (const e of blocked.entries) {
      const v = blocked.views.get(e.key);
      if (!v || !e.spec?.planBlock) continue;
      const room = planRoom(v, K, e.spec);
      assert.ok(room > planRoom(v, K) + 10, 'the swing needs more than the model\'s frame depth');
      const ys = primsInView(blocked, e.key, 'plan').flatMap((p) => ((p as { pts?: { y: number }[] }).pts ?? []).map((q) => q.y));
      assert.ok(ys.length > 0 && Math.max(...ys) <= planFrame(v, e.spec, K).room + 1e-6, 'nothing drawn below the room reserved');
      assert.notDeepEqual(primsInView(blocked, e.key, 'plan'), primsInView(plain, e.key, 'plan'), 'the block replaces the plan cut from the model');
    }
  });

  it('a right-hand door mirrors its block: the leaf stands at the other jamb', async () => {
    const xsOf = async (op: 'swing-left' | 'swing-right') => {
      resetProject(); invalidateJoineryReads();
      for (const f of configure('door', [op])) setTypePlanBlock(f, BLOCK);
      invalidateJoineryReads();
      const s = await compare('door');
      const key = [...s.views.keys()].find((k) => s.entries.find((e) => e.key === k)?.spec?.planBlock)!;
      const strokes = primsInView(s, key, 'plan') as { pts: { x: number }[]; w: number }[];
      // The heaviest pen is the leaf (the swing arc is thin): its middle against the opening's middle, x 0.
      const leaf = strokes.filter((p) => p.w === 0.35).flatMap((p) => p.pts.map((q) => q.x));
      return (Math.min(...leaf) + Math.max(...leaf)) / 2;
    };
    const [l, r] = [await xsOf('swing-left'), await xsOf('swing-right')];
    assert.ok(l < 0 && r > 0, `left-hand leaf at -x (${l}), right-hand at +x (${r})`);
  });
});
