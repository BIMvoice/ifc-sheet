/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The ByggesaksBIM (Norway) readiness check in the app (#372). On FZK (a German model with no Norwegian data) it lists
 * exactly what IfcTester failed in the README of the IDS (the matrikkel number, BTA and BRA); on the README's compliant
 * model it lists nothing; a project that has not opted in runs nothing (spied); what it says is what `ifcsheet check
 * --ids byggesaksbim` prints, compared with the built command line itself; and the opt-in survives save and reopen.
 */
import '@/test/setup-dom.js';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeReadiness } from '@bimvoice/ifcsheet';
import { syntheticByggesaksbimModel } from '@bimvoice/ifcsheet/byggesaksbim';
import { byggesaksbimReadiness } from '@bimvoice/ifcsheet/headless';
import { cleanup, click, render, waitFor } from '@/test/render.js';
import { parseStep } from '@/test/properties-panel-harness.js';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { registerLocale, setLocale } from '@/i18n/registry';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { setByggesaksbim } from '@/project/byggesaksbim-setting';
import { useViewerStore } from '@/store';
import { ReadinessList } from '@/components/viewer/sheets/ReadinessList';
import { BYGGESAKSBIM_DEBOUNCE_MS, forgetByggesaksbimRun } from '@/components/viewer/sheets/useByggesaksbim';
import type { SetSkin } from '@/components/viewer/sheets/set-skin';
import { runByggesaksbim, runByggesaksbimOrError } from './byggesaksbim';
import { describeMissing } from './readiness-say';

const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);
const BIN = fileURLToPath(new URL('../../../../packages/ifcsheet/dist/bin.js', import.meta.url));
const skin = { note: 'note', heading: 'heading' } as unknown as SetSkin;
type Store = Awaited<ReturnType<typeof parseStep>>;

const show = (stores: Record<string, Store>) => useViewerStore.setState({ models: new Map(Object.entries(stores).map(([id, ifcDataStore]) => [id, { ifcDataStore, name: id }])) } as never);
const parse = (step: string) => parseStep(step);

let fzk: Store;
beforeEach(async () => {
  resetProject();
  forgetByggesaksbimRun();
  setLocale('en');
  fzk ??= await parseStep(new Uint8Array(readFileSync(FZK)));
});
afterEach(() => {
  cleanup();
  setLocale('en');
  useViewerStore.setState({ models: new Map() } as never);
});

describe('FZK, a German model with no Norwegian data', () => {
  it('fails exactly the matrikkel number and the two storey areas', async () => {
    show({ m: fzk });
    const findings = await runByggesaksbim();
    assert.deepEqual(findings.map((f) => [f.kind, f.params.count, f.params.total]), [['byggesaksbimH1', 1, 1], ['byggesaksbimH4', 2, 2], ['byggesaksbimH5', 2, 2]]);
    assert.ok(findings.every((f) => (f.guids?.length ?? 0) > 0), 'each names elements to select');
  });

  it('says what the engine says, and what the built command line prints', async () => {
    show({ m: fzk });
    const app = await runByggesaksbim();
    const engine = await byggesaksbimReadiness([{ dataStore: fzk }]);
    assert.deepEqual(app.map((f) => [f.kind, f.params, f.guids, describeMissing(f)]), engine.map((f) => [f.kind, f.params, f.guids, describeReadiness(f).missing]));

    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-parity-'));
    try {
      const run = spawnSync(process.execPath, [BIN, 'check', fileURLToPath(FZK), '--ids', 'byggesaksbim', '--json'], { encoding: 'utf8', cwd: dir });
      const cli = (JSON.parse(run.stdout.slice(run.stdout.indexOf('{\n'))) as { findings: { kind: string; missing: string; effect: string; params: unknown }[] }).findings.filter((f) => f.kind.startsWith('byggesaksbim'));
      assert.equal(cli.length, 3, run.stderr);
      assert.deepEqual(app.map((f) => ({ kind: f.kind, missing: describeMissing(f), params: f.params })), cli.map((f) => ({ kind: f.kind, missing: f.missing, params: f.params })));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the README\'s compliant model', () => {
  it('lists nothing, and lists exactly the one requirement that is taken away', async () => {
    show({ m: await parse(syntheticByggesaksbimModel()) });
    assert.deepEqual(await runByggesaksbim(), []);
    show({ m: await parse(syntheticByggesaksbimModel({ without: ['bta'] })) });
    assert.deepEqual((await runByggesaksbim()).map((f) => f.kind), ['byggesaksbimH4']);
  });

  it('checks only the bruksenhet zones: a fire zone is out of scope, a bruksenhet zone without BRA fails', async () => {
    show({ m: await parse(syntheticByggesaksbimModel({ fireZone: true })) });
    assert.deepEqual(await runByggesaksbim(), []);
    show({ m: await parse(syntheticByggesaksbimModel({ fireZone: true, without: ['zoneBra'] })) });
    assert.deepEqual((await runByggesaksbim()).map((f) => [f.kind, f.params.count, f.params.total]), [['byggesaksbimH6', 1, 1]]);
  });

  it('refuses an IFC2X3 model with one finding and checks nothing else', async () => {
    show({ m: await parse(syntheticByggesaksbimModel({ schema: 'IFC2X3', without: ['bra'] })) });
    const found = await runByggesaksbim();
    assert.deepEqual(found.map((f) => f.kind), ['byggesaksbimSchema']);
    assert.equal(describeMissing(found[0]), 'ByggesaksBIM requires IFC4; this model is IFC2X3 and was not checked.');
  });

  it('counts a requirement met by another model: a storey area given in one model and the site in the other', async () => {
    // Discipline models of one building: the architect's model has everything, the structure model has a bare storey.
    const bare = await parse(syntheticByggesaksbimModel({ without: ['bta', 'bra'] }));
    show({ arch: await parse(syntheticByggesaksbimModel()), structure: bare });
    assert.deepEqual((await runByggesaksbim()).map((f) => [f.kind, f.params.count, f.params.total]), [['byggesaksbimH4', 1, 2], ['byggesaksbimH5', 1, 2]]);
  });
});

describe('the readiness list', () => {
  const text = (el: HTMLElement) => el.textContent ?? '';
  const started = () => { let calls = 0; const real = useViewerStore.getState().getMutationView; useViewerStore.setState({ getMutationView: ((id: string) => { calls++; return real(id); }) as never }); return () => calls; };

  it('runs nothing for a project that has not opted in, and nothing is said about Norway', async () => {
    show({ m: await parse(syntheticByggesaksbimModel({ without: ['bra'] })) });
    const calls = started();
    const page = render(<ReadinessList skin={skin} />);
    await waitFor(() => /The model has no|What the model lacks|rooms/.test(text(page)), 'the readiness list is drawn');
    await new Promise((r) => setTimeout(r, BYGGESAKSBIM_DEBOUNCE_MS * 3));
    assert.equal(calls(), 0, 'the IDS was not started');
    assert.doesNotMatch(text(page), /BRA \(usable area/);
  });

  it('shows the failures once the project opts in, selects the element on click, and follows the model', async () => {
    show({ m: await parse(syntheticByggesaksbimModel({ without: ['bra'] })) });
    const calls = started();
    const page = render(<ReadinessList skin={skin} />);
    setByggesaksbim(true);
    await waitFor(() => /BRA \(usable area, Pset_BuildingStoreyCommon\.NetPlannedArea\) missing on 1 of 1 storeys: '1'\./.test(text(page)), 'the BRA finding appears');
    assert.ok(calls() > 0, 'the IDS was started (the spy sees it)');

    const select = [...page.querySelectorAll('button')].find((b) => b.textContent === 'Select the first one');
    assert.ok(select, 'the finding offers to select its element');
    click(select);
    const picked = useViewerStore.getState().selectedEntity;
    assert.equal(picked?.modelId, 'm');
    assert.equal(useViewerStore.getState().models.get('m')?.ifcDataStore?.entities.getGlobalId(picked?.expressId ?? 0), '18YevMn_nCqegZ5pOkFRtT');

    // The model changes (another is opened in its place): the list follows, without a reload.
    show({ m: await parse(syntheticByggesaksbimModel()) });
    await waitFor(() => !/BRA \(usable area/.test(text(page)), 'the finding goes when the model is complete');

    // Opting out again lists nothing and runs nothing.
    show({ m: await parse(syntheticByggesaksbimModel({ without: ['bya'] })) });
    await waitFor(() => /BYA \(built-up area/.test(text(page)), 'a new finding appears');
    const before = calls();
    setByggesaksbim(false);
    await waitFor(() => !/BYA \(built-up area/.test(text(page)), 'the findings go when the project opts out');
    show({ m: await parse(syntheticByggesaksbimModel({ without: ['bta'] })) });
    await new Promise((r) => setTimeout(r, BYGGESAKSBIM_DEBOUNCE_MS * 3));
    assert.equal(calls(), before, 'an opted-out project starts nothing');
  });

  it('shows "could not run" instead of an empty list when the check throws', async () => {
    show({ m: await parse(syntheticByggesaksbimModel()) });
    const real = useViewerStore.getState().getMutationView;
    useViewerStore.setState({ getMutationView: (() => { throw new Error('worker died'); }) as never });
    try {
      assert.deepEqual((await runByggesaksbimOrError()).map((f) => f.kind), ['byggesaksbimError']);
      const page = render(<ReadinessList skin={skin} />);
      setByggesaksbim(true);
      await waitFor(() => /The ByggesaksBIM check could not run: worker died/.test(text(page)), `the failure is listed: ${text(page)}`);
    } finally {
      useViewerStore.setState({ getMutationView: real });
    }
  });

  it('says it in Romanian', async () => {
    registerLocale('ro', checkCatalogue(ro).catalogue);
    setLocale('ro');
    show({ m: await parse(syntheticByggesaksbimModel({ without: ['bra'] })) });
    const page = render(<ReadinessList skin={skin} />);
    setByggesaksbim(true);
    await waitFor(() => /BRA \(suprafața utilă, Pset_BuildingStoreyCommon\.NetPlannedArea\) lipsește la 1 din 1 niveluri/.test(text(page)), `the Romanian finding appears: ${text(page)}`);
  });
});

describe('the opt-in is the project\'s', () => {
  it('is written only when on, and is on again after save and reopen', () => {
    assert.equal('byggesaksbim' in JSON.parse(serializeProject(projectDocument())), false, 'off is not written');
    setByggesaksbim(true);
    assert.equal(useProjectStore.getState().dirty, true);
    const file = serializeProject(projectDocument());
    assert.equal(JSON.parse(file).byggesaksbim, true);
    resetProject();
    assert.equal(useProjectStore.getState().byggesaksbim, undefined);
    loadProjectDocument(parseProjectFile(file));
    assert.equal(useProjectStore.getState().byggesaksbim, true);
    setByggesaksbim(false);
    assert.equal('byggesaksbim' in JSON.parse(serializeProject(projectDocument())), false);
  });
});
