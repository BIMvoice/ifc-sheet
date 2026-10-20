/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The level mark's number in the properties panel: typing one detaches the
 * mark from its reference, the panel then says the number is manual, and a
 * button takes the mark back to the model.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blur, cleanup, click, render, type } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, newDraft } from '@/drafting/draft-store';
import { setLevelReferenceProviders } from '@/drafting/session';
import type { LevelShape } from '@/drafting/level-mark';
import { AnnotationFields } from './AnnotationFields.js';

const mark: LevelShape = { type: 'level', p: { x: 4, y: 2 }, value: 2, height: 0.25, ref: { at: { x: 0, y: 2 } } };

function Panel({ id }: { id: string }) {
  const entity = useProjectStore((s) => s.drafts.find((d) => d.id === id));
  if (!entity || entity.shape.type !== 'level') return null;
  return <AnnotationFields entity={entity} shape={entity.shape} extraPatterns={[]} />;
}

const stored = (id: string): LevelShape => {
  const shape = useProjectStore.getState().drafts.find((d) => d.id === id)?.shape;
  assert.ok(shape?.type === 'level');
  return shape as LevelShape;
};

let id = '';
beforeEach(() => {
  resetProject();
  clearDraftHistory();
  const draft = newDraft('view-1', '0', mark);
  id = draft.id;
  useProjectStore.setState({ drafts: [draft] });
  // A section: the number is the height of the measured point.
  setLevelReferenceProviders((p) => ({ at: p }), (r) => r.at.y);
});
afterEach(cleanup);

describe('the level number in the properties panel', () => {
  it('says nothing is manual while the mark follows its reference', () => {
    const root = render(<Panel id={id} />);
    assert.equal(root.querySelector('[data-testid="level-manual"]'), null);
  });

  it('typing a number detaches the mark, keeps the symbol where it is, and the panel says the number is manual', () => {
    const root = render(<Panel id={id} />);
    const input = root.querySelector('input[aria-label="Level (m)"]') as HTMLInputElement;
    type(input, '7.5');
    blur(input);
    const after = stored(id);
    assert.equal(after.value, 7.5);
    assert.equal(after.ref, undefined, 'the reference is dropped');
    assert.deepEqual(after.p, mark.p);
    assert.match(root.querySelector('[data-testid="level-manual"]')?.textContent ?? '', /Manual number/);
  });

  it('"Follow the model" measures the point under the symbol again and takes the number from it', () => {
    const root = render(<Panel id={id} />);
    const input = root.querySelector('input[aria-label="Level (m)"]') as HTMLInputElement;
    type(input, '7.5');
    blur(input);
    click(root.querySelector('[data-testid="level-manual"] button')!);
    const after = stored(id);
    assert.deepEqual(after.ref, { at: mark.p });
    assert.equal(after.value, mark.p.y, 'the number is the height at the symbol');
    assert.equal(root.querySelector('[data-testid="level-manual"]'), null);
  });

  it('a mark saved before references existed also shows the way to the model', () => {
    const old = newDraft('view-1', '0', { type: 'level', p: { x: 1, y: 3 }, value: 9, height: 0.25 });
    useProjectStore.setState({ drafts: [old] });
    const root = render(<Panel id={old.id} />);
    click(root.querySelector('[data-testid="level-manual"] button')!);
    assert.equal(stored(old.id).value, 3);
  });
});
