/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PR #121 review: an unknown graphic standard id (a file from a newer app)
 * was handled two ways: a `.bvlib` naming one was rejected whole, a project
 * file naming one fell back to the default in silence. Both now fall back to
 * the default and say so in a toast.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { Toaster } from '@/components/ui/toast';
import { cleanup, render } from '@/test/render.js';
import { toastsFrom } from '@/test/toasts.js';
import { EMPTY_PROJECT, loadProjectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { serializeCatalogue } from './catalogue-file';
import { builtInLibrary, importCatalogueText } from './catalogue-store';

const FUTURE = 'iso-9999';

let root: HTMLElement;
beforeEach(() => {
  resetProject();
  root = render(<Toaster />);
});
afterEach(() => cleanup());

describe('an unknown graphic standard id', () => {
  it('in a .bvlib: the library still imports, the standard falls back to the default, and a toast says so', () => {
    useProjectStore.setState({ graphicStandard: 'ro-practice' });
    const { name, catalogue } = builtInLibrary('ro-practice');
    const file = JSON.stringify({ ...JSON.parse(serializeCatalogue(catalogue, name)), graphicStandard: FUTURE });
    let report: ReturnType<typeof importCatalogueText> | undefined;
    const shown = toastsFrom(root, () => act(() => { report = importCatalogueText(file, 'theirs'); }));
    assert.ok(report, 'the import is not rejected');
    assert.equal(useProjectStore.getState().graphicStandard, undefined, 'the default, as if the file named it');
    assert.ok(useProjectStore.getState().textStyles?.some((t) => t.id === 'ro-title-50'), 'the rest of the library was imported');
    assert.match(shown, new RegExp(FUTURE));
  });

  it('in a project file: the project opens on the default standard, and a toast says so', () => {
    const text = JSON.stringify({ ...JSON.parse(serializeProject({ ...EMPTY_PROJECT, name: 'Casa' })), graphicStandard: FUTURE });
    const shown = toastsFrom(root, () => act(() => loadProjectDocument(parseProjectFile(text))));
    assert.equal(useProjectStore.getState().name, 'Casa');
    assert.equal(useProjectStore.getState().graphicStandard, undefined);
    assert.match(shown, new RegExp(FUTURE));
  });

  it('a known id opens without a toast', () => {
    const text = serializeProject({ ...EMPTY_PROJECT, graphicStandard: 'ro-practice' });
    const shown = toastsFrom(root, () => act(() => loadProjectDocument(parseProjectFile(text))));
    assert.equal(useProjectStore.getState().graphicStandard, 'ro-practice');
    assert.equal(shown, '');
  });
});
