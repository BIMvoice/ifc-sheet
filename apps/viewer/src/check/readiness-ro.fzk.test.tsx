/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #403: the model-readiness list printed English under Română because `face.ro.ts` lacked the findings' keys.
 * AC20-FZK-Haus lacks materials and quantities on some elements, so the list renders those findings; in Romanian
 * they read Romanian, with the counts filled in, and nothing of the English sentence is left.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { registerLocale, setLocale } from '@/i18n';
import ro from '@/i18n/locales/ro';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { useViewerStore } from '@/store';
import { resetProject } from '@/project/project-store';
import { loadUrbanModel, urbanWasm } from '@/test/urban-fixture';
import { ReadinessList } from '@/components/viewer/sheets/ReadinessList';
import { WALL_SKIN } from '@/components/viewer/sheets/set-skin';
import { modelReadiness } from './readiness';
import { currentModelFacts } from './readiness-read';

const FZK = resolve(import.meta.dirname, '../../src/test/__fixtures__/AC20-FZK-Haus.ifc');

describe('the readiness list in Romanian (#403)', () => {
  beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map(), mutationViews: new Map() }); });
  afterEach(() => { cleanup(); act(() => setLocale('en')); });

  it('writes the material and quantity findings in Romanian, not English', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const f = modelReadiness(currentModelFacts()).filter((x) => x.kind === 'noMaterials' || x.kind === 'noQuantities');
    assert.ok(f.length > 0, 'FZK has elements without material or quantities');
    registerLocale('ro', checkCatalogue(ro).catalogue);
    act(() => setLocale('ro'));
    const text = render(<ReadinessList skin={WALL_SKIN} />).textContent ?? '';
    assert.match(text, /Elemente fără material: \d+ din \d+\./, text);
    assert.match(text, /Extrasul de materiale le lasă deoparte/, text);
    assert.doesNotMatch(text, /have no material|elements are on no storey|have no quantity|The material takeoff/, text);
  });
});
