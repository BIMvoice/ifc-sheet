/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Label presets (#828) over the real FZK-Haus: a group that filters IfcWall by a property value labels only the walls
 * with that value, every wall stays a target on the view (unmatched ones are drawn, just unlabelled), a rerun adds no
 * second label, and the preset survives an export and import through the library file.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { MutablePropertyView } from '@ifc-lite/mutations';
import { configureMutationView } from '@/utils/configureMutationView';
import { previewElements } from '@/tagfields/preview-elements.js';
import { labelDraft } from '@/labels/label-all.js';
import { labelElementByGlobalId as readEl } from '@/labels/label-element.js';
import { resetProject } from '@/project/project-store.js';
import { emptyCatalogue, parseCatalogue, serializeCatalogue } from '@/catalogue/catalogue-file.js';
import { planLabelPreset, readLabelPresets, type LabelPreset, type LabelTarget } from '@bimvoice/ifcsheet';
import type { AnnotationType } from '@/catalogue/types';
import type { DraftEntity } from '@/drafting/types';

const markType: AnnotationType = { id: 'at-mark', name: 'Wall mark', tool: 'label', label: { template: '{Name}', missing: 'question' } };
const at = { viewId: 'v', layerId: '0', textHeight: 0.25, textStyle: 'standard', dimStyle: 'standard', paperUnit: 0.1, locale: 'en' };
let walls: LabelTarget[] = [];
let pick: { set: string; name: string; value: string; matching: string[] };

const propsOf = (guid: string): Array<[string, string, string]> =>
  readEl(guid)!.propertySets().flatMap((s) => s.properties.map((p): [string, string, string] => [s.name, p.name, String(p.value ?? '')]));

beforeEach(async () => {
  resetProject();
  const store = await parseStep(readFileSync(resolve(process.cwd(), 'src/test/__fixtures__/AC20-FZK-Haus.ifc')));
  seedModel('fzk', 0, store, 1);
  const view = new MutablePropertyView(store.properties ?? null, 'fzk');
  configureMutationView(view, store);
  useViewerStore.setState({ mutationViews: new Map([['fzk', view]]) });
  walls = previewElements('wall').map((w, i) => ({ guid: w.guid, className: readEl(w.guid)!.className(), anchor: { x: i * 3, y: 0 }, renderId: i + 1, ring: [{ x: i * 3, y: 0 }, { x: i * 3 + 1, y: 0 }, { x: i * 3 + 1, y: 1 }] }));
  // A property value only some of the walls carry, read from the model.
  const counts = new Map<string, string[]>();
  for (const w of walls) for (const [s, n, v] of propsOf(w.guid)) if (v) counts.set(`${s}\u0000${n}\u0000${v}`, [...(counts.get(`${s}\u0000${n}\u0000${v}`) ?? []), w.guid]);
  const [key, matching] = [...counts].find(([, g]) => g.length > 0 && g.length < walls.length) ?? ['', []];
  const [set = '', name = '', value = ''] = key.split('\u0000');
  pick = { set, name, value, matching };
});
afterEach(() => cleanup());

const preset = (): LabelPreset => ({ id: 'lp', name: 'Some walls', groups: [{ labelType: 'wall mark', filters: [{ by: 'class', value: 'IfcWall' }, { by: 'property', set: pick.set, name: pick.name, value: pick.value }] }] });

const run = (p: LabelPreset, drafts: readonly DraftEntity[]): DraftEntity[] =>
  planLabelPreset(p, walls, [markType], drafts, (g) => readEl(g)).flatMap(({ type, targets }) => targets.flatMap((t) => (type ? labelDraft(type, t.guid, t.anchor, at, t.ring) ?? [] : [])));

describe('label presets on FZK-Haus (#828)', () => {
  it('the model has walls that a property tells apart', () => {
    assert.ok(walls.length > 1, 'FZK has several walls');
    assert.ok(pick.matching.length > 0 && pick.matching.length < walls.length, 'some walls carry the value, some do not');
  });
  it('labels only the walls the property filter matches; the others stay targets, unlabelled', () => {
    const drafts = run(preset(), []);
    assert.deepEqual(drafts.map((d) => String(d.params.labelOf)).sort(), [...pick.matching].sort());
    assert.ok(drafts.length < walls.length, 'unmatched walls get no label');
    assert.equal(walls.length, previewElements('wall').length, 'every wall is still on the view');
  });
  it('a second run adds no second label of the type', () => {
    const first = run(preset(), []);
    assert.equal(run(preset(), first).length, 0);
  });
  it('keeps the preset through a library export and import', () => {
    const p = preset();
    const text = serializeCatalogue({ ...emptyCatalogue(), annotationTypes: [markType], labelPresets: [p] }, 'presets');
    const back = parseCatalogue(text).catalogue.labelPresets;
    assert.deepEqual(back, [p]);
    assert.deepEqual(run(back[0], []).map((d) => String(d.params.labelOf)).sort(), [...pick.matching].sort(), 'the imported preset labels the same walls');
  });
  it('drops a group with no condition instead of labelling every wall', () => {
    assert.deepEqual(readLabelPresets([{ id: 'x', name: 'x', groups: [{ labelType: 'Wall mark', filters: [] }] }]), []);
  });
});
