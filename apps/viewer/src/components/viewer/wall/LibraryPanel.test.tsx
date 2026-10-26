/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act, useRef } from 'react';
import { activate, cleanup, click, press, render } from '@/test/render.js';
import { clearDownloads, downloadedNames } from '@/test/download-capture.js';
import { CATALOGUE_FILE_VERSION, serializeCatalogue, type Catalogue } from '@/catalogue/catalogue-file';
import { projectCatalogue } from '@/catalogue/catalogue-store';
import { attachDraftingView, baseDraftSettings, cancelCommand, clickDrawing, patchDraftSettings, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { clearDraftHistory } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useDraftingKeys } from '../drafting/useDraftingKeys.js';
import { InfoCard } from './InfoCard.js';
import { LibraryPanel } from './LibraryPanel.js';

/**
 * The library file on the Wall: the panel the project drawer mounts. A
 * library leaves one project through "Export library", and arrives in a
 * different one through "Import library", where the rail's tools offer it.
 */

const OFFICE: Partial<ReturnType<typeof useProjectStore.getState>> = {
  name: 'Office A',
  hatchPatterns: '*MY-LINES, test\n0, 0,0, 0,2\n',
  annotationTypes: [
    { id: 'a2', name: 'Door tag', tool: 'tag', tagField: 'name' },
    { id: 'a3', name: 'Section fill', tool: 'hatch', hatch: { pattern: 'MY-LINES', scale: 2, angle: 45 } },
  ],
  symbols: [{ id: 's1', name: 'Arrow', unit: 'paper', shapes: [{ type: 'polyline', pts: [{ x: 0, y: 0 }, { x: 2, y: 6 }, { x: -2, y: 6 }], closed: true }] }],
};

const blobs: Blob[] = [];
URL.createObjectURL = (b: Blob | MediaSource): string => {
  blobs.push(b as Blob);
  return `blob:wall-library-${blobs.length}`;
};

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDownloads();
  blobs.length = 0;
  patchDraftSettings({ annotationType: null, symbolId: null, hatchPattern: 'LINES45', hatchScale: 1, hatchAngle: 0 });
});
afterEach(() => cleanup());

const button = (ui: HTMLElement, text: string | RegExp) => {
  const b = [...ui.querySelectorAll('button')].find((x) => (typeof text === 'string' ? x.textContent === text : text.test(x.textContent ?? '')));
  assert.ok(b, `a button ${String(text)}`);
  return b;
};

/** Choose `text` as the library file, as the file dialog would hand it over. */
async function pick(ui: HTMLElement, text: string): Promise<void> {
  const input = ui.querySelector<HTMLInputElement>('input[type=file]');
  assert.ok(input);
  Object.defineProperty(input, 'files', { configurable: true, value: [new File([text], 'in.bvlib')] });
  await act(async () => {
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

/** The library text the panel exports from the project as it stands. */
async function exportedText(): Promise<string> {
  const ui = render(<LibraryPanel />);
  click(button(ui, 'Export library'));
  click(button(ui, /^Download /));
  assert.equal(blobs.length, 1);
  return blobs[0].text();
}

async function importInto(ui: HTMLElement, text: string): Promise<void> {
  click(button(ui, 'Import library'));
  await pick(ui, text);
}

const reportText = (ui: HTMLElement) => ui.querySelector('[data-testid="wall-library-report"]')?.textContent ?? '';
const incomingTag = (over: Partial<Catalogue['annotationTypes'][number]> = {}): string =>
  serializeCatalogue({ ...projectCatalogue(), layers: [], textStyles: [], dimStyles: [], hatchPatterns: '', materials: [], symbols: [], annotationTypes: [{ id: 'x1', name: 'Door tag', tool: 'tag', tagField: 'mark', ...over }] }, 'Theirs');

/** The drafting view's key handler, as DraftingView mounts it, with a spy for what it would submit. */
function KeysHarness({ submitted }: { submitted: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useDraftingKeys({ inputRef, setText: () => {}, submit: () => { submitted.push('submit'); } });
  return <input ref={inputRef} aria-label="command line" />;
}

describe('the library on the Wall', () => {
  it('carries a library from one project to a different one, and the rail offers what arrived', async () => {
    useProjectStore.setState(OFFICE);
    const file = await exportedText();
    assert.deepEqual(downloadedNames(), ['Office A.bvlib']);
    cleanup();

    // A different model: a project that holds none of it.
    resetProject();
    useProjectStore.setState({ name: 'Other model' });
    assert.equal((useProjectStore.getState().annotationTypes ?? []).length, 0);
    const ui = render(<LibraryPanel />);
    await importInto(ui, file);
    click(button(ui, 'Import'));
    const after = useProjectStore.getState();
    assert.deepEqual((after.annotationTypes ?? []).map((t) => t.name), ['Door tag', 'Section fill']);
    assert.ok((after.hatchPatterns ?? '').includes('*MY-LINES'));
    assert.deepEqual((after.symbols ?? []).map((s) => s.name), ['Arrow']);
    assert.match(reportText(ui), /Annotation types 2 added, 0 kept, 0 replaced, 0 renamed/);
    cleanup();

    // The rail's tag tool offers the imported type and draws with it.
    const tag = render(<InfoCard tool="tag" onDone={() => {}} />);
    const select = tag.querySelector('select');
    assert.ok(select);
    assert.deepEqual([...select.options].map((o) => o.textContent), ['Plain (no type)', 'Door tag']);
    const id = (after.annotationTypes ?? []).find((t) => t.name === 'Door tag')?.id ?? '';
    await act(async () => {
      select.value = id;
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.deepEqual(baseDraftSettings().annotationType, { id, tool: 'tag' });
    assert.equal(baseDraftSettings().tagField, 'name');
    cleanup();

    // The hatch tool: the imported pattern is listed, and the imported type sets pattern, scale and angle.
    const hatch = render(<InfoCard tool="hatch" onDone={() => {}} />);
    const [typeSelect, patternSelect] = [...hatch.querySelectorAll('select')];
    assert.ok([...patternSelect.options].some((o) => o.value === 'MY-LINES'));
    const hatchId = (after.annotationTypes ?? []).find((t) => t.name === 'Section fill')?.id ?? '';
    await act(async () => {
      typeSelect.value = hatchId;
      typeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.deepEqual([baseDraftSettings().hatchPattern, baseDraftSettings().hatchScale, baseDraftSettings().hatchAngle], ['MY-LINES', 2, 45]);
    cleanup();

    // The symbol tool lists the imported symbol after the built-in ones.
    const symbol = render(<InfoCard tool="symbol" onDone={() => {}} />);
    assert.ok([...(symbol.querySelector('select')?.options ?? [])].some((o) => o.textContent === 'Arrow'));
  });

  it('keeps mine on a clash by default, and says so', async () => {
    useProjectStore.setState({ annotationTypes: [{ id: 'm1', name: 'Door tag', tool: 'tag', tagField: 'class' }] });
    const ui = render(<LibraryPanel />);
    await importInto(ui, incomingTag());
    assert.match(reportText(ui), /Annotation types 0 added, 1 kept, 0 replaced, 0 renamed/);
    click(button(ui, 'Import'));
    assert.deepEqual(useProjectStore.getState().annotationTypes, [{ id: 'm1', name: 'Door tag', tool: 'tag', tagField: 'class' }]);
    assert.match(reportText(ui), /1 kept/);
  });

  it('takes theirs on a clash, keeping the project\'s id', async () => {
    useProjectStore.setState({ annotationTypes: [{ id: 'm1', name: 'Door tag', tool: 'tag', tagField: 'class' }] });
    const ui = render(<LibraryPanel />);
    await importInto(ui, incomingTag());
    click(button(ui, 'Take theirs'));
    assert.match(reportText(ui), /0 added, 0 kept, 1 replaced, 0 renamed/);
    click(button(ui, 'Import'));
    assert.deepEqual(useProjectStore.getState().annotationTypes, [{ id: 'm1', name: 'Door tag', tool: 'tag', tagField: 'mark' }]);
    assert.match(reportText(ui), /1 replaced/);
  });

  it('keeps both on a clash, the incoming one under a new name', async () => {
    useProjectStore.setState({ annotationTypes: [{ id: 'm1', name: 'Door tag', tool: 'tag', tagField: 'class' }] });
    const ui = render(<LibraryPanel />);
    await importInto(ui, incomingTag());
    click(button(ui, 'Keep both'));
    assert.match(reportText(ui), /0 added, 0 kept, 0 replaced, 1 renamed/);
    click(button(ui, 'Import'));
    assert.deepEqual((useProjectStore.getState().annotationTypes ?? []).map((t) => [t.name, t.tagField]), [['Door tag', 'class'], ['Door tag (2)', 'mark']]);
  });

  it('changes nothing until Import is pressed', async () => {
    const ui = render(<LibraryPanel />);
    const before = projectCatalogue();
    await importInto(ui, incomingTag({ name: 'Fresh tag' }));
    assert.match(reportText(ui), /1 added/);
    assert.deepEqual(projectCatalogue(), before);
  });

  for (const [what, text, message] of [
    ['a broken file', '{"format": "bvlib", "version": 1, "layers": 5', /invalid JSON/],
    ['a file of another format', JSON.stringify({ format: 'other', version: 1 }), /\/format/],
    ['a file from a newer version', JSON.stringify({ format: 'bvlib', version: CATALOGUE_FILE_VERSION + 1 }), /newer version of the app/],
    ['an entry that is not an annotation type', JSON.stringify({ format: 'bvlib', version: 1, annotationTypes: [{ id: 5 }] }), /annotationTypes/],
  ] as const) {
    it(`refuses ${what} with the reader's message and changes nothing`, async () => {
      useProjectStore.setState(OFFICE);
      const before = structuredClone(projectCatalogue());
      const dirty = useProjectStore.getState().dirty;
      const ui = render(<LibraryPanel />);
      await importInto(ui, text);
      const alert = ui.querySelector('[role=alert]');
      assert.ok(alert, 'a refusal is shown');
      assert.match(alert.textContent ?? '', message);
      assert.equal([...ui.querySelectorAll('button')].some((b) => b.textContent === 'Import'), false, 'nothing to apply');
      assert.deepEqual(projectCatalogue(), before);
      assert.equal(useProjectStore.getState().dirty, dirty);
    });
  }

  it('exports only the kinds that are chosen', async () => {
    useProjectStore.setState(OFFICE);
    const ui = render(<LibraryPanel />);
    click(button(ui, 'Export library'));
    for (const box of ui.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
      const label = box.closest('label')?.textContent ?? '';
      if (!label.startsWith('Annotation types')) click(box);
    }
    click(button(ui, /^Download /));
    const file = JSON.parse(await blobs[0].text()) as Catalogue;
    assert.equal(file.annotationTypes.length, 2);
    assert.deepEqual([file.symbols.length, file.hatchPatterns, file.layers.length], [0, '', 0]);
  });

  it('leaves a running tool alone', async () => {
    attachDraftingView('plan-1', 'down', () => []);
    clearDraftHistory();
    startDraftCommand('line');
    clickDrawing({ x: 1, y: 1 }, 0.05, false);
    const running = runningCommand();
    assert.ok(running, 'LINE is waiting for its second point');
    const history = useDraftingSession.getState().history.length;
    const drafts = useProjectStore.getState().drafts.length;

    const ui = render(<LibraryPanel />);
    await importInto(ui, incomingTag({ name: 'Fresh tag' }));
    click(button(ui, 'Import'));
    assert.equal((useProjectStore.getState().annotationTypes ?? []).length, 1, 'the import went in');
    assert.equal(runningCommand(), running);
    assert.equal(useDraftingSession.getState().history.length, history);
    assert.equal(useProjectStore.getState().drafts.length, drafts);
  });

  it('keeps Enter and Space for its buttons while a tool is running, instead of confirming the tool', () => {
    const submitted: string[] = [];
    const ui = render(<><KeysHarness submitted={submitted} /><LibraryPanel /></>);
    const exportButton = button(ui, 'Export library');
    press(exportButton, 'Enter');
    press(exportButton, ' ');
    assert.deepEqual(submitted, [], 'nothing reached the command line');
    // The same key from outside the panel still confirms, so the guard is the panel's and not a dead hook.
    press(ui.querySelector('input[aria-label="command line"]')!.parentElement ?? document.body, 'Enter');
    assert.deepEqual(submitted, ['submit']);
    activate(exportButton);
    assert.equal(ui.querySelector('section[aria-label="Export library"]') !== null, true, 'Enter pressed the button');
  });
});
