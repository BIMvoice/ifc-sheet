/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newDraft } from '@/drafting/draft-store';
import { textBox } from '@/drafting/annotation';
import { centredAnchor, classesOf, planTagAll, type LabelTarget } from './label-place.js';

const t = (guid: string, className: string, x = 0): LabelTarget => ({ guid, className, anchor: { x, y: 0 } });
const existing = (guid: string, atype: string) => newDraft('v', '0', { type: 'text', p: { x: 0, y: 0 }, text: 'x', height: 0.25, rotation: 0 }, { labelOf: guid, atype });

describe('planTagAll', () => {
  const targets = [t('a', 'IfcWall'), t('b', 'IfcWall'), t('c', 'IfcDoor'), t('d', 'IfcWall')];
  it('takes the elements of the class, in order', () => {
    assert.deepEqual(planTagAll(targets, 'IfcWall', 'at1', []).map((x) => x.guid), ['a', 'b', 'd']);
  });
  it('skips those that already have this label type, and not those with another', () => {
    const drafts = [existing('b', 'at1'), existing('d', 'at-other')];
    assert.deepEqual(planTagAll(targets, 'IfcWall', 'at1', drafts).map((x) => x.guid), ['a', 'd']);
  });
  it('is empty when all are labelled, so running it twice adds nothing', () => {
    const drafts = planTagAll(targets, 'IfcWall', 'at1', []).map((x) => existing(x.guid, 'at1'));
    assert.deepEqual(planTagAll(targets, 'IfcWall', 'at1', drafts), []);
  });
  it('names the class without regard to case and labels an element once', () => {
    assert.deepEqual(planTagAll([...targets, t('a', 'IfcWall')], 'ifcwall', 'at1', []).map((x) => x.guid), ['a', 'b', 'd']);
  });
});

describe('classesOf', () => {
  it('counts elements per class, most first', () => {
    assert.deepEqual(classesOf([t('a', 'IfcWall'), t('b', 'IfcWall'), t('c', 'IfcDoor'), t('a', 'IfcWall')]), [{ className: 'IfcWall', count: 2 }, { className: 'IfcDoor', count: 1 }]);
  });
});

describe('centredAnchor', () => {
  it('puts the middle of the block on the point, framed or not, one line or several', () => {
    for (const [text, frame] of [['W-01', undefined], ['W-01\n4.29 m', 'box'], ['A', 'bubble']] as const) {
      const anchor = centredAnchor({ x: 10, y: 5 }, text, 0.25, frame, 1);
      const box = textBox(anchor, text, 0.25, 0, frame);
      const cx = (Math.min(...box.map((p) => p.x)) + Math.max(...box.map((p) => p.x))) / 2;
      assert.ok(Math.abs(cx - 10) < 1e-9, `${text}: x centre ${cx}`);
      // The glyphs span 0.8 heights above the first baseline to 0.25 below the last.
      const lastY = (text.split('\n').length - 1) * 1.25 * 0.25;
      const glyphMid = (anchor.y + 0.8 * 0.25 + (anchor.y - lastY - 0.25 * 0.25)) / 2;
      assert.ok(Math.abs(glyphMid - 5) < 1e-9, `${text}: y centre ${glyphMid}`);
    }
  });
});
