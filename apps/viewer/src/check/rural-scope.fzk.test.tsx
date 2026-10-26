/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, describeReadiness } from '@bimvoice/ifcsheet';
import { openModel, readProjectFile, readinessWithProject } from '@bimvoice/ifcsheet/headless';
import { cleanup, render, waitFor } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { projectDocument, resetProject, setPacMode, useProjectStore } from '@/project/project-store';
import { serializeProject } from '@/project/project-file';
import { loadUrbanModel, urbanWasm } from '@/test/urban-fixture';
import { collectUrbanAreas } from '@/urban/urban-models';
import { urbanIndicators } from '@/urban/indicators';
import { setLocale } from '@/i18n/registry';
import { pacSection } from '@/components/viewer/wall/drawer-sections/pac';
import { ReadinessList } from '@/components/viewer/sheets/ReadinessList';
import { WALL_SKIN } from '@/components/viewer/sheets/set-skin';
import { ruralScopeFindings } from './rural-scope';

/**
 * AC20-FZK-Haus against Anexa 3: two storeys above ground (Erdgeschoss at 0, Dachgeschoss at 2.7), so P + M holds; each storey's
 * built area is 120.00 m² (`urban/urban-fzk.test.ts`), so Sd is 240.00 m², over the 150 m² the simplified PAC covers.
 */

const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);
const RURAL = ['ruralLevels', 'ruralArea', 'ruralAreaAtLeast'];
const AREA = 'The model\'s built gross area (Sd) is 240.0 m²; the simplified PAC (Anexa 3) covers at most 150 m².';

beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map(), mutationViews: new Map() }); });
afterEach(() => { cleanup(); act(() => setLocale('en')); });

describe('the FZK house against the simplified PAC', () => {
  it('has two levels (no levels finding) and Sd 240 m² (the area finding), shown in the drawer in the rural mode only', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const result = urbanIndicators({ ...collectUrbanAreas(), siteArea: 600 });
    assert.equal(result.storeys.filter((s) => s.elevation >= 0).length, 2);
    assert.deepEqual(ruralScopeFindings(result).map((f) => f.kind), ['ruralArea']);

    const Section = pacSection.component;
    const ui = render(<Section go={() => undefined} onClose={() => undefined} extent={null} />);
    assert.equal(ui.querySelector('[data-pac-scope]'), null, 'the standard PAC has no such limit');
    act(() => { ui.querySelector<HTMLButtonElement>('[data-pac-mode="rural"]')!.click(); });
    assert.equal(ui.querySelector('[data-pac-scope]')?.textContent, AREA);
    act(() => { ui.querySelector<HTMLButtonElement>('[data-pac-mode="standard"]')!.click(); });
    assert.equal(ui.querySelector('[data-pac-scope]'), null);
  });

  it('is in the readiness list for a project in the rural mode, and follows the mode and the model without a refresh', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const ui = render(<ReadinessList skin={WALL_SKIN} />);
    const text = () => ui.textContent ?? '';
    assert.doesNotMatch(text(), /simplified PAC/, 'the full permit project has no such limit');
    act(() => setPacMode('rural'));
    await waitFor(() => text().includes(AREA), 'the area finding appears when the mode is set');
    assert.doesNotMatch(text(), /levels above ground/, 'two levels are inside P + M');
    // The model changes: the top level is gone (the project's levels follow the model's storeys), and Sd falls to one storey's 120 m².
    const levels = useProjectStore.getState().levels;
    assert.equal(levels.length, 2);
    act(() => { useProjectStore.setState({ levels: [levels[1]!] }); });
    await waitFor(() => !text().includes('simplified PAC'), 'the area finding is gone when the model has one storey');
    act(() => { useProjectStore.setState({ levels: [] }); });
    act(() => { useProjectStore.setState({ levels }); });
    await waitFor(() => text().includes(AREA), 'and comes back with the storey');
    act(() => setPacMode('full'));
    await waitFor(() => !text().includes('simplified PAC'), 'and goes with the mode');
  });

  it('is what `ifcsheet check --project` reports for the same model and the same project file', async (t) => {
    if (!urbanWasm(t)) return;
    const bytes = new Uint8Array(readFileSync(FZK));
    await loadUrbanModel('fzk', bytes);
    const ui = render(<ReadinessList skin={WALL_SKIN} compact />);
    act(() => setPacMode('rural'));
    await waitFor(() => (ui.textContent ?? '').includes(AREA), 'the app lists the finding');
    // The project file the app saves is what the command line reads.
    const file = serializeProject(projectDocument());
    assert.equal(JSON.parse(file).format, PROJECT_FILE_FORMAT);
    assert.ok(JSON.parse(file).version <= PROJECT_FILE_VERSION);
    const project = readProjectFile(file);
    assert.equal(project.pacMode, 'rural');
    const engine = readinessWithProject(await openModel(bytes), project).filter((f) => RURAL.includes(f.kind));
    assert.deepEqual(engine.map((f) => [f.kind, f.params, describeReadiness(f).missing]), [['ruralArea', { area: 240, max: 150 }, 'The model\'s built gross area (Sd) is 240 m²; the simplified PAC (Anexa 3) covers at most 150 m².']]);
    // The same figures as the app's own indicators give them.
    const app = ruralScopeFindings(urbanIndicators({ ...collectUrbanAreas(), siteArea: null, settings: useProjectStore.getState().urbanSettings }));
    assert.deepEqual(engine.map((f) => [f.kind, f.params]), app.map((f) => [f.kind, f.params]));
    // A full project is not measured at all.
    assert.deepEqual(readinessWithProject(await openModel(bytes), readProjectFile(file.replace('"rural"', '"full"'))).filter((f) => RURAL.includes(f.kind)), []);
  });
});
