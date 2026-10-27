/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The `ifcsheet_*` tool list is assembled from the groups the tool files register (#144) and is exactly the list `main` had before: same tools, same order, same descriptions and schemas. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assembleTools, ifcsheetTools } from './ifcsheet-tools.js';
import type { Tool } from './types.js';

const shape = (tools: readonly Tool[]) => tools.map((t) => ({ name: t.name, description: t.description, scope: t.scope, inputSchema: t.inputSchema, handler: typeof t.handler }));

describe('ifcsheetTools', () => {
  it('is identical to the list captured from main: names, order, descriptions, scopes, schemas', () => {
    const captured = JSON.parse(readFileSync(fileURLToPath(new URL('./__fixtures__/ifcsheet-tools.main.json', import.meta.url)), 'utf8'));
    expect(captured).toHaveLength(17);
    expect(JSON.parse(JSON.stringify(shape(ifcsheetTools)))).toEqual(captured);
  });

  it('follows the groups\' order, not the order they are passed in', () => {
    const tool = (name: string): Tool => ({ name, description: '', scope: 'read', inputSchema: { type: 'object' }, handler: async () => ({ content: [] }) }) as unknown as Tool;
    const a = { order: 10, tools: [tool('a1'), tool('a2')] };
    const b = { order: 20, tools: [tool('b')] };
    expect(assembleTools([b, a]).map((t) => t.name)).toEqual(['a1', 'a2', 'b']);
  });

  it('refuses two groups with one order', () => {
    expect(() => assembleTools([{ order: 10, tools: [] }, { order: 10, tools: [] }])).toThrow(/share order 10/);
  });
});
