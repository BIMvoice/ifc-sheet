/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What is drawn on the sheets of an edited set (#165): the title block field a
 * sheet was given and the table of a schedule sheet. The DXF and the PDF carry
 * text as glyphs or not at all, so this reads the shapes the writers draw from.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDefaultSet, DEFAULT_SCHEME, nextNumber } from '@bimvoice/ifcsheet';
import { openModel } from '@bimvoice/ifcsheet/headless';
import { InMemoryModelRegistry, type ToolContext } from '../context.js';
import { drawSet, scheduleCapacity } from './ifcsheet-draw.js';
import { addSheetModel, addSheetSet, replaceSheetDocument } from './ifcsheet-store.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

describe.skipIf(missing !== null)('drawSet on AC20-FZK-Haus', () => {
  it('prints a sheet\'s own title block field on that sheet only, and a schedule sheet\'s table with every room', async () => {
    const ctx = { registry: new InMemoryModelRegistry() } as unknown as ToolContext;
    const bytes = new Uint8Array(readFileSync(FZK));
    const model = addSheetModel(ctx, 'fzk.ifc', await openModel(bytes), { bytes });
    const entry = addSheetSet(ctx, model.id, generateDefaultSet(model.model)!);
    const doc = entry.set.document;
    const sheetId = 'sheet-rooms';
    replaceSheetDocument(entry, {
      ...doc,
      sheets: [
        { ...doc.sheets[0], titleBlock: { project: 'Haus Muster, Grundriss' } },
        ...doc.sheets.slice(1),
        { id: sheetId, number: nextNumber(doc.sheets, 'schedules', DEFAULT_SCHEME), series: 'schedules', name: 'Rooms', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [] },
      ],
    });
    entry.schedules.push({ id: 'schedule-1', kind: 'rooms', sheetId, locale: 'en' });
    const drawn = await drawSet(entry, model);

    const textsOf = (id: string) => drawn.sheets.find((s) => s.sheetId === id)!.texts.map((t) => t.text);
    expect(textsOf(doc.sheets[0].id)).toContain('Haus Muster, Grundriss');
    expect(textsOf(doc.sheets[1].id)).not.toContain('Haus Muster, Grundriss');
    const table = drawn.schedules[0].table;
    expect(drawn.schedules[0].drawn).toBe(table.rows.length);
    const rooms = textsOf(sheetId);
    expect(rooms).toContain('Rooms');
    for (const row of table.rows) for (const cell of row) if (cell) expect(rooms).toContain(cell);
    expect(table.rows.length).toBeLessThanOrEqual(scheduleCapacity({ h: 277 }));
  }, 120_000);

  it('draws the figures of a schedule in the document\'s Units and numbers, and returns the plain numbers in the rows', async () => {
    const ctx = { registry: new InMemoryModelRegistry() } as unknown as ToolContext;
    const bytes = new Uint8Array(readFileSync(FZK));
    const model = addSheetModel(ctx, 'fzk.ifc', await openModel(bytes), { bytes });
    const entry = addSheetSet(ctx, model.id, generateDefaultSet(model.model)!);
    const doc = entry.set.document;
    const sheet = (id: string, name: string) => ({ id, number: nextNumber(doc.sheets, 'schedules', DEFAULT_SCHEME), series: 'schedules' as const, name, createdAt: 0, paper: 'A3' as const, orientation: 'landscape' as const, viewports: [] });
    replaceSheetDocument(entry, { ...doc, unitsAndNumbers: { separator: 'comma' }, sheets: [...doc.sheets, sheet('sheet-rooms', 'Rooms'), sheet('sheet-boq', 'Bill')] });
    entry.schedules.push({ id: 'schedule-1', kind: 'rooms', sheetId: 'sheet-rooms', locale: 'en' });
    const article = { id: 'a1', code: 'W1', description: 'Walls', unit: 'm2', quantity: 'NetSideArea', factor: 1.5, waste: 5, filter: { classes: ['IfcWallStandardCase'] } } as never;
    entry.schedules.push({ id: 'schedule-2', kind: 'boq', sheetId: 'sheet-boq', locale: 'en', boqArticles: [article] });
    const drawn = await drawSet(entry, model);

    const textsOf = (id: string) => drawn.sheets.find((s) => s.sheetId === id)!.texts.map((t) => t.text);
    expect(textsOf('sheet-rooms')).toContain('11,19');
    expect(textsOf('sheet-rooms')).not.toContain('11.19');
    expect(textsOf('sheet-boq')).toContain('299,98');
    // What the tool returns keeps the plain numbers and the language alone: an agent reads them back.
    expect(drawn.schedules[0].table.rows.flat()).toContain('11.19');
    expect(drawn.schedules[1].table.rows.flat().some((c) => /^299\.9\d*$/.test(c))).toBe(true);
  }, 120_000);
});
