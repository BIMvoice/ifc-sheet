/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The sheets a change in the model reaches, in the list of what changed since the last issue (#335): issue, load a new
 * version of the model with one door moved and no edit to the project, issue again. The model is the viewer's (one
 * model present; `readModel` gives its state, as `loadNewVersion` leaves it), the sheets are the project's, and the
 * comparison is What changed's own.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectLevel, ProjectSheet } from '@/project/types';
import { defaultViews } from '@/project/view-defaults';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { useViewerStore, type FederatedModel } from '@/store';
import { useWhatChanged } from '@/whatchanged/baseline';
import { runWhatChanged } from '@/whatchanged/run';
import { snapshotFromElements, type ModelSnapshot, type SnapElement } from '@/whatchanged/snapshot';
import { IssueChanges } from '@/components/viewer/sheets/IssueChanges';
import { WALL_SKIN } from '@/components/viewer/sheets/set-skin';
import { addRevisionToSheets } from './changes-actions.js';
import { modelFindings, modelImpact, issuedState, stateHash } from './model-state.js';
import { planFor, runIssue } from './run.js';

const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }, { name: 'First Floor', elevation: 3, storeyGlobalIds: ['L1'] }];
const door = (k: string, a: number[], over: Partial<SnapElement> = {}): SnapElement => ({ k, t: 'IfcDoor', n: `Door ${k}`, d: `d-${k}`, g: `g-${k}`, a, ...over });
const wall = (k: string, a: number[]): SnapElement => ({ k, t: 'IfcWall', n: `Wall ${k}`, d: `d-${k}`, g: `g-${k}`, a });
// The ground floor holds two doors and a wall, the first floor one door.
const GROUND_A = door('DG1', [6, 0, 0, 7, 2.1, 0.3]);
const GROUND_B = door('DG2', [1, 0, 0, 2, 2.1, 0.3]);
const FIRST = door('DF1', [6, 3, 0, 7, 5.1, 0.3]);
const WALL = wall('W1', [0, 0, 0, 10, 3, 0.3]);
const state = (takenAt: number, ...e: SnapElement[]): ModelSnapshot => snapshotFromElements(e, takenAt);
const v1 = state(1, GROUND_A, GROUND_B, FIRST, WALL);
/** The same model with the ground floor door DG1 moved two metres: nothing else differs. */
const v2 = state(2, door('DG1', [8, 0, 0, 9, 2.1, 0.3], { g: 'g-DG1-moved' }), GROUND_B, FIRST, WALL);

const idle = { loading: false, geometryStreamingActive: false, error: null };
const loaded = { id: 'm', name: 'house.ifc', loadedAt: 1, visible: true, geometryResult: null } as unknown as FederatedModel;

const WALLS = [{ x: -2, y: -0.15 }, { x: 2, y: -0.15 }, { x: 2, y: 0.15 }, { x: -2, y: 0.15 }];
const DRAWING = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 10, includeHiddenLines: true, creaseAngle: 30, scale: 100 },
  lines: WALLS.map((a, i) => ({ line: { start: a, end: WALLS[(i + 1) % 4] }, category: 'cut', visibility: 'visible', entityId: 7, ifcType: 'IfcWall', modelIndex: 0, depth: 0 })),
  cutPolygons: [{ polygon: { outer: WALLS, holes: [] }, entityId: 7, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: -2, y: -0.15 }, max: { x: 2, y: 0.15 } },
  stats: { cutLineCount: 4, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 1, totalTriangles: 0, processingTimeMs: 0 },
} as unknown as Drawing2D;

const sheet = (id: string, number: string, name: string, viewId: string): ProjectSheet =>
  ({ id, number, name, createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: `p-${id}`, viewId, x: 100, y: 100, scale: 100, width: 150, height: 60, center: null }] }) as unknown as ProjectSheet;

/** Ground floor plan on two sheets (the second an enlarged copy), first floor plan on one. */
function project(): void {
  resetProject();
  const views = defaultViews(LEVELS);
  const [ground, first] = views.filter((v) => v.kind === 'plan');
  useProjectStore.setState({
    levels: LEVELS, views, name: 'Casa', titleBlock: { project: 'Casa', date: '1999-01-01' },
    sheets: [sheet('s1', 'A-101', 'Ground floor', ground.id), sheet('s2', 'A-102', 'First floor', first.id), sheet('s3', 'A-103', 'Ground floor, enlarged', ground.id)],
  });
  useViewDrawings.setState({ byView: Object.fromEntries(views.map((v) => [v.id, { ...EMPTY_VIEW_DRAWING, drawing: DRAWING, status: 'ready' }])) });
}

/** The model the viewer holds, as `readModel` reads it. */
let model: ModelSnapshot | null = v1;
const readModel = async (): Promise<ModelSnapshot | null> => model;
const issue = (name: string, date = '2026-11-03') => runIssue({ format: 'svg', name, date, listFirst: false, readModel });
const impact = async () => modelImpact(modelFindings(useProjectStore.getState().issues?.at(-1), await readModel()));
const plan = async () => planFor({ date: '2026-12-01' }, await impact());
const edit = (id: string, viewId: string) => ({ id, viewId, layerId: '0', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, params: {} }) as never;
const numbers = (list: readonly { number: string }[]) => list.map((s) => s.number);
const reasonsOf = (changes: { changed: readonly { number: string; reasons?: string[] }[] }) => Object.fromEntries(changes.changed.map((s) => [s.number, s.reasons]));

beforeEach(() => {
  project();
  model = v1;
  useViewerStore.setState({ ...idle, models: new Map([['m', loaded]]) });
  useWhatChanged.setState({ result: null, running: false, message: null });
});
afterEach(() => { cleanup(); setLocale('en'); useViewerStore.setState({ models: new Map() }); resetProject(); });

describe('issue, load a new version with one door moved, issue again', () => {
  it('lists exactly the sheets showing that door as changed by the model, and offers their revision', async () => {
    await issue('Issue 1');
    model = v2; // no edit to the project
    const changes = (await plan()).changes;
    assert.equal(changes.status, 'compared');
    assert.equal(changes.model, 'compared');
    assert.deepEqual(numbers(changes.changed), ['A-101', 'A-103'], 'the ground floor plan on both its sheets, not the first floor');
    assert.deepEqual(reasonsOf(changes), { 'A-101': ['model'], 'A-103': ['model'] });
    assert.deepEqual(changes.unbumped.map((u) => u.number), ['A-101', 'A-103']);
    assert.deepEqual([changes.added, changes.removed], [[], []]);
    // The offer adds a revision to those sheets; they stay listed as changed, and are no longer offered.
    addRevisionToSheets(changes.unbumped.map((u) => u.sheetId), '2026-12-01');
    const after = (await plan()).changes;
    assert.deepEqual(numbers(after.changed), ['A-101', 'A-103']);
    assert.deepEqual(after.unbumped, []);
  });

  it('records the model change in the second issue, with its reasons', async () => {
    await issue('Issue 1');
    model = v2;
    await issue('Issue 2');
    assert.deepEqual(useProjectStore.getState().issues?.at(-1)?.changes?.changed, [
      { number: 'A-101', title: 'Ground floor', reasons: ['model'] }, { number: 'A-103', title: 'Ground floor, enlarged', reasons: ['model'] },
    ]);
  });

  it('is compared with the model as issued, not with the reference: issuing again with nothing new lists nothing, though the reference is still the first version', async () => {
    await issue('Issue 1');
    model = v2;
    await issue('Issue 2');
    const reference = useProjectStore.getState().modelState;
    assert.equal(stateHash(reference!), stateHash(v1), 'the reference was never moved');
    const again = (await plan()).changes;
    assert.equal(again.model, 'compared');
    assert.deepEqual([again.added, again.removed, again.changed], [[], [], []]);
  });

  it('keeps comparing with the model as issued after the new version is accepted as the reference', async () => {
    await issue('Issue 1');
    model = v2;
    await runWhatChanged('accept', () => {}, async () => v2);
    assert.equal(stateHash(useProjectStore.getState().modelState!), stateHash(v2));
    assert.deepEqual(numbers((await plan()).changes.changed), ['A-101', 'A-103'], 'issue 1 went out with v1');
  });

  it('shows the revision clouds What changed drew as edits too: such a sheet is both edited and model changed', async () => {
    await issue('Issue 1');
    model = v2;
    await runWhatChanged('compare', () => {}, async () => v2);
    assert.ok(useProjectStore.getState().drafts.some((d) => d.params.revision === 'whatchanged'), 'the run drew clouds');
    const changes = (await plan()).changes;
    assert.deepEqual(numbers(changes.changed), ['A-101', 'A-103']);
    for (const s of changes.changed) assert.ok(s.reasons?.includes('model'));
  });
});

describe('the reasons', () => {
  it('lists an edit and a model change on the same sheet with both reasons, and an edit elsewhere with its own', async () => {
    await issue('Issue 1');
    model = v2;
    const { views } = useProjectStore.getState();
    const [ground, first] = views.filter((v) => v.kind === 'plan');
    useProjectStore.setState({ drafts: [edit('d1', ground.id), edit('d2', first.id)] });
    const changes = (await plan()).changes;
    assert.deepEqual(reasonsOf(changes), { 'A-101': ['edited', 'model'], 'A-102': ['edited'], 'A-103': ['edited', 'model'] });
  });

  it('lists an edit alone as edited, as before', async () => {
    await issue('Issue 1');
    const [, first] = useProjectStore.getState().views.filter((v) => v.kind === 'plan');
    useProjectStore.setState({ drafts: [edit('d1', first.id)] });
    assert.deepEqual(reasonsOf((await plan()).changes), { 'A-102': ['edited'] });
  });

  it('lists nothing when neither the project nor the model changed', async () => {
    await issue('Issue 1');
    model = state(9, GROUND_A, GROUND_B, FIRST, WALL); // read again: same elements, a later time
    const changes = (await plan()).changes;
    assert.equal(changes.status, 'compared');
    assert.equal(changes.model, 'compared');
    assert.deepEqual([changes.added, changes.removed, changes.changed, changes.unbumped], [[], [], [], []]);
  });

  it('lists the model change of an element no sheet shows as nothing', async () => {
    await issue('Issue 1');
    model = state(2, GROUND_A, GROUND_B, FIRST, WALL, door('DX', [50, 40, 0, 51, 42, 0.3]));
    assert.deepEqual((await plan()).changes.changed, []);
  });
});

describe('a record that cannot say', () => {
  const issuedWithoutModel = async () => { model = null; useViewerStore.setState({ models: new Map() }); await issue('Issue 1'); model = v2; useViewerStore.setState({ models: new Map([['m', loaded]]) }); };

  it('an old record with no model reference says model changes cannot be listed, and lists none of them', async () => {
    await issuedWithoutModel();
    assert.equal(useProjectStore.getState().issues?.at(-1)?.model, undefined);
    const changes = (await plan()).changes;
    assert.equal(changes.model, 'unknown');
    assert.deepEqual(changes.changed, []);
    const root = render(<IssueChanges skin={WALL_SKIN} date="2026-12-01" />);
    await new Promise((r) => setTimeout(r, 30));
    assert.match(root.textContent ?? '', /model changes since that issue can't be listed/);
    assert.doesNotMatch(root.textContent ?? '', /No sheet has been added, removed or changed/, 'it must not claim that nothing changed');
  });

  it('says it in Romanian too', async () => {
    registerLocale('ro', ro);
    setLocale('ro');
    await issuedWithoutModel();
    const root = render(<IssueChanges skin={WALL_SKIN} date="2026-12-01" />);
    await new Promise((r) => setTimeout(r, 30));
    assert.match(root.textContent ?? '', /schimbările modelului de la acea emitere nu pot fi listate/);
    assert.doesNotMatch(root.textContent ?? '', /Nicio planșă nu a fost/);
  });

  it('a record whose state is gone (the reference was replaced by a file that does not carry it) is the same', async () => {
    await issue('Issue 1');
    useProjectStore.setState({ modelState: v1 }); // no `issued`
    assert.equal((await impact()).status, 'unknown');
  });

  it('a record made while the model was still loading carries no model reference', async () => {
    useViewerStore.setState({ loading: true });
    await issue('Issue 1');
    assert.equal(useProjectStore.getState().issues?.at(-1)?.model, undefined);
  });

  it('without a model loaded now, says so rather than listing nothing', async () => {
    await issue('Issue 1');
    model = null;
    useViewerStore.setState({ models: new Map() });
    assert.equal((await plan()).changes.model, 'noModel');
    const root = render(<IssueChanges skin={WALL_SKIN} date="2026-12-01" />);
    await new Promise((r) => setTimeout(r, 30));
    assert.match(root.textContent ?? '', /No model is loaded, so model changes since "Issue 1" can't be listed/);
  });

  it('a model that cannot be read does not stop the set from being issued; the issue carries no model reference', async () => {
    const result = await runIssue({ format: 'svg', name: 'Issue 1', date: '2026-11-03', listFirst: false, readModel: async () => { throw new Error('no data'); } });
    assert.ok(result.zip);
    assert.equal(useProjectStore.getState().issues?.at(-1)?.model, undefined);
  });

  it('a project with no model at all has nothing to say about one', async () => {
    model = null;
    useViewerStore.setState({ models: new Map() });
    await issue('Issue 1');
    assert.equal((await plan()).changes.model, 'none');
  });
});

describe('what the record keeps', () => {
  it('is a reference of a few dozen bytes: the fingerprint, the size and the time; not the state', async () => {
    await issue('Issue 1');
    const issued = useProjectStore.getState().issues!.at(-1)!;
    assert.deepEqual(issued.model, { hash: stateHash(v1), count: 4, takenAt: 1 });
    assert.match(issued.model!.hash, /^[0-9a-f]{14}$/);
    assert.ok(JSON.stringify(issued.model).length < 80, JSON.stringify(issued.model));
    assert.ok(!JSON.stringify(issued).includes(v1.rows.slice(0, 40)), 'no element of the model in the record');
  });

  it('stays the same size for a model of 20 000 elements, and the state is not kept twice when it is the reference', async () => {
    const big = snapshotFromElements(Array.from({ length: 20_000 }, (_, i) => door(`G${String(i).padStart(5, '0')}`, [i, 0, 0, i + 1, 2, 0.3])), 5);
    model = big;
    await issue('Issue 1');
    const issued = useProjectStore.getState().issues!.at(-1)!;
    assert.ok(JSON.stringify(issued.model).length < 80);
    const small = JSON.stringify(issued).length;
    assert.ok(small < 1500, `the record is ${small} characters`);
    const kept = useProjectStore.getState().modelState!;
    assert.deepEqual(kept.issued, { issueId: issued.id }, 'it is the reference: not copied');
    assert.ok(JSON.stringify(kept).length < JSON.stringify(big).length + 100, 'one copy of the model state in the project');
  });

  it('keeps the state in full only when it differs from the reference, and only for the last issue', async () => {
    await issue('Issue 1');
    model = v2;
    await issue('Issue 2');
    const kept = useProjectStore.getState().modelState!;
    assert.equal(kept.issued?.issueId, useProjectStore.getState().issues!.at(-1)!.id);
    assert.equal(kept.issued?.state?.rows, v2.rows);
    assert.equal(stateHash(kept), stateHash(v1), 'the reference stays');
    model = state(3, GROUND_A);
    await issue('Issue 3');
    assert.equal(useProjectStore.getState().modelState!.issued?.state?.rows, model.rows, 'replaced, not accumulated');
  });

  it('survives the project file, and is refused when damaged', async () => {
    await issue('Issue 1');
    model = v2;
    await issue('Issue 2');
    const doc = projectDocument();
    const back = parseProjectFile(serializeProject(doc));
    assert.deepEqual(back.modelState, doc.modelState);
    assert.deepEqual(back.issues?.at(-1)?.model, doc.issues?.at(-1)?.model);
    assert.ok(issuedState(back.issues!.at(-1)!, back.modelState));
    const damaged = JSON.parse(serializeProject(doc)) as { modelState: { issued: unknown } };
    damaged.modelState.issued = { state: {} };
    assert.throws(() => parseProjectFile(JSON.stringify(damaged)), /modelState\/issued/);
  });
});
