/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * CEILTAG keys each tag to the ceiling's GlobalId, which the project file keeps across reloads; a renderer id
 * does not survive a re-export or a different load order, so a second run must recognise the ceiling by GlobalId.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import type { ProjectView } from '@/project/types';
import { ceilTag } from './ceiltag.js';

const view = {
  id: 'view-1', kind: 'plan', name: 'Level 1 RCP', scale: 100, reflected: true, cutHeight: 1.2,
  level: { name: 'Level 1', elevation: 0, storeyGlobalIds: [] },
} as unknown as ProjectView;

/** One flat ceiling covering 2.70 above the floor, under renderer id `renderId`. */
function loadCeiling(renderId: number): void {
  const mesh = {
    expressId: renderId, ifcType: 'IfcCovering',
    positions: new Float32Array([0, 2.7, 0, 4, 2.7, 0, 4, 2.7, 3, 0, 2.7, 3]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
  publishDrawingRuntime({
    geometryResult: { meshes: [mesh], coordinateInfo: undefined } as never,
    sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false,
  });
}

function context(): Parameters<typeof ceilTag>[0] {
  return {
    viewId: 'view-1',
    layerId: '0',
    settings: { textHeight: 0.25, currentTextStyle: 'Standard', currentDimStyle: 'Standard' },
    view: () => view,
    entities: () => useProjectStore.getState().drafts,
    planObstacles: () => [],
    say: () => {},
  } as unknown as Parameters<typeof ceilTag>[0];
}

const ceilingTexts = () => useProjectStore.getState().drafts.filter((d) => d.params.ceilingOf !== undefined);
const SAME_GUID = (): string => '2CEIL00000000000000001';

beforeEach(() => { resetProject(); clearDraftHistory(); });
afterEach(() => publishDrawingRuntime(null));

describe('CEILTAG run twice', () => {
  it('keys the tag to the ceiling\'s GlobalId, not its renderer id', () => {
    loadCeiling(100);
    ceilTag(context(), () => true, SAME_GUID);
    assert.deepEqual(ceilingTexts().map((d) => d.params.ceilingOf), ['2CEIL00000000000000001']);
  });

  it('leaves one tag when the same ceiling comes back under another renderer id', () => {
    loadCeiling(100);
    ceilTag(context(), () => true, SAME_GUID);
    loadCeiling(5100);
    ceilTag(context(), () => true, SAME_GUID);
    assert.equal(ceilingTexts().length, 1);
  });

  it('leaves one tag when run twice on the same load', () => {
    loadCeiling(100);
    ceilTag(context(), () => true, SAME_GUID);
    ceilTag(context(), () => true, SAME_GUID);
    assert.equal(ceilingTexts().length, 1);
  });

  it('tags a different ceiling that is not tagged yet', () => {
    loadCeiling(100);
    ceilTag(context(), () => true, SAME_GUID);
    loadCeiling(200);
    ceilTag(context(), () => true, () => '2CEIL00000000000000002');
    assert.equal(ceilingTexts().length, 2);
  });
});

/** Two coverings with the very same face (the Duplex has them: 187462 and 187470), and a third beside them. */
function loadCoveringPair(): void {
  const slab = (renderId: number, x: number) => ({
    expressId: renderId, ifcType: 'IfcCovering',
    positions: new Float32Array([x, 2.7, 0, x + 4, 2.7, 0, x + 4, 2.7, 3, x, 2.7, 3]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  publishDrawingRuntime({
    geometryResult: { meshes: [slab(100, 0), slab(101, 0), slab(102, 10)], coordinateInfo: undefined } as never,
    sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false,
  });
}
const GUIDS: Record<number, string> = { 100: '2CEIL00000000000000100', 101: '2CEIL00000000000000101', 102: '2CEIL00000000000000102' };
const guidOf = (renderId: number): string => GUIDS[renderId]!;
const said = (): string[] => lines;
let lines: string[] = [];
const talkingContext = (): Parameters<typeof ceilTag>[0] => ({ ...context(), say: (key: string, params?: Record<string, string | number>) => { lines.push(`${key} ${JSON.stringify(params ?? {})}`); } }) as unknown as Parameters<typeof ceilTag>[0];

describe('CEILTAG on coverings stacked at one spot (#271)', () => {
  beforeEach(() => { lines = []; });

  it('draws one tag for two identical coverings at the same spot, and one for the covering beside them', () => {
    loadCoveringPair();
    ceilTag(talkingContext(), () => true, guidOf);
    const at = ceilingTexts().map((d) => (d.shape.type === 'text' ? `${d.shape.text}@${d.shape.p.x.toFixed(2)}` : ''));
    assert.equal(ceilingTexts().length, 2, `tags: ${at.join(', ')}`);
  });

  it('says that a ceiling shares another\'s tag, instead of counting it as tagged', () => {
    loadCoveringPair();
    ceilTag(talkingContext(), () => true, guidOf);
    assert.ok(said().some((l) => l.startsWith('drafting.msg.ceilTagStacked') && l.includes('"stacked":1')), said().join(' | '));
    assert.ok(said().some((l) => l.startsWith('drafting.msg.ceilTagDone') && l.includes('"count":2')), said().join(' | '));
  });

  it('adds nothing on a second run, whichever of the pair is met first', () => {
    loadCoveringPair();
    ceilTag(talkingContext(), () => true, guidOf);
    ceilTag(talkingContext(), () => true, (id) => guidOf(id === 100 ? 101 : id === 101 ? 100 : id));
    assert.equal(ceilingTexts().length, 2);
  });

  it('keeps the tags of coverings at the same spot but at another height apart', () => {
    const slab = (renderId: number, y: number) => ({ expressId: renderId, ifcType: 'IfcCovering', positions: new Float32Array([0, y, 0, 4, y, 0, 4, y, 3, 0, y, 3]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
    publishDrawingRuntime({ geometryResult: { meshes: [slab(100, 2.7), slab(101, 2.4)], coordinateInfo: undefined } as never, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    ceilTag(talkingContext(), () => true, guidOf);
    assert.equal(ceilingTexts().length, 2);
    assert.equal(said().some((l) => l.startsWith('drafting.msg.ceilTagStacked')), false);
  });
});

describe('CEILTAG remembers the ceilings that share a tag (#271)', () => {
  it('does not tag the covering that was under another when the first of the pair is gone', () => {
    loadCoveringPair();
    ceilTag(talkingContext(), () => true, guidOf);
    // The model comes back with only the second covering of the pair (and the third): its spot is already tagged.
    const slab = (renderId: number, x: number) => ({ expressId: renderId, ifcType: 'IfcCovering', positions: new Float32Array([x, 2.7, 0, x + 4, 2.7, 0, x + 4, 2.7, 3, x, 2.7, 3]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
    publishDrawingRuntime({ geometryResult: { meshes: [slab(101, 0), slab(102, 10)], coordinateInfo: undefined } as never, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    ceilTag(talkingContext(), () => true, guidOf);
    assert.equal(ceilingTexts().length, 2);
  });
});

describe('CEILTAG height text follows the language (#269)', () => {
  it('prints +2,70 in ro and +2.70 in en, and re-writes when the language changes', async () => {
    const { setLocale, registerLocale } = await import('@/i18n');
    registerLocale('ro', {});
    const { refreshCeilingTags } = await import('@/rcp/ceiling-tag-sync');
    loadCeiling(100);
    setLocale('ro');
    ceilTag(context(), () => true, SAME_GUID);
    const text = () => { const s = ceilingTexts()[0].shape; return s.type === 'text' ? s.text : ''; };
    assert.equal(text(), '+2,70');
    setLocale('en');
    refreshCeilingTags('en');
    assert.equal(text(), '+2.70');
    refreshCeilingTags('ro');
    assert.equal(text(), '+2,70');
    setLocale('en');
  });
});
