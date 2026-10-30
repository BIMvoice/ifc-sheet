/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #448: a plan symbol drawn in the drafting view. The user draws on the symbol's own view id through the drafting store (the entity
 * commands use), saves, and the type holds a block like an imported one, so the plan, the sheet and the PDF draw it through the one path
 * (`openingSymbols`, the schedule's `viewPrims`) mirrored for a right-hand type; reset takes it away; a project saved before drawing
 * existed is unchanged; the working copy is never saved with the project.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { defaultDoorSpec, type JoinerySpec } from '@ifc-lite/create';
import { isDrawnSymbol, typeEntryId } from '@bimvoice/ifcsheet/project';
import { openingSymbols } from '@/drafting/opening-symbols';
import { editDrafts, newDraft } from '@/drafting/draft-store';
import { useProjectStore, projectDocument } from '@/project/project-store';
import { serializeProject, parseProjectFile } from '@/project/project-file';
import { cancelCommand, clickDrawing, attachDraftingView, pressEnter, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { TypePlanBlockPicker } from '@/components/viewer/TypePlanBlockPicker';
import { parkDraftingSession } from '@/drafting/session-park';
import { hasModelPicker, referenceShapesIn, setModelPicker } from '@/drafting/session-providers';
import { planRoom, viewPrims } from './element-views-layout';
import type { ElementViews } from './element-views';
import { planSymbol } from './symbols';
import { openSymbolDrafts, drawnSymbolOf } from './symbol-drafts';
import { joinerySymbolViewId } from './view-draft-id';
import { setTypePlanBlock, typePlanBlockOf } from './type-config-actions';

const GUID = 'type-guid';
const entryId = typeEntryId(GUID);
const door = (operation: 'swing-left' | 'swing-right'): JoinerySpec => ({ ...defaultDoorSpec(), id: entryId, mark: 'D1', width: 0.9, panels: [{ col: 0, row: 0, operation }] });
const facts = { typeGlobalId: GUID };
const typeOf = () => useProjectStore.getState().joineryTypes!.find((t) => t.id === entryId)!;
const VIEW = joinerySymbolViewId(entryId);

/** A left-hand door: a closed leaf at the -X jamb, a swing arc, one dashed line. */
const LEAF = { type: 'polyline' as const, pts: [{ x: -0.45, y: 0 }, { x: -0.4, y: 0 }, { x: -0.4, y: -0.9 }, { x: -0.45, y: -0.9 }], closed: true };
const SWING = { type: 'arc' as const, c: { x: -0.45, y: 0 }, r: 0.9, start: -Math.PI / 2, end: 0 };

/** Draws the leaf and the swing the way the drafting tools do (entities of the symbol's view), saves, and returns what the type then holds. */
function drawAndSave(): void {
  const close = openSymbolDrafts(entryId, null);
  editDrafts({ add: [newDraft(VIEW, '0', LEAF), newDraft(VIEW, '0', SWING)] });
  setTypePlanBlock(facts, drawnSymbolOf(entryId));
  close();
}

const mesh = (): MeshData => {
  const pts: number[] = [];
  for (const x of [-0.45, 0.45]) for (const y of [0, 2.1]) for (const z of [-0.1, 0.1]) pts.push(x, y, z);
  return { expressId: 7, ifcType: 'IfcDoor', positions: new Float32Array(pts), origin: [5, 0, 2], localToWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } as unknown as MeshData;
};
const plan = { axis: 'y' as const, position: 1.2, flipped: false };
const onPlan = () => openingSymbols([mesh()], plan, () => 0, () => ({ spec: typeOf(), flips: 0, source: 'type' }))[0];
const xs = (shapes: unknown[]) => shapes.flatMap((s) => ((s as { pts?: { x: number }[] }).pts ?? []).map((p) => p.x));
const emptyView = { lines: [], min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
const views = { width: 0.9, depth: 0.2, height: 2.1, front: emptyView, plan: { lines: [{ a: { x: -0.45, y: -0.1 }, b: { x: 0.45, y: -0.1 }, kind: 'cut' as const }], min: { x: -0.45, y: -0.1 }, max: { x: 0.45, y: 0.1 } }, section: emptyView } as unknown as ElementViews;
const schedulePlan = () => viewPrims(views, typeOf(), { fx: 0, base: 0 }, 10, 'handle').filter((p) => p.kind === 'path' && p.view === 'plan');

beforeEach(() => {
  useProjectStore.setState({
    joineryTypes: [door('swing-left')], drafts: [], dirty: false,
    draftLayers: [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }, { id: 'dashed', name: 'Dashed', color: '#18181b', visible: true, locked: false, lineType: 'dashed', lineWeight: 0.18 }],
  });
});

describe('a symbol drawn in the drafting view', () => {
  it('is stored on the type as block geometry: the leaf closed, the arc flattened, in metres', () => {
    drawAndSave();
    const block = typeOf().planBlock!;
    assert.ok(block, 'the type holds a block');
    assert.equal(isDrawnSymbol(block), true);
    assert.equal(block.paths.length, 2);
    assert.equal(block.paths[0].closed, true);
    assert.deepEqual(block.paths[0].pts, LEAF.pts.map((p) => [p.x, p.y]));
    assert.ok(block.paths[1].pts.length > 8, 'the arc is flattened');
    assert.equal(useProjectStore.getState().dirty, true);
  });

  it('draws on the plan, where the sheet and the PDF draw it, and in the schedule\'s plan view, in place of the generated symbol', () => {
    const generated = onPlan();
    assert.ok(generated.heavy!.length > 0);
    const generatedCard = schedulePlan();
    drawAndSave();
    const drawn = onPlan();
    assert.equal(drawn.heavy!.length, 1, 'the closed leaf, at the cut weight');
    assert.equal(drawn.shapes.length, 1, 'the arc');
    assert.notDeepEqual(drawn.heavy, generated.heavy);
    // Fitted to the 0.9 m opening at x 5.
    const all = xs([...drawn.heavy!, ...drawn.shapes]);
    assert.ok(Math.abs(Math.min(...all) - 4.55) < 1e-6 && Math.abs(Math.max(...all) - 5.45) < 1e-6);
    // The schedule card: the drawn strokes, not the plan cut from the model.
    const card = schedulePlan();
    assert.equal(card.length, 2);
    assert.notEqual(card.length, generatedCard.length);
    assert.ok(card.some((p) => p.kind === 'path' && p.closed));
    assert.ok(planRoom(views, 10, typeOf()) > 0);
  });

  it('is mirrored for a right-hand type', () => {
    useProjectStore.setState({ joineryTypes: [door('swing-right')] });
    drawAndSave();
    assert.ok(Math.min(...xs(onPlan().heavy!)) > 5, 'the leaf is on the +X jamb');
    useProjectStore.setState({ joineryTypes: [door('swing-left')] });
    drawAndSave();
    assert.ok(Math.max(...xs(onPlan().heavy!)) < 5, 'the leaf is on the -X jamb');
  });

  it('is taken away by reset: the generated symbol draws again', () => {
    const before = planSymbol(typeOf(), { cutZ: 1.2 });
    drawAndSave();
    assert.notDeepEqual(planSymbol(typeOf(), { cutZ: 1.2 }), before);
    setTypePlanBlock(facts, null);
    assert.equal('planBlock' in typeOf(), false);
    assert.equal(typePlanBlockOf(facts), null);
    assert.deepEqual(planSymbol(typeOf(), { cutZ: 1.2 }), before);
  });

  it('opens a type\'s symbol for editing again, dashed strokes on a dashed layer, and saving it unchanged keeps the strokes', () => {
    drawAndSave();
    const saved = typeOf().planBlock!;
    const withDashed = { ...saved, paths: [...saved.paths, { pts: [[-0.45, 0], [0.45, 0]] as Array<[number, number]>, dashed: true as const }] };
    const close = openSymbolDrafts(entryId, withDashed);
    const loaded = useProjectStore.getState().drafts.filter((d) => d.viewId === VIEW);
    assert.equal(loaded.length, 3);
    assert.equal(loaded.filter((d) => d.layerId === 'dashed').length, 1);
    assert.deepEqual(drawnSymbolOf(entryId)!.paths.map((p) => [p.closed === true, p.dashed === true]), [[true, false], [false, false], [false, true]]);
    close();
  });

  it('leaves the type and the project untouched when the editor is opened and closed, and keeps no working copy in the file', () => {
    const before = useProjectStore.getState().joineryTypes;
    const close = openSymbolDrafts(entryId, null);
    editDrafts({ add: [newDraft(VIEW, '0', LEAF)] });
    assert.equal(useProjectStore.getState().joineryTypes, before, 'nothing is written to the type while drawing');
    const file = parseProjectFile(serializeProject(projectDocument()));
    assert.equal(file.drafts.some((d) => d.viewId === VIEW), false, 'the working copy is not saved with the project');
    close();
    assert.equal(useProjectStore.getState().drafts.length, 0);
    assert.equal(useProjectStore.getState().joineryTypes, before);
  });

  it('is drawn with the drafting tools\' own commands, and the symbol\'s view refuses text', () => {
    const close = openSymbolDrafts(entryId, null);
    attachDraftingView(VIEW, 'front', () => [], 1);
    assert.equal(startDraftCommand('line'), true);
    clickDrawing({ x: -0.4, y: 0 }, 0.01, false);
    clickDrawing({ x: 0.4, y: 0 }, 0.01, false);
    pressEnter();
    cancelCommand();
    assert.equal(useProjectStore.getState().drafts.filter((d) => d.viewId === VIEW).length, 1, 'the line command drew on the symbol');
    assert.equal(drawnSymbolOf(entryId)!.paths.length, 1);
    startDraftCommand('text');
    assert.equal(useDraftingSession.getState().commandId, null, 'text is refused: a block has no text');
    attachDraftingView(null, 'front', () => []);
    close();
  });
});

describe('a project saved before symbols could be drawn', () => {
  it('has no block and its type draws the generated symbol it always did', () => {
    const legacy = door('swing-left');
    useProjectStore.setState({ joineryTypes: [legacy] });
    assert.equal(typePlanBlockOf(facts), null);
    assert.equal('planBlock' in typeOf(), false);
    assert.deepEqual(planSymbol(typeOf(), { cutZ: 1.2 }).map((s) => [s.weight, s.pts.length, !!s.closed, !!s.dashed]),
      [['cut', 4, true, false], ['cut', 4, true, false], ['outline', 4, true, false], ['thin', 17, false, false]]);
    // Opening the editor on it and saving an empty canvas adds nothing.
    const close = openSymbolDrafts(entryId, null);
    setTypePlanBlock(facts, drawnSymbolOf(entryId));
    close();
    assert.equal(useProjectStore.getState().joineryTypes![0], legacy);
  });
});

describe('the editor over another drafting view', () => {
  it('gives the session back to the view the user was in: its id, its snap references', () => {
    const mine = [{ type: 'line' as const, a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }];
    attachDraftingView('plan-1', 'down', () => mine, 1);
    setModelPicker(() => {});
    const restore = parkDraftingSession();
    attachDraftingView(VIEW, 'front', () => [], 1);
    setModelPicker(null); // the editor's canvas clears what it installed as it unmounts
    assert.equal(useDraftingSession.getState().viewId, VIEW);
    assert.deepEqual(referenceShapesIn({ x: 0, y: 0 }, { x: 1, y: 1 }), []);
    restore();
    assert.equal(useDraftingSession.getState().viewId, 'plan-1');
    assert.equal(useDraftingSession.getState().axis, 'down');
    assert.deepEqual(referenceShapesIn({ x: 0, y: 0 }, { x: 1, y: 1 }), mine);
    assert.equal(hasModelPicker(), true, 'the picker of the view underneath is back');
    setModelPicker(null);
    attachDraftingView(null, 'down', () => []);
  });
});

describe('the type form offers the editor', () => {
  const picker = (entry: JoinerySpec | null) => renderToStaticMarkup(createElement(TypePlanBlockPicker, { block: null, entry, onChange: () => {}, onDrawn: () => {} }));
  it('an Edit symbol button on a configured type, disabled while the type has no entry to keep a symbol on', () => {
    const button = (entry: JoinerySpec | null) => /<button[^>]*data-type-plan-block-edit[^>]*>/.exec(picker(entry))![0];
    assert.doesNotMatch(button(door('swing-left')), /\sdisabled=""/);
    assert.match(button(null), /\sdisabled=""/);
  });
});
