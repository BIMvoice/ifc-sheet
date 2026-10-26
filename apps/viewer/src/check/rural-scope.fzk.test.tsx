/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { resetProject } from '@/project/project-store';
import { loadUrbanModel, urbanWasm } from '@/test/urban-fixture';
import { collectUrbanAreas } from '@/urban/urban-models';
import { urbanIndicators } from '@/urban/indicators';
import { setLocale } from '@/i18n/registry';
import { pacSection } from '@/components/viewer/wall/drawer-sections/pac';
import { ruralScopeFindings } from './rural-scope';

/**
 * AC20-FZK-Haus against Anexa 3: two storeys above ground (Erdgeschoss at 0, Dachgeschoss at 2.7), so P + M holds; each storey's
 * built area is 120.00 m² (`urban/urban-fzk.test.ts`), so Sd is 240.00 m², over the 150 m² the simplified PAC covers.
 */

const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);

beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map(), mutationViews: new Map() }); });
afterEach(() => { cleanup(); act(() => setLocale('en')); });

describe('the FZK house against the simplified PAC', () => {
  it('has two levels (no levels finding) and Sd 240 m² (the area finding), shown in the drawer in the rural mode only', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const result = urbanIndicators({ ...collectUrbanAreas(), siteArea: 600 });
    assert.equal(result.storeys.filter((s) => s.elevation >= 0).length, 2);
    assert.deepEqual(ruralScopeFindings(result).map((f) => f.key), ['pac.rural.scope.area']);

    const Section = pacSection.component;
    const ui = render(<Section go={() => undefined} onClose={() => undefined} extent={null} />);
    assert.equal(ui.querySelector('[data-pac-scope]'), null, 'the standard PAC has no such limit');
    act(() => { ui.querySelector<HTMLButtonElement>('[data-pac-mode="rural"]')!.click(); });
    assert.equal(ui.querySelector('[data-pac-scope]')?.textContent, 'The model\'s built gross area (Sd) is 240.0 m²; the simplified PAC (Anexa 3) covers at most 150 m².');
    act(() => { ui.querySelector<HTMLButtonElement>('[data-pac-mode="standard"]')!.click(); });
    assert.equal(ui.querySelector('[data-pac-scope]'), null);
  });
});
