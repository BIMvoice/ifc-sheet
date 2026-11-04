/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #674: typing "25.21 m2" in the text editor and in the command line's TEXT prompt stores the real ² (and ³). The browser's undo step is checked in the
 * running app (a fake DOM has no editing history); here the conversion itself and the text it stores are.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render, type as typeInto } from '@/test/render.js';
import { newDraft } from '@/drafting/draft-store';
import { useDraftingSession } from '@/drafting/session';
import { resetProject, useProjectStore } from '@/project/project-store';
import { CommandLine } from './CommandLine';
import { SelectionBar } from './SelectionBar';

let id = '';
const textOf = () => { const shape = useProjectStore.getState().drafts.find((d) => d.id === id)!.shape; return shape.type === 'text' ? shape.text : ''; };

function Bar() {
  const entity = useProjectStore((s) => s.drafts.find((d) => d.id === id))!;
  return <SelectionBar entity={entity} transform={{ scale: 1, offsetX: 0, offsetY: 0 } as never} axis={'y' as never} editing onEditingChange={() => {}} areaWidth={800} />;
}

beforeEach(() => {
  resetProject();
  const d = newDraft('v', '0', { type: 'text', p: { x: 1, y: 2 }, text: 'Kitchen', height: 0.25, rotation: 0 }, {});
  id = d.id;
  useProjectStore.setState({ drafts: [d] });
});
afterEach(() => { cleanup(); useDraftingSession.setState({ prompt: null }); });

describe('m2 and m3 after a number are m² and m³ in a drafted text (#674)', () => {
  it('the text editor stores "Kitchen 25.21 m²", and leaves a sheet named M2 alone', () => {
    const ui = render(<Bar />);
    const box = ui.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit text"]')!;
    typeInto(box, 'Kitchen 25.21 m2');
    press(box, 'Enter');
    assert.equal(textOf(), 'Kitchen 25.21 m²');
    cleanup();
    const again = render(<Bar />);
    const next = again.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit text"]')!;
    typeInto(next, 'Sheet M2 and 12 m3');
    press(next, 'Enter');
    assert.equal(textOf(), 'Sheet M2 and 12 m³');
  });

  it('the command line converts while a text is asked for, and not for a command', () => {
    const seen: string[] = [];
    const Line = () => <CommandLine value="" onChange={(v) => seen.push(v)} onSubmit={() => {}} onEscape={() => {}} />;
    useDraftingSession.setState({ prompt: { key: 'textLines.prompt' } });
    typeInto(render(<Line />).querySelector<HTMLTextAreaElement>('textarea[data-command-line]')!, 'Kitchen 25,2m2');
    assert.equal(seen.at(-1), 'Kitchen 25,2m²');
    cleanup();
    useDraftingSession.setState({ prompt: { key: 'drafting.prompt.idle' } });
    typeInto(render(<Line />).querySelector<HTMLTextAreaElement>('textarea[data-command-line]')!, '5 m2');
    assert.equal(seen.at(-1), '5 m2');
  });
});
