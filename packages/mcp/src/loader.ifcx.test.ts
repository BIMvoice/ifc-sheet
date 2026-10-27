/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An IFCX model through the MCP tools (#406): the drawing-set tools open it like the command line does (the format is read from
 * the content), and `model_load`, which reads STEP only, refuses it by what it is rather than as "not a valid IFC/STEP file".
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadIfcModelFromBytes } from './loader.js';
import { ifcsheetOpenModel } from './tools/ifcsheet.js';
import { InMemoryModelRegistry } from './context.js';

const IFCX = fileURLToPath(new URL('../../../apps/viewer/public/samples/hello-wall.ifcx', import.meta.url));
const missing = !existsSync(IFCX) ? 'hello-wall.ifcx not found' : null;

describe.skipIf(missing !== null)('hello-wall.ifcx through the MCP tools', () => {
  it('model_load names the format and points at the drawing-set tool, whatever the file is called', async () => {
    const bytes = new Uint8Array(readFileSync(IFCX));
    for (const name of ['hello-wall.ifcx', 'hello-wall.json']) {
      await expect(loadIfcModelFromBytes(bytes, name)).rejects.toThrow(/is an IFCX \(IFC5, JSON\) model.*ifcsheet_open_model/);
    }
  });

  it('ifcsheet_open_model opens it with its storey and meshes', async () => {
    const ctx = { registry: new InMemoryModelRegistry(), config: {} } as never;
    const result = await ifcsheetOpenModel.handler({ ifc_base64: readFileSync(IFCX).toString('base64'), name: 'hello-wall.json' }, ctx);
    const summary = result.structuredContent as { storeyCount: number; meshCount: number; hasGeometry: boolean };
    expect(summary.storeyCount).toBe(1);
    expect(summary.meshCount).toBeGreaterThan(0);
    expect(summary.hasGeometry).toBe(true);
  });
});
