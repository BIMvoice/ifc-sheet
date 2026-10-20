/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The tag fields over a real model (FZK-Haus): the defaults give the tags the
 * model gave before the sources could be changed; mapping the door mark to a
 * property changes every door tag on every sheet, in the labels TAGALL placed,
 * in the element tags and in the sheet SVG; the Romanian letters arrive as written.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PropertyValueType } from '@ifc-lite/data';
import { MutablePropertyView } from '@ifc-lite/mutations';
import { cleanup, render } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { configureMutationView } from '@/utils/configureMutationView';
import { newDraft } from '@/drafting/draft-store';
import type { DraftEntity, Pt } from '@/drafting/types';
import { labelElementByGlobalId, markOf } from '@/labels/label-element.js';
import { refreshParametricLabels } from '@/labels/label-sync.js';
import { refreshElementTags } from '@/project/useElementTagSync.js';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store.js';
import { parseProjectFile, serializeProject } from '@/project/project-file.js';
import type { ProjectSheet } from '@/project/types.js';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper.js';
import { sheetSvgText } from '@/components/viewer/sheets/sheet-export.js';
import { planTagAll } from '@/tagall/plan.js';
import { TAGALL_TYPES } from '@/tagall/types.js';
import type { LabelTarget } from '@/labels/label-place.js';
import type { ViewElement } from '@/labels/view-elements.js';
import { previewElements } from './preview-elements.js';
import { setFieldSources } from './tag-fields-actions.js';
import type { TagKind } from './tag-fields.js';

const box = (x: number, y: number, w = 0.9, h = 0.3): Pt[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const [markType, roomType] = TAGALL_TYPES;
/** Doors of the real model carry this set on every one of them (read from the model below). */
const DOOR_SET = 'ArchiCADProperties', DOOR_PROP = 'Raumnummer';
let guids: Record<'door' | 'window' | 'room', string[]> = { door: [], window: [], room: [] };
let view: MutablePropertyView;

beforeEach(async () => {
  resetProject();
  const store = await parseStep(readFileSync(resolve(process.cwd(), 'src/test/__fixtures__/AC20-FZK-Haus.ifc')));
  seedModel('fzk', 0, store, 1);
  view = new MutablePropertyView(store.properties ?? null, 'fzk');
  configureMutationView(view, store);
  useViewerStore.setState({ mutationViews: new Map([['fzk', view]]) });
  guids = { door: previewElements('door').map((e) => e.guid), window: previewElements('window').map((e) => e.guid), room: previewElements('room').map((e) => e.guid) };
  useProjectStore.setState({ annotationTypes: TAGALL_TYPES.map((t) => structuredClone(t)) });
});
afterEach(() => cleanup());

const el = (guid: string) => labelElementByGlobalId(guid)!;
const prop = (guid: string, set: string, name: string): string => String(el(guid).propertySets().find((s) => s.name === set)?.properties.find((p) => p.name === name)?.value ?? '');
const text = (d: DraftEntity) => (d.shape.type === 'text' || d.shape.type === 'leader' ? d.shape.text : '');
const edited = (): void => useViewerStore.setState({ mutationVersion: useViewerStore.getState().mutationVersion + 1 });

/** TAGALL's own planner over the real elements of a view: a row of boxes for the doors and windows, the rooms apart. */
function tagAll(viewId: string): DraftEntity[] {
  const openings = [...guids.door, ...guids.window];
  const elements: ViewElement[] = openings.map((g, i) => ({ renderId: i + 1, anchor: { x: i * 3 + 0.45, y: 0.15 }, ring: box(i * 3, 0) }));
  const targets: LabelTarget[] = openings.map((g, i) => ({ guid: g, className: el(g).className(), anchor: elements[i].anchor, renderId: i + 1, ring: elements[i].ring }));
  const rooms = guids.room.map((g, i) => ({ renderId: 100 + i, guid: g, ring: box(i * 12, 8, 10, 8), at: 'cut' as const }));
  const placement = { viewId, layerId: '0', textHeight: 0.25, textStyle: 'standard', dimStyle: 'standard', paperUnit: 0.1 };
  const { drafts } = planTagAll({ elements, targets, rooms, existing: [], placement, types: { mark: markType, room: roomType }, read: labelElementByGlobalId });
  return drafts.map((d) => ({ ...d, id: `${viewId}:${d.id}` }));
}
/** The element tags (TAG tool) of the doors, on a view. */
const doorTags = (viewId: string): DraftEntity[] => guids.door.map((g) => newDraft(viewId, '0', { type: 'leader', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], text: 'x', height: 0.25 }, { tagOf: g, tagField: 'mark' }));
const textsOf = (viewId: string, kind: TagKind): Map<string, string> => new Map(useProjectStore.getState().drafts
  .filter((d) => d.viewId === viewId && typeof d.params.labelOf === 'string' && guids[kind as 'door'].includes(String(d.params.labelOf))).map((d) => [String(d.params.labelOf), text(d)]));

function twoSheets(): ProjectSheet[] {
  const sheet = (id: string, n: string): ProjectSheet => ({ id, number: n, autoNumber: false, name: n, createdAt: 1, paper: 'A1', orientation: 'landscape', titleBlock: {}, viewports: [{ id: `vp-${id}`, viewId: `view-${id}`, x: 400, y: 300, scale: 100, width: 700, height: 500, center: { x: 0, y: 0 } }] } as ProjectSheet);
  return [sheet('s1', 'A-101'), sheet('s2', 'A-102')];
}
function seedDrawing(): ProjectSheet[] {
  const sheets = twoSheets();
  useProjectStore.setState({ sheets, drafts: [...tagAll('view-s1'), ...tagAll('view-s2'), ...doorTags('view-s2')] });
  return sheets;
}
const sheetText = (sheet: ProjectSheet): string => {
  const ui = render(<SheetPaper sheet={sheet} projectName="FZK" layers={useProjectStore.getState().draftLayers} extraPatterns={[]} selectedViewportId={null} pxPerMm={1}
    content={(vp) => ({ view: undefined, drawing: null, drafts: useProjectStore.getState().drafts.filter((d) => d.viewId === vp.viewId) })} />);
  const svg = ui.querySelector('svg');
  assert.ok(svg, 'the sheet draws');
  return sheetSvgText(svg as unknown as SVGSVGElement, sheet);
};

describe('tag fields on FZK-Haus', () => {
  it('has doors, windows and rooms, and the property the tests map the door mark to on every door', () => {
    assert.equal(guids.door.length, 5);
    assert.equal(guids.window.length, 11);
    assert.equal(guids.room.length, 7);
    for (const g of guids.door) assert.notEqual(prop(g, DOOR_SET, DOOR_PROP), '', `${el(g).attribute('Name')} has ${DOOR_SET}.${DOOR_PROP}`);
    for (const g of guids.door) assert.notEqual(prop(g, DOOR_SET, DOOR_PROP), el(g).attribute('Name'), 'the property gives another text than the name');
  });

  it('gives with the default configuration the tag text the model gave before: the Tag as a mark, else the Name; the long name and the area', () => {
    const drafts = tagAll('v');
    const byGuid = new Map(drafts.map((d) => [String(d.params.labelOf), text(d)]));
    // Before the sources could be changed: markOf(Tag), else Name; LongName, else Name, then NetFloorArea.
    const area = (g: string): string => {
      const q = el(g).quantitySets().find((s) => s.name === 'BaseQuantities')?.quantities.find((x) => x.name === 'NetFloorArea');
      return Number(q?.value).toFixed(2);
    };
    for (const g of [...guids.door, ...guids.window]) assert.equal(byGuid.get(g), markOf(el(g).attribute('Tag')) || el(g).attribute('Name'));
    for (const g of guids.room) assert.equal(byGuid.get(g), `${el(g).attribute('LongName') || el(g).attribute('Name')}\n${area(g)} m²`);
    // A few of them as the model states them.
    const named = (name: string) => byGuid.get(guids.door.find((g) => el(g).attribute('Name') === name)!);
    assert.equal(named('Innentuer-1'), 'Innentuer-1');
    assert.equal(named('Terrassentuer'), 'Terrassentuer');
    assert.equal(byGuid.get(guids.room.find((g) => el(g).attribute('LongName') === 'Schlafzimmer')!), 'Schlafzimmer\n21.41 m²');
    assert.equal(byGuid.get(guids.room.find((g) => el(g).attribute('LongName') === 'Galerie')!), 'Galerie\n74.51 m²');
    assert.equal(drafts.length, 5 + 11 + 7);
  });

  it('changes every door tag on every sheet when the door mark is mapped to a property', () => {
    const sheets = seedDrawing();
    refreshParametricLabels();
    refreshElementTags();
    const before = sheets.map((s) => textsOf(`view-${s.id}`, 'door'));
    for (const t of before) {
      assert.equal(t.size, 5);
      for (const [g, v] of t) assert.equal(v, el(g).attribute('Name'));
    }

    setFieldSources('door', 'mark', [{ kind: 'pset', pset: DOOR_SET, property: DOOR_PROP }, { kind: 'attribute', name: 'Name' }]);
    refreshParametricLabels();
    refreshElementTags();

    for (const s of sheets) {
      const after = textsOf(`view-${s.id}`, 'door');
      assert.equal(after.size, 5);
      for (const [g, v] of after) assert.equal(v, prop(g, DOOR_SET, DOOR_PROP), `${s.number} ${el(g).attribute('Name')}`);
      const svg = sheetText(s);
      for (const g of guids.door) assert.ok(svg.includes(`>${prop(g, DOOR_SET, DOOR_PROP)}<`), `${s.number} draws ${prop(g, DOOR_SET, DOOR_PROP)}`);
      assert.ok(!svg.includes('Terrassentuer'), `${s.number} no longer draws the old text`);
    }
    // The element tags of the TAG tool follow too.
    const tags = useProjectStore.getState().drafts.filter((d) => d.params.tagOf !== undefined);
    assert.equal(tags.length, 5);
    for (const d of tags) assert.equal(text(d), prop(String(d.params.tagOf), DOOR_SET, DOOR_PROP));
    // Windows keep the default: the configuration is per kind.
    for (const [g, v] of textsOf('view-s1', 'window')) assert.equal(v, el(g).attribute('Name'));

    // Back to the default: the tags are what they were.
    setFieldSources('door', 'mark', null);
    refreshParametricLabels();
    assert.deepEqual([...textsOf('view-s1', 'door')], [...before[0]]);
    assert.equal(useProjectStore.getState().tagFields, undefined);
  });

  it('shows ș ț ă î â exactly in the tag and in the sheet SVG', () => {
    const door = guids.door[0];
    const expressId = useViewerStore.getState().models.get('fzk')!.ifcDataStore!.entities.getExpressIdByGlobalId(door);
    const ro = 'Ușă țărănească înaltă';
    view.setProperty(expressId, 'Pset_DoorCommon', 'Reference', ro, PropertyValueType.String);
    edited();
    const sheets = seedDrawing();
    setFieldSources('door', 'mark', [{ kind: 'pset', pset: 'Pset_DoorCommon', property: 'Reference' }, { kind: 'attribute', name: 'Mark' }]);
    refreshParametricLabels();
    refreshElementTags();
    for (const s of sheets) {
      assert.equal(textsOf(`view-${s.id}`, 'door').get(door), ro);
      assert.ok(sheetText(s).includes(`>${ro}<`), `${s.number} draws the text as written`);
    }
    const tag = useProjectStore.getState().drafts.find((d) => d.params.tagOf === door)!;
    assert.equal(text(tag), ro);
    // The other doors have no such property: they fall back to the Mark, then the Name, as before.
    assert.equal(textsOf('view-s1', 'door').get(guids.door[1]), el(guids.door[1]).attribute('Name'));
  });

  it('keeps the text of element tags an older project saved, byte for byte, until the office sets the field (#113 review)', () => {
    // As the TAG tool wrote them before the sources could be changed: the Tag as written, a GUID-like one included,
    // and a room's Name, not its long name. Literal, from the model file.
    const door = guids.door.find((g) => el(g).attribute('Name') === 'Innentuer-1')!;
    const room = guids.room.find((g) => el(g).attribute('LongName') === 'Schlafzimmer')!;
    const saved: Array<[string, string, string]> = [
      [door, 'mark', 'E605AACB-6C4E-458D-93-46-5D9D8C7C21D3'],
      [door, 'name', 'Innentuer-1'],
      [room, 'name', '4'],
      [room, 'mark', '4'],
      [door, 'class', 'Door'],
    ];
    useProjectStore.setState({ drafts: saved.map(([g, field, t]) => newDraft('v', '0', { type: 'leader', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], text: t, height: 0.25 }, { tagOf: g, tagField: field })) });
    const file = JSON.parse(serializeProject(projectDocument()));
    delete file.tagFields;
    resetProject();
    loadProjectDocument(parseProjectFile(JSON.stringify(file)));
    refreshElementTags();
    const tags = () => useProjectStore.getState().drafts.filter((d) => d.params.tagOf !== undefined).map(text);
    assert.deepEqual(tags(), saved.map(([, , t]) => t));
    // Labels keep theirs too: the mark label reads the mark (not the GUID-like Tag), the room label the long name.
    assert.equal(markOf(el(door).attribute('Tag')), '');
    // Opting in: once the door mark and the room name are set, the tags follow the sources.
    setFieldSources('door', 'mark', [{ kind: 'attribute', name: 'Mark' }, { kind: 'attribute', name: 'Name' }]);
    setFieldSources('room', 'name', [{ kind: 'attribute', name: 'LongName' }, { kind: 'attribute', name: 'Name' }]);
    refreshElementTags();
    assert.deepEqual(tags(), ['Innentuer-1', 'Innentuer-1', 'Schlafzimmer', 'Schlafzimmer', 'Door'], 'a room has no Tag: its mark falls back to the name');
  });
});
