/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A ByggesaksBIM check that throws is a tool error with the reason (#372), not an empty list that reads as all good.
 * The failure is forced by replacing the engine's in-process run; everything else is the real handler.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../context.js';
import { ifcsheetCheckReadiness } from './ifcsheet.js';
import { addSheetModel } from './ifcsheet-store.js';

vi.mock('@bimvoice/ifcsheet/headless', async (original) => {
  const real = await original<typeof import('@bimvoice/ifcsheet/headless')>();
  return { ...real, readinessWithProject: () => [], byggesaksbimReadiness: () => Promise.reject(new Error('worker died')) };
});

describe('ifcsheet_check_readiness, ByggesaksBIM, when the check cannot run', () => {
  const ctx = { registry: {} } as unknown as ToolContext;
  const entry = addSheetModel(ctx, 'm', { dataStore: { schemaVersion: 'IFC4' } } as never, { bytes: new Uint8Array() });

  it('fails with the reason when asked for the set', async () => {
    await expect(ifcsheetCheckReadiness.handler({ model_id: entry.id, ids: 'byggesaksbim' }, ctx)).rejects.toThrow('The ByggesaksBIM check could not run: worker died');
  });

  it('does not touch the check when the set was not asked for', async () => {
    const r = await ifcsheetCheckReadiness.handler({ model_id: entry.id }, ctx);
    expect(r.isError).toBeFalsy();
  });
});
