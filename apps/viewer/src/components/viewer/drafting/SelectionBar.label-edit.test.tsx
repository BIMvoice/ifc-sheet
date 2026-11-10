/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/**
 * The pencil on a label TAGALL placed (#542): a room's three-line label opens as three lines, and what is typed is kept as the
 * label's own text (the amber ring says so), not dropped when the label is re-read from the model; "Reset" takes the model's back.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render, type as typeInto } from '@/test/render.js';
import { newDraft } from '@/drafting/draft-store';
import { tagOverrideOf } from '@/drafting/tag-override';
import { resetProject, useProjectStore } from '@/project/project-store';
import { SelectionBar } from './SelectionBar';

const ROOM = 'Dormitor ap.2\nDormitor ap.2\n14.49 m²';
let id = '';
const draft = () => useProjectStore.getState().drafts.find((d) => d.id === id)!;
const textOf = () => { const { shape } = draft(); return shape.type === 'text' ? shape.text : ''; };

function Bar({ editing }: { editing: boolean }) {
  const entity = useProjectStore((s) => s.drafts.find((d) => d.id === id))!;
  return <SelectionBar entity={entity} transform={{ scale: 1, offsetX: 0, offsetY: 0 } as never} axis={'y' as never} editing={editing} onEditingChange={() => {}} areaWidth={800} />;
}

beforeEach(() => {
  resetProject();
  const d = newDraft('v', '0', { type: 'text', p: { x: 1, y: 2 }, text: ROOM, height: 0.25, rotation: 0 }, { labelOf: 'G1', atype: 'tagall-room' });
  id = d.id;
  useProjectStore.setState({ drafts: [d] });
});
afterEach(() => cleanup());

describe('editing the text of a label placed by Tag everything', () => {
  it('opens the three lines as they are, and Enter keeps what was typed as the label\'s own text', () => {
    const ui = render(<Bar editing />);
    const box = ui.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit text"]')!;
    assert.ok(box, 'a multi-line box, not a one-line input');
    assert.equal(box.value, ROOM);
    typeInto(box, 'Dormitor 2\nDormitor 2\n14.49 m²');
    press(box, 'Enter');
    assert.equal(textOf(), 'Dormitor 2\nDormitor 2\n14.49 m²');
    assert.equal(tagOverrideOf(draft()), 'Dormitor 2\nDormitor 2\n14.49 m²');
    assert.equal(draft().params.labelOf, 'G1', 'it still follows its element');
  });
  it('Reset to model value is offered once overridden', () => {
    const ui = render(<Bar editing />);
    typeInto(ui.querySelector<HTMLTextAreaElement>('textarea')!, 'X');
    press(ui.querySelector('textarea')!, 'Enter');
    const reset = [...ui.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Reset to model value')!;
    assert.ok(reset);
    click(reset);
    assert.equal(tagOverrideOf(draft()), null);
  });
});
