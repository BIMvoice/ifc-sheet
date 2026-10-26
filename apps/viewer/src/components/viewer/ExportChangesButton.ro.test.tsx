/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The toasts of the modified-IFC export (the palette's "Export modified IFC" row opens it), in the language of the
 * interface: the refusal when the overlay changes while the review is open, and the success wording with its plural forms.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { MutablePropertyView } from '@ifc-lite/mutations';
import { PropertyValueType } from '@ifc-lite/data';
import { cleanup, render } from '@/test/render.js';
import { useViewerStore } from '@/store/index.js';
import type { FederatedModel } from '@/store/types.js';
import { registerLocale, setLocale } from '@/i18n/registry';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { toast } from '@/components/ui/toast';
import { ExportChangesButton } from './ExportChangesButton.js';
import { exportOutcomeToast } from './export-changes-toast';

const model: FederatedModel = {
  id: 'model-1', name: 'model-1.ifc', ifcDataStore: null, geometryResult: null, visible: true, collapsed: false,
  schemaVersion: 'IFC4', loadedAt: 1, fileSize: 3, sourceFile: new File([new Uint8Array([1, 2, 3])], 'model-1.ifc'), idOffset: 0, maxExpressId: 0,
};

function editedView(): MutablePropertyView {
  const view = new MutablePropertyView(null, 'model-1');
  view.setOnDemandExtractor((id) => id === 7 ? [{ name: 'Pset_Base', globalId: 'g', properties: [{ name: 'Status', type: PropertyValueType.Label, value: 'Original' }] }] : []);
  view.setProperty(7, 'Pset_Base', 'Status', 'Edited', PropertyValueType.Label);
  return view;
}

const button = (re: RegExp, within: ParentNode = document.body) => [...within.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''));

beforeEach(() => {
  registerLocale('ro', checkCatalogue(ro).catalogue);
  act(() => setLocale('ro'));
  useViewerStore.setState({ models: new Map(), mutationViews: new Map(), mutationVersion: 0, georefMutations: new Map(), ifcDataStore: null });
});
afterEach(() => { cleanup(); act(() => setLocale('en')); });

describe('the modified-IFC export speaks the interface language', () => {
  it('refuses a stale review in Romanian', async () => {
    const view = editedView();
    useViewerStore.setState({ models: new Map([['model-1', model]]), mutationViews: new Map([['model-1', view]]) });
    const error = mock.method(toast, 'error', () => {});
    try {
      const ui = render(<ExportChangesButton surface="palette" />);
      await act(async () => { button(/Export modified IFC|Exportă/, ui)!.click(); });
      // Change the overlay without a tracked set(): the confirm click must notice.
      view.setProperty(7, 'Pset_Base', 'Status', 'Sneaky', PropertyValueType.Label);
      const confirm = [...document.body.querySelectorAll('button')].find((b) => /^(Export|Exportă)$/.test((b.textContent ?? '').trim()));
      assert.ok(confirm, 'the confirm button of the review is on screen');
      await act(async () => { confirm.click(); });
      assert.equal(error.mock.calls[0].arguments[0], 'S-au făcut modificări de când ați deschis această verificare. Verificați lista actualizată și confirmați din nou.');
    } finally {
      error.mock.restore();
    }
  });

  it('words the success with the Romanian plural forms of a change count', () => {
    const file = { base: 'model-1', ext: 'ifc' };
    const say = (changes: number) => exportOutcomeToast({ files: [file], skipped: [], exportedChanges: changes, unrepresented: 0 }).message;
    act(() => setLocale('ro'));
    assert.equal(say(1), 'S-a exportat model-1.ifc (o modificare)');
    assert.equal(say(3), 'S-a exportat model-1.ifc (3 modificări)');
    assert.equal(say(20), 'S-a exportat model-1.ifc (20 de modificări)');
    act(() => setLocale('en'));
    assert.equal(say(1), 'Exported model-1.ifc (1 change)');
    assert.equal(say(2), 'Exported model-1.ifc (2 changes)');
  });

  it('keeps a success that dropped empty property sets an info, with the note in the same language', () => {
    const outcome = exportOutcomeToast({ files: [{ base: 'a', ext: 'ifcx' }, { base: 'b', ext: 'ifcx' }], skipped: [], exportedChanges: 4, unrepresented: 2 });
    assert.equal(outcome.level, 'info');
    assert.equal(outcome.message, 'S-au exportat 2 modele (4 modificări) — 2 seturi de proprietăți goale au fost lăsate deoparte (IFCX nu poate reprezenta un set gol)');
  });
});
