/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #676: a tag can show the element's IFC Name or the Name of its type, and the choice is on the Tag card, saved with
 * the project and restored on open. Over the real FZK-Haus; and, when it is on this machine, over the model where
 * the report came from (Bonsai names every sanitary terminal "SanitaryTerminal" and keeps "Neufert Shower 90x90" on its type).
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MutablePropertyView } from '@ifc-lite/mutations';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { configureMutationView } from '@/utils/configureMutationView';
import { labelElementOf } from '@/labels/label-element';
import { elementLabel } from '@/tagfields/element-tag.js';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store.js';
import { parseProjectFile, serializeProject } from '@/project/project-file.js';
import { tagCommand } from '@/drafting/commands/tag';
import type { DraftContext } from '@/drafting/commands/types';
import { defaultDraftSettings } from '@/drafting/session-settings';
import { TagShows } from '@/components/viewer/wall/TagShows.js';

const LLOYD = '/Users/petruc/dev/bimvoice/_workspace/models/lloyd/ifc-from-bonsai-2026-11-03.ifc';

const choose = (el: HTMLSelectElement, value: string) => act(() => {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
});

async function seed(path: string): Promise<ReturnType<typeof parseStep> extends Promise<infer S> ? S : never> {
  const store = await parseStep(readFileSync(path));
  seedModel('m', 0, store, 1);
  const view = new MutablePropertyView(store.properties ?? null, 'm');
  configureMutationView(view, store);
  useViewerStore.setState({ mutationViews: new Map([['m', view]]) });
  return store;
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('what a tag shows: Name or the type (#676)', () => {
  it('shows the IFC Name, and the Name of the type, as two different choices (FZK-Haus)', async () => {
    const store = await seed(resolve(process.cwd(), 'src/test/__fixtures__/AC20-FZK-Haus.ifc'));
    const id = [...(store.entityIndex.byType.get('IFCDOOR') ?? [])][0];
    const el = labelElementOf('m', id)!;
    const guid = el.attribute('GlobalId');
    assert.equal(elementLabel(guid, 'name'), el.attribute('Name') || '?');
    assert.ok(el.typeName(), 'the FZK door has a type');
    assert.equal(elementLabel(guid, 'typeName'), el.typeName());
  });

  it('a Tag tool already running places its next tag with the field chosen on the card (single tag)', async () => {
    const store = await seed(resolve(process.cwd(), 'src/test/__fixtures__/AC20-FZK-Haus.ifc'));
    const id = [...(store.entityIndex.byType.get('IFCDOOR') ?? [])][0];
    const el = labelElementOf('m', id)!;
    const ctx = { viewId: 'v', layerId: '0', settings: defaultDraftSettings(), say: () => {}, elementAt: () => id } as unknown as DraftContext;
    const step = tagCommand.create(ctx);
    useProjectStore.setState({ tagField: 'typeName' });
    step.onPoint?.({ x: 0, y: 0 });
    step.onPoint?.({ x: 1, y: 1 });
    const placed = useProjectStore.getState().drafts.find((d) => d.params.tagOf === el.attribute('GlobalId'));
    assert.equal(placed?.params.tagField, 'typeName');
    assert.equal(placed?.shape.type === 'leader' ? placed.shape.text : null, el.typeName());
  });

  it('the Tag card offers Name and Type name, and the choice is saved with the project and restored on open', () => {
    const ui = render(<TagShows />);
    const select = ui.querySelector('select') as HTMLSelectElement;
    const options = [...select.options].map((o) => o.value);
    assert.ok(options.includes('name') && options.includes('typeName') && options.includes('class'), options.join(','));
    choose(select, 'typeName');
    assert.equal(useProjectStore.getState().tagField, 'typeName');
    const file = serializeProject(projectDocument());
    resetProject();
    assert.equal(useProjectStore.getState().tagField, undefined);
    loadProjectDocument(parseProjectFile(file));
    assert.equal(useProjectStore.getState().tagField, 'typeName');
    choose(select, 'mark');
    assert.equal(useProjectStore.getState().tagField, undefined, 'the mark is the default: nothing is written');
  });

  it('a file with a field that is not a tag field opens with the default', () => {
    const doc = JSON.parse(serializeProject(projectDocument())) as Record<string, unknown>;
    doc.tagField = 'nonsense';
    loadProjectDocument(parseProjectFile(JSON.stringify(doc)));
    assert.equal(useProjectStore.getState().tagField, undefined);
  });

  it('on the sanitary terminals of the Bonsai model, Name says the class word and Type name says the shower and the sink', async (t) => {
    if (!existsSync(LLOYD)) return t.skip('the model of the report is not on this machine');
    const store = await seed(LLOYD);
    const names = new Map<string, string>();
    for (const id of store.entityIndex.byType.get('IFCSANITARYTERMINAL') ?? []) {
      const guid = labelElementOf('m', id)!.attribute('GlobalId');
      names.set(elementLabel(guid, 'typeName') ?? '', elementLabel(guid, 'name') ?? '');
    }
    assert.ok(names.has('Neufert Shower 90x90') && names.has('Generic Large Sink'), [...names.keys()].join(', '));
    for (const name of names.values()) assert.equal(name, 'SanitaryTerminal');
  });
});
