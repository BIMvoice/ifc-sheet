/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The toast a Wall card shows when its table has nothing to export, in the language of the interface: the CSV button of a
 * materials schedule over a project with no elements.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { waitFor } from '@/test/render';
import { registerLocale, setLocale } from '@/i18n/registry';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import ro from '@/i18n/locales/ro';
import { toast } from '@/components/ui/toast';
import { resetProject } from '@/project/project-store.js';
import type { ProjectSchedule } from '@/project/types.js';
import { ScheduleExportButtons } from './ScheduleExportButtons';

const empty = { id: 's-empty', name: 'Materials', kind: 'materials' } as unknown as ProjectSchedule;

beforeEach(() => { resetProject(); registerLocale('ro', checkCatalogue(ro).catalogue); act(() => setLocale('en')); });
afterEach(() => { cleanup(); act(() => setLocale('en')); });

async function pressCsv(): Promise<string> {
  const error = mock.method(toast, 'error', () => {});
  try {
    const ui = render(<ScheduleExportButtons schedule={empty} />);
    const csv = ui.querySelector('button');
    assert.ok(csv, 'the CSV button renders');
    await act(async () => { csv.click(); });
    await waitFor(() => error.mock.callCount() === 1, 'no toast for an empty table');
    return String(error.mock.calls[0].arguments[0]);
  } finally {
    error.mock.restore();
  }
}

describe('the Wall card export toast follows the interface language', () => {
  it('says there is nothing to export in Romanian under ro', async () => {
    act(() => setLocale('ro'));
    assert.equal(await pressCsv(), 'Nu e nimic de exportat încă: tabelul nu are rânduri.');
  });

  it('says it in English under en', async () => {
    assert.equal(await pressCsv(), 'Nothing to export yet: the table has no rows.');
  });
});
