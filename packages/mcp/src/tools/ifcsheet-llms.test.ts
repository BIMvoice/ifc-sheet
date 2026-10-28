/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `llms.txt` and the README (#165) name only what the server has: every `ifcsheet_*` tool, resource and prompt they mention exists, and every drawing-set tool is mentioned. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildDefaultPromptRegistry } from '../prompts/index.js';
import { IfcSheetResources } from '../resources/ifcsheet.js';
import { buildDefaultToolRegistry } from './index.js';

const read = (file: string) => readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8');
const tools = buildDefaultToolRegistry();
const sheetTools = tools.list().map((t) => t.name).filter((n) => n.startsWith('ifcsheet_'));
const prompts = buildDefaultPromptRegistry().list().map((p) => p.name).filter((n) => /permit|set_for_new|readiness_and_fix/.test(n));
const resources = ['ifcsheet://project/schema', 'ifcsheet://session/project', 'ifcsheet://session/sheets'];

describe.each(['llms.txt', 'README.md'])('%s', (file) => {
  const text = read(file);
  it('names only ifcsheet_ tools that the registry has', () => {
    const named = [...new Set(text.match(/\bifcsheet_[a-z_]+/g) ?? [])];
    expect(named.length).toBeGreaterThan(10);
    for (const n of named) expect(tools.has(n), `${file} names ${n}, which is not a tool`).toBe(true);
  });
  it('names the resources and the prompts the server has, and no other ifcsheet:// resource', () => {
    for (const uri of resources) expect(text, uri).toContain(uri);
    for (const uri of text.match(/ifcsheet:\/\/[a-z/]+/g) ?? []) expect(new IfcSheetResources().match(uri), `${uri} is not a resource`).toBe(true);
    for (const name of prompts) expect(text, name).toContain(name);
  });
  it('mentions every drawing-set tool', () => {
    for (const n of sheetTools) expect(text, `${file} does not mention ${n}`).toContain(n);
  });
});

describe('llms.txt', () => {
  it('lists each drawing-set tool as a bullet with a one-line description', () => {
    const bullets = read('llms.txt').match(/^- `ifcsheet_[a-z_]+`: .+$/gm) ?? [];
    expect(bullets.map((b) => b.match(/`(ifcsheet_[a-z_]+)`/)![1]).sort()).toEqual([...sheetTools].sort());
  });
  it('keeps the limits the code has', () => {
    const text = read('llms.txt');
    expect(text).toMatch(/DXF files hold lines and no text/);
    expect(text).toMatch(/plain title block/);
  });
});
