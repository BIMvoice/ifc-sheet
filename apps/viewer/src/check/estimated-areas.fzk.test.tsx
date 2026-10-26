/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #42: Au counts rooms whose area is measured from geometry; that is reported, not counted silently. AC20-FZK-Haus with the
 * attic gallery's two area quantities renamed (nothing states its area; its body is 107.16 m² against the 74.51 m² the
 * model states): the readiness finding, the urban sheet's note and "Go to" name it, the figure and the room are the same
 * ones the command line reports (`estimated-areas.test` in the engine), and a model that states every area reports nothing.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { readinessOfModel } from '@bimvoice/ifcsheet/headless';
import { cleanup, render } from '@/test/render.js';
import { registerLocale, setLocale } from '@/i18n';
import ro from '@/i18n/locales/ro';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { loadUrbanModel, urbanWasm } from '@/test/urban-fixture';
import { collectRoomRecords, collectUrbanAreas } from '@/urban/urban-models';
import { urbanIndicators } from '@/urban/indicators';
import { useUrbanLabels } from '@/components/viewer/urban/useUrban';
import { useFocusRequest } from './focus';
import { goToRoom } from './room-go';
import { modelReadiness } from './readiness';
import { currentModelFacts } from './readiness-read';
import { describeMissing } from './readiness-say';
import type { PlanProjectView } from '@/project/types';

const FZK = resolve(import.meta.dirname, '../../src/test/__fixtures__/AC20-FZK-Haus.ifc');
const whole = () => new Uint8Array(readFileSync(FZK));
/** The gallery's quantities (#76387..#76399) lose their area names: nothing states its area. */
const withoutGalleryArea = () => new TextEncoder().encode(readFileSync(FZK, 'latin1').replace(/^(#763(?:8[7-9]|9\d)=\s*IFCQUANTITYAREA\(')((?:Net|Gross)FloorArea)'/gm, "$1X$2'"));
const finding = () => modelReadiness(currentModelFacts()).find((f) => f.kind === 'estimatedAreas');

function Rules() {
  const areas = collectUrbanAreas();
  const labels = useUrbanLabels('T', areas);
  return <pre data-rules>{labels.rules(urbanIndicators({ ...areas, siteArea: 600 })).join('\n')}</pre>;
}

describe('rooms measured from geometry are reported (#42)', () => {
  beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map(), mutationViews: new Map() }); });
  afterEach(() => { cleanup(); act(() => setLocale('en')); });

  it('names the gallery, its area and its share of Au', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', withoutGalleryArea());
    const f = finding();
    assert.ok(f, 'a finding');
    // 107.16 of 98.83 + 107.16 = 205.99 m².
    assert.deepEqual({ ...f.params, area: Math.round(Number(f.params.area)) }, { count: 1, area: 107, share: 52, list: "'7 Galerie'", first: f.params.first });
    assert.equal(describeMissing(f), "Au includes 1 rooms whose area the model doesn't state; they are measured from geometry (≈ 107.2 m², 52 % of Au) and may be wrong under sloped ceilings: '7 Galerie'.");
    // The value of Au is what it was: the estimate still counts.
    const au = urbanIndicators({ ...collectUrbanAreas(), siteArea: 600 }).au!;
    assert.ok(Math.abs(au - 205.99) < 0.05, `${au}`);
  });

  it('is the finding the command line reports for the same parsed model', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', withoutGalleryArea());
    const model = [...useViewerStore.getState().models.values()][0];
    const engine = readinessOfModel({ dataStore: model.ifcDataStore!, storeys: [1, 2], meshes: model.geometryResult?.meshes ?? [] }).find((f) => f.kind === 'estimatedAreas');
    assert.deepEqual(finding(), engine);
  });

  it('is absent when every room states its area', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', whole());
    assert.equal(finding(), undefined);
    assert.equal(collectUrbanAreas().estimated, null);
  });

  it('is written in Romanian with the decimal comma, on the finding and on the urban sheet', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', withoutGalleryArea());
    registerLocale('ro', checkCatalogue(ro).catalogue);
    act(() => setLocale('ro'));
    const f = finding()!;
    assert.match(describeMissing(f), /^Au include 1 încăperi a căror arie nu este dată de model; sunt măsurate din geometrie \(≈ 107,2 m², 52 % din Au\)/);
    const text = render(<Rules />).querySelector('[data-rules]')?.textContent ?? '';
    assert.match(text, /Au include 1 încăperi a căror arie nu este dată de model: sunt măsurate din geometrie \(≈ 107,2 m², 52 % din Au\)[^\n]*: Galerie\./, text);
  });

  it('the urban sheet says so in English too, and only when there is something to say', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', withoutGalleryArea());
    assert.match(render(<Rules />).querySelector('[data-rules]')?.textContent ?? '', /Au includes 1 rooms whose area the model does not state: they are measured from their geometry \(≈ 107\.2 m², 52 % of Au\) and may be wrong under sloped ceilings: Galerie\./);
    cleanup();
    await loadUrbanModel('fzk', whole());
    assert.doesNotMatch(render(<Rules />).querySelector('[data-rules]')?.textContent ?? '', /geometry/);
  });

  it('"Go to" opens the plan of the first room\'s level and zooms to the room', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', withoutGalleryArea());
    const { levels } = useProjectStore.getState();
    const gallery = collectRoomRecords(levels).rooms.find((r) => r.name === 'Galerie')!;
    const plan = (id: string, level: (typeof levels)[number]): PlanProjectView => ({ id, kind: 'plan', name: id, createdAt: 0, scale: 100, level, cutHeight: 1.2 });
    const [ground, attic] = [...levels].sort((a, b) => a.elevation - b.elevation);
    useProjectStore.setState({ views: [plan('p-ground', ground), plan('p-attic', attic)] });
    assert.equal(goToRoom(String(finding()!.params.first)), true);
    assert.equal(gallery.id, finding()!.params.first);
    assert.deepEqual([useFocusRequest.getState().request?.viewId, useFocusRequest.getState().request?.guids], ['p-attic', [gallery.id]]);
    assert.equal(goToRoom('no-such-room'), false);
  });
});
