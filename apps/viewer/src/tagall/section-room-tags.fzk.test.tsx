/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Room tags on sections (#677), on AC20-FZK-Haus through the real pipeline: TAGALL on a section tags every room (IfcSpace) the section
 * cuts, with the name and area the plan's tag gives the same room, inside the room's cut outline and clear of what is already there;
 * the single Tag tool tags one room picked on a section; and the tag follows the model.
 */

import '@/test/setup-dom.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { DraftEntity } from '@/drafting/types';
import { editDrafts, draftsOfView, newDraft } from '@/drafting/draft-store';
import { tagCommand } from '@/drafting/commands/tag';
import { rectsOf } from '@/labels/label-annotations';
import { pointInRing, rectInsideRing, rectsOverlap, ringBounds } from '@/labels/label-geometry';
import { labelElementByGlobalId } from '@/labels/label-element';
import { settleLabels } from '@/labels/label-sync';
import { setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { modelLevels } from '@/project/model-levels';
import { renderIdGlobalId } from '@/project/element-guid';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { startSet } from '@/set-template/start';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { contextForView, runCommandOnView, type AnnotatableView } from '@/annotate-set/run-view';
import { ROOM_TYPE_ID } from './types';
import { leaderCrossesOutsideEntry } from './room-outside';
import { textRect } from '@/labels/label-attach';


/** Whether the segment a-b passes through the rectangle (an end inside, or it crosses an edge). */
function lineThrough(r: { x0: number; y0: number; x1: number; y1: number }, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dy, a.y - r.y0], [dy, r.y1 - a.y]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

describe('room tags on sections (#677), on AC20-FZK-Haus', { skip: planModelMissing(FZK_HAUS) }, () => {
  let model: LoadedPlanModel;
  let sections: AnnotatableView[];
  let plans: AnnotatableView[];
  const drawings = new Map<string, Drawing2D>();

  const roomTags = (viewId: string) => draftsOfView(viewId).filter((d) => d.params.atype === ROOM_TYPE_ID);
  const textOf = (d: DraftEntity) => (d.shape.type === 'text' ? d.shape.text : '');
  /** The drawing as the app stores it: the viewer hides IfcSpace by default, so the section's cut holds none (`useDrawingGeneration`). The test generator also emits every hidden line, which the app's section of this house does not draw (see fzk-sections-zoom.png), so those are dropped too. The raw drawing, with the spaces cut, is what the tags are checked against. */
  const asStored = (drawing: Drawing2D): Drawing2D => ({ ...drawing, cutPolygons: drawing.cutPolygons.filter((p) => p.ifcType !== 'IfcSpace'), lines: drawing.lines.filter((l) => l.visibility !== 'hidden' && !/^ifcspace$/i.test(model.classOf(l.entityId))) });
  const spacesCut = (drawing: Drawing2D) => new Set(drawing.cutPolygons.filter((p) => p.ifcType === 'IfcSpace').map((p) => renderIdGlobalId(p.entityId)));

  before(async () => {
    model = await loadPlanModel(FZK_HAUS);
    const geometryResult = [...useViewerStore.getState().models.values()][0].geometryResult;
    publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const meshes = geometryResult?.meshes ?? [];
    const { models } = useViewerStore.getState();
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(startSet(meshes, extent), 'the Wall lays out a set');
    const views = useProjectStore.getState().views as ProjectView[];
    sections = views.filter((v): v is AnnotatableView => v.kind === 'section');
    plans = views.filter((v): v is AnnotatableView => v.kind === 'plan');
    for (const v of [...sections, ...plans]) drawings.set(v.id, await model.planOf(v));
  });
  after(() => publishDrawingRuntime(null));
  beforeEach(() => useProjectStore.setState({ drafts: [] }));

  it('tags every room the section cuts, with the name and area of the plan\'s tag, inside the room\'s cut outline', () => {
    for (const plan of plans) runCommandOnView(plan, drawings.get(plan.id)!, 'tagall');
    const onPlan = new Map(plans.flatMap((plan) => roomTags(plan.id)).map((d) => [String(d.params.labelOf), textOf(d)]));
    assert.ok(onPlan.size >= 4, 'the plan tags its rooms');
    useProjectStore.setState({ drafts: [] });
    for (const section of sections) {
      const drawing = drawings.get(section.id)!;
      const cut = spacesCut(drawing);
      assert.ok(cut.size >= 2, `${section.name} cuts rooms`);
      const result = runCommandOnView(section, asStored(drawing), 'tagall');
      assert.equal(result.outcome, 'added');
      const tags = roomTags(section.id);
      assert.deepEqual(new Set(tags.map((d) => String(d.params.labelOf))), cut, `${section.name}: a tag for each room it cuts`);
      for (const tag of tags) {
        const guid = String(tag.params.labelOf);
        assert.equal(textOf(tag), onPlan.get(guid), `${section.name}: the tag of ${guid} reads as it does on the plan`);
        const ring = drawing.cutPolygons.filter((p) => p.ifcType === 'IfcSpace' && renderIdGlobalId(p.entityId) === guid).map((p) => p.polygon.outer).sort((a, b) => ringBounds(b).x1 - ringBounds(b).x0 - (ringBounds(a).x1 - ringBounds(a).x0))[0];
        // Inside the room's cut outline, or, with no clear place there, outside it with a leader that ends inside it.
        const led = tag.shape.type === 'text' ? tag.shape.leader : undefined;
        assert.ok(led ? pointInRing(ring, led) : rectsOf([tag]).every((r) => rectInsideRing(r, ring)), `${section.name}: the tag of ${guid} stands inside its room's cut outline, or leads into it`);
      }
    }
  });

  it('puts no room tag over a line the section shows: a tag with no clear place inside its room stands outside with a leader that crosses only where it enters (#677)', () => {
    let inside = 0, outside = 0;
    for (const section of sections) {
      useProjectStore.setState({ drafts: [] });
      const whole = drawings.get(section.id)!;
      const drawing = asStored(whole);
      const { messages } = runCommandOnView(section, drawing, 'tagall');
      const seen = drawing.lines;
      assert.ok(seen.length > 0);
      const over: string[] = [];
      for (const tag of roomTags(section.id)) {
        const guid = String(tag.params.labelOf);
        const ring = whole.cutPolygons.filter((p) => p.ifcType === 'IfcSpace' && renderIdGlobalId(p.entityId) === guid).map((p) => p.polygon.outer)[0];
        const name = textOf(tag).replace(/\n/g, ' / ');
        // The tag's own box: the box of the entity runs on to the end of its leader.
        const box = tag.shape.type === 'text' ? textRect(tag.shape) : rectsOf([tag])[0];
        if (seen.some((l) => lineThrough(box, l.line.start, l.line.end))) { over.push(name); continue; }
        if (tag.shape.type !== 'text' || !tag.shape.leader) { inside++; continue; }
        outside++;
        const tip = tag.shape.leader;
        assert.ok(pointInRing(ring, tip), `${section.name}: the leader of "${name}" ends inside its room`);
        const from = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
        assert.ok(!leaderCrossesOutsideEntry(ring, from, tip, seen.map((l) => ({ a: l.line.start, b: l.line.end }))), `${section.name}: the leader of "${name}" crosses a line other than where it enters its room`);
      }
      const said = Number(messages.find((m) => m.key === 'drafting.msg.tagAllOverLines')?.params?.count ?? 0);
      assert.equal(over.length, said, `${section.name}: the tags over a line (${over.join('; ')}) are the ones the run says so of`);
    }
    assert.ok(outside >= 1, 'a room with no clear place inside is tagged outside it with a leader');
    assert.ok(inside >= 4, 'the rooms with a clear place keep the tag inside');
  });

  it('keeps clear of what the room already has, and a second run adds nothing', () => {
    const section = sections[0];
    const drawing = drawings.get(section.id)!;
    runCommandOnView(section, asStored(drawing), 'tagall');
    // The biggest room's tag, so that there is room to move.
    const size = (guid: string) => Math.max(...drawing.cutPolygons.filter((p) => p.ifcType === 'IfcSpace' && renderIdGlobalId(p.entityId) === guid).map((p) => { const b = ringBounds(p.polygon.outer); return (b.x1 - b.x0) * (b.y1 - b.y0); }));
    const first = roomTags(section.id).sort((a, b) => size(String(b.params.labelOf)) - size(String(a.params.labelOf)))[0];
    const [box] = rectsOf([first]);
    useProjectStore.setState({ drafts: [] });
    // A note where the tag would go: the room's tag moves off it and still stands in the room.
    const note = newDraft(section.id, first.layerId, { type: 'text', p: { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }, text: 'NOTE', height: first.shape.type === 'text' ? first.shape.height : 0.25, rotation: 0 }, {});
    editDrafts({ add: [note] });
    runCommandOnView(section, asStored(drawing), 'tagall');
    const [noteBox] = rectsOf([note]);
    for (const tag of roomTags(section.id)) assert.ok(!rectsOverlap(rectsOf([tag])[0], noteBox), 'no tag over the note');
    const before = draftsOfView(section.id).length;
    const again = runCommandOnView(section, asStored(drawing), 'tagall');
    assert.equal(draftsOfView(section.id).length, before);
    assert.equal(again.outcome, 'already');
  });

  it('is one tag per room by the single Tag tool, on a room picked on the section', () => {
    const section = sections[0];
    const drawing = drawings.get(section.id)!;
    const space = drawing.cutPolygons.find((p) => p.ifcType === 'IfcSpace')!;
    const ctx = { ...contextForView(section, asStored(drawing), () => {}), elementAt: () => space.entityId };
    const tool = tagCommand.create(ctx);
    tool.onPoint?.({ x: 1, y: 1 });
    tool.onPoint?.({ x: 2, y: 2 });
    const tags = draftsOfView(section.id).filter((d) => d.params.tagOf === renderIdGlobalId(space.entityId));
    assert.equal(tags.length, 1);
  });

  it('follows the model: a renamed room changes its tag', () => {
    const section = sections[0];
    runCommandOnView(section, asStored(drawings.get(section.id)!), 'tagall');
    const types = useProjectStore.getState().annotationTypes ?? [];
    const drafts = draftsOfView(section.id);
    const renamed = settleLabels(drafts, types, (guid) => {
      const el = labelElementByGlobalId(guid);
      return el ? { ...el, attribute: (n) => (n === 'LongName' || n === 'Name' ? 'Renamed room' : el.attribute(n)) } : null;
    }, 'en');
    assert.ok(renamed.some((d) => d.params.atype === ROOM_TYPE_ID), 'the section has room tags');
    assert.ok(renamed.filter((d) => d.params.atype === ROOM_TYPE_ID).every((d) => textOf(d).includes('Renamed room')), 'every room tag reads the new name');
  });
});
