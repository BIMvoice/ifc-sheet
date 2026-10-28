/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A door tag edited to "D-01*" (#445), over the real FZK-Haus: the sheet SVG (what the PDF is made of) prints it,
 * a model edit does not take it back, "Reset to model value" returns the model's mark, save and reopen keep both
 * states, a new version that moves the door leaves it on its tag, and a tag whose element is gone is reported
 * with the text it shows.
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
import type { DraftEntity } from '@/drafting/types';
import { elementLabel } from '@/tagfields/element-tag.js';
import { refreshElementTags } from '@/project/useElementTagSync.js';
import { overrideTagText, resetTagText } from '@/project/tag-override-actions.js';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store.js';
import { parseProjectFile, serializeProject } from '@/project/project-file.js';
import type { ProjectSheet } from '@/project/types.js';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper.js';
import { sheetSvgText } from '@/components/viewer/sheets/sheet-export.js';
import { setFieldSources } from './tag-fields-actions.js';
import { previewElements } from './preview-elements.js';
import { compareStates } from '@/whatchanged/compare.js';
import { followMovedElements } from '@/whatchanged/follow.js';
import { snapshotFromElements } from '@/whatchanged/snapshot.js';
import { planBand } from '@/whatchanged/visibility.js';
import { danglingAnnotations } from '@/check/findings.js';
import type { CheckInput } from '@/check/types.js';

let door = '';
let tagId = '';
const sheet: ProjectSheet = { id: 's1', number: 'A-101', autoNumber: false, name: 'A-101', createdAt: 1, paper: 'A1', orientation: 'landscape', titleBlock: {}, viewports: [{ id: 'vp', viewId: 'v', x: 400, y: 300, scale: 100, width: 700, height: 500, center: null }] } as unknown as ProjectSheet;
const tag = (): DraftEntity => useProjectStore.getState().drafts.find((d) => d.id === tagId)!;
const shown = (d: DraftEntity) => (d.shape.type === 'leader' ? d.shape.text : '');
/** What the model gives this door's mark (the tag fields' own reader, as the TAG tool uses it). */
const modelMark = (): string => elementLabel(door, 'mark')!;

beforeEach(async () => {
  resetProject();
  const store = await parseStep(readFileSync(resolve(process.cwd(), 'src/test/__fixtures__/AC20-FZK-Haus.ifc')));
  seedModel('fzk', 0, store, 1);
  const view = new MutablePropertyView(store.properties ?? null, 'fzk');
  configureMutationView(view, store);
  useViewerStore.setState({ mutationViews: new Map([['fzk', view]]) });
  door = previewElements('door')[0].guid;
  const d = newDraft('v', '0', { type: 'leader', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], text: 'x', height: 0.25 }, { tagOf: door, tagField: 'mark' });
  tagId = d.id;
  useProjectStore.setState({ sheets: [sheet], drafts: [d] });
  refreshElementTags();
});
afterEach(() => cleanup());

const sheetText = (): string => {
  const ui = render(<SheetPaper sheet={sheet} projectName="FZK" layers={useProjectStore.getState().draftLayers} extraPatterns={[]} selectedViewportId={null} pxPerMm={1}
    content={(vp) => ({ view: undefined, drawing: null, drafts: useProjectStore.getState().drafts.filter((d) => d.viewId === vp.viewId) })} />);
  const svg = ui.querySelector('svg');
  assert.ok(svg, 'the sheet draws');
  const out = sheetSvgText(svg as unknown as SVGSVGElement, sheet);
  cleanup();
  return out;
};
const reopen = () => {
  const file = serializeProject(projectDocument());
  resetProject();
  loadProjectDocument(parseProjectFile(file));
};

describe('a tag with its text written over the model value', () => {
  it('starts from the model: the tag reads the door', () => {
    assert.notEqual(modelMark(), '');
    assert.notEqual(modelMark(), 'D-01*');
    assert.equal(shown(tag()), modelMark());
    assert.ok(sheetText().includes(`>${modelMark()}<`));
  });

  it('prints the written text on the sheet, and a model edit does not take it back', () => {
    overrideTagText(tagId, 'D-01*');
    assert.equal(tag().params.tagOf, door, 'still linked to the door');
    assert.ok(sheetText().includes('>D-01*<'), 'the sheet SVG, which the PDF is made of, prints it');
    assert.ok(!sheetText().includes(`>${modelMark()}<`), 'and not the model value');
    const expressId = useViewerStore.getState().models.get('fzk')!.ifcDataStore!.entities.getExpressIdByGlobalId(door);
    const view = useViewerStore.getState().mutationViews.get('fzk')!;
    view.setProperty(expressId, 'Pset_DoorCommon', 'Reference', 'MODEL-2', PropertyValueType.String);
    setFieldSources('door', 'mark', [{ kind: 'pset', pset: 'Pset_DoorCommon', property: 'Reference' }]);
    useViewerStore.setState({ mutationVersion: useViewerStore.getState().mutationVersion + 1 });
    refreshElementTags();
    assert.equal(shown(tag()), 'D-01*');
    resetTagText(tagId);
    assert.equal(shown(tag()), 'MODEL-2', 'the model did change: without the override the tag would have taken it');
  });

  it('resets to the model mark, and then follows the model again', () => {
    overrideTagText(tagId, 'D-01*');
    resetTagText(tagId);
    assert.equal(shown(tag()), modelMark());
    assert.equal(tag().params.tagOverride, undefined);
    assert.equal(tag().params.tagOf, door);
    assert.ok(sheetText().includes(`>${modelMark()}<`));
  });

  it('ignores a blank text instead of blanking the tag', () => {
    overrideTagText(tagId, '   ');
    assert.equal(shown(tag()), modelMark());
    assert.equal(tag().params.tagOverride, undefined);
  });

  it('survives save and reopen, in both states', () => {
    overrideTagText(tagId, 'D-01*');
    reopen();
    refreshElementTags();
    assert.equal(shown(tag()), 'D-01*');
    assert.equal(tag().params.tagOverride, 'D-01*');
    resetTagText(tagId);
    reopen();
    refreshElementTags();
    assert.equal(shown(tag()), modelMark());
    assert.equal(tag().params.tagOverride, undefined);
  });

  it('stays on its tag when a new version of the model moves the door', () => {
    overrideTagText(tagId, 'D-01*');
    const at = (dx: number) => snapshotFromElements([{ k: door, t: 'IfcDoor', n: 'Door', d: 'd', g: dx ? 'g2' : 'g', a: [1 + dx, 0, 1, 2 + dx, 2, 1.2] }], 0);
    const band = { ...planBand('plan', 0, 1.2), plane: { axis: 'y' as const, position: 1.2, flipped: false } };
    const before = tag();
    const out = followMovedElements([{ ...before, viewId: 'plan' }], compareStates(at(0), at(0.5)), (id) => (id === 'plan' ? band : undefined));
    assert.notEqual(out[0], before, 'the tag moved with its door');
    useProjectStore.setState({ drafts: out as DraftEntity[] });
    refreshElementTags();
    assert.equal(shown(tag()), 'D-01*');
    assert.equal(tag().params.tagOf, door);
  });

  it('is reported like any tag whose element is gone, with the text it shows', () => {
    overrideTagText(tagId, 'D-01*');
    const input = { views: [{ id: 'v', name: 'Plan', kind: 'plan' }], sheets: [sheet], drafts: useProjectStore.getState().drafts, elementExists: () => false, planElements: () => [] } as unknown as CheckInput;
    const [finding] = danglingAnnotations(input);
    assert.equal(finding.kind, 'danglingAnnotation');
    assert.equal(finding.params.what, 'tag');
    assert.equal(finding.params.text, 'D-01*');
    refreshElementTags();
    assert.equal(shown(tag()), 'D-01*', 'and keeps its text');
  });
});
