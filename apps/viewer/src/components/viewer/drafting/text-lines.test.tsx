/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drafted text on more than one line (#673): the editor of a one-line text takes a second line (Shift+Enter; Enter finishes),
 * the command line does the same while a text is asked for, and the view's DXF writes one TEXT per line, a line pitch apart.
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render, type as typeInto } from '@/test/render.js';
import { newDraft } from '@/drafting/draft-store';
import { useDraftingSession } from '@/drafting/session';
import type { DraftLayer } from '@/drafting/types';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { CommandLine } from './CommandLine';
import { SelectionBar } from './SelectionBar';
import { viewDxf } from './view-dxf';

let id = '';
const draft = () => useProjectStore.getState().drafts.find((d) => d.id === id)!;
const textOf = () => { const { shape } = draft(); return shape.type === 'text' ? shape.text : ''; };

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

describe('a drafted text takes a second line (#673)', () => {
  it('opens a one-line text in a box that keeps a line break, and Enter finishes', () => {
    const ui = render(<Bar />);
    const box = ui.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit text"]')!;
    assert.ok(box, 'a multi-line box, not a one-line input');
    typeInto(box, 'Kitchen\nEI 60');
    press(box, 'Enter', { shiftKey: true });
    assert.equal(textOf(), 'Kitchen', 'Shift+Enter is a new line, not the end of the edit');
    press(box, 'Enter');
    assert.equal(textOf(), 'Kitchen\nEI 60');
  });

  it('the command line keeps a line break while a text is asked for, and takes none for a command', () => {
    const seen: string[] = [];
    const Line = ({ text }: { text: string }) => <CommandLine value={text} onChange={(v) => seen.push(v)} onSubmit={() => seen.push('submit')} onEscape={() => {}} />;
    useDraftingSession.setState({ prompt: { key: 'textLines.prompt' } });
    const ui = render(<Line text={'A\nB'} />);
    const field = ui.querySelector<HTMLTextAreaElement>('textarea[data-command-line]')!;
    assert.equal(Number(field.rows), 2);
    press(field, 'Enter', { shiftKey: true });
    assert.deepEqual(seen, [], 'Shift+Enter is left to the field: a new line, no submit');
    press(field, 'Enter');
    assert.deepEqual(seen, ['submit']);
    typeInto(field, 'A\nB\nC');
    assert.equal(seen.at(-1), 'A\nB\nC');
    cleanup();
    useDraftingSession.setState({ prompt: { key: 'drafting.prompt.idle' } });
    const plain = render(<Line text="" />);
    typeInto(plain.querySelector<HTMLTextAreaElement>('textarea[data-command-line]')!, 'LINE\nX');
    assert.equal(seen.at(-1), 'LINE X', 'a command is one line');
  });
});

describe("a two-line text in a view's DXF (#673)", () => {
  const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => DOMMatrix };
  const own = Object.getOwnPropertyDescriptor(proto, 'getScreenCTM');
  before(() => { proto.getScreenCTM = () => new DOMMatrix(); });
  after(() => {
    if (own) Object.defineProperty(proto, 'getScreenCTM', own);
    else delete proto.getScreenCTM;
  });
  it('writes one TEXT per line, a line pitch apart, from the same anchor', () => {
    const view = { id: 'v', name: 'Plan', kind: 'plan', level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, auto: false, createdAt: 0, scale: 100 } as ProjectView;
    const layer: DraftLayer = { id: 'L', name: 'Notes', color: '#000000', visible: true, locked: false };
    const two = newDraft('v', 'L', { type: 'text', p: { x: 1, y: 2 }, text: 'Kitchen\nEI 60', height: 0.25, rotation: 0 }, {});
    const dxf = new TextDecoder('latin1').decode(viewDxf({ view, drawing: null, axis: 'down', drafts: [two], layers: [layer], extraPatterns: [], overlays: [], symbols: null }));
    const rows = dxf.split(/\r?\n/);
    // One entity at a time: its group codes up to the next `0`.
    const texts: Map<string, string>[] = [];
    for (let i = 0; i + 1 < rows.length; i += 2) {
      if (rows[i].trim() === '0' && rows[i + 1] === 'TEXT') texts.push(new Map());
      else if (rows[i].trim() === '0') texts.push(new Map([['end', '1']]));
      else texts.at(-1)?.set(rows[i].trim(), rows[i + 1]);
    }
    const lines = texts.filter((t) => t.get('1') === 'Kitchen' || t.get('1') === 'EI 60');
    assert.equal(lines.length, 2, `TEXTs: ${texts.map((t) => t.get('1')).join(' | ')}`);
    const [a, b] = lines.map((t) => ({ x: Number(t.get('10')), y: Number(t.get('20')), h: Number(t.get('40')) }));
    assert.ok(Math.abs(a.x - b.x) < 1e-6, 'the same left edge');
    // The sheet draws a line under the one before (DXF y runs up); the pitch itself is the engine's (text-block.test.ts), not measured here: happy-dom has no font size.
    assert.ok(a.y > b.y, `the second line is under the first: ${a.y} ${b.y}`);
  });
});
