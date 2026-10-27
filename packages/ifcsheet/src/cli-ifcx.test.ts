/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet` on an IFCX model (#406): the format is read from the content, never the file name, and the file goes through
 * the readers the app loads it with. hello-wall.ifcx is the wall, the window and the space of hello-wall.ifc; `check`, `build`,
 * `rooms` and `materials` answer for it as they do for the IFC. A STEP file named .ifcx is read as STEP, an IFCX named .json
 * as IFCX, JSON that is not IFCX is refused, and an IFCX with no geometry of its own is refused by `check` and `build` alike.
 */

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { modelFormatOf, openModel } from './headless.js';

const SAMPLES = fileURLToPath(new URL('../../../apps/viewer/public/samples/', import.meta.url));
const IFCX = join(SAMPLES, 'hello-wall.ifcx');
const STEP = join(SAMPLES, 'hello-wall.ifc');
const missing = !existsSync(IFCX) ? 'hello-wall.ifcx not found' : null;

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};
const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-ifcx-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The header of a real IFCX file and nodes with no geometry: an overlay on another layer. */
const OVERLAY = JSON.stringify({
  header: { id: 'overlay', ifcxVersion: 'ifcx_alpha', dataVersion: '1.0.0', author: 'a', timestamp: 't' },
  imports: [],
  schemas: {},
  data: [{ path: '11111111-1111-1111-1111-111111111111', attributes: { 'bsi::ifc::class': { code: 'IfcWall' } } }],
});

describe.skipIf(missing !== null)('ifcsheet on hello-wall.ifcx', () => {
  it('opens it as the wall, the window and the space of the IFC', async () => {
    const opened = await openModel(new Uint8Array(readFileSync(IFCX)));
    const types = new Set(opened.meshes.map((m) => m.ifcType));
    expect(types.has('IfcWall')).toBe(true);
    expect(types.has('IfcWindow')).toBe(true);
    expect(opened.storeys.map((s) => s.name)).toEqual(['My_Storey']);
    expect(opened.extent).not.toBeNull();
  });

  it('check reports what the model lacks, not a parse failure, and counts the room', async () => {
    const c = capture();
    expect(await run(['check', IFCX, '--json'], c.io)).toBe(EXIT.failed);
    const report = JSON.parse(c.out()) as { ready: boolean; findings: { kind: string }[] };
    expect(report.ready).toBe(false);
    expect(report.findings.map((f) => f.kind)).not.toContain('no-rooms');
    expect(c.out()).toContain("'My_Space'");
    expect(c.err()).toBe('');
  });

  it('build lays a set out and writes the PDF', async () => {
    const c = capture();
    const out = join(dir, 'hw.pdf');
    expect(await run(['build', IFCX, '--out', out], c.io)).toBe(EXIT.ok);
    expect(readFileSync(out).subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(c.out()).toMatch(/hw\.pdf: 4 sheets \(My_Project\)/);
    expect(c.err()).not.toContain('no geometry');
  });

  it('rooms and materials answer as for the IFC', async () => {
    const rooms = capture();
    expect(await run(['rooms', IFCX], rooms.io)).toBe(EXIT.ok);
    expect(rooms.out()).toMatch(/My_Space\s+My_Storey\s+40\.00/);
    const materials = capture();
    expect(await run(['materials', IFCX], materials.io)).toBe(EXIT.ok);
    for (const name of ['CONCRETE', 'GLASS', 'WOOD']) expect(materials.out()).toContain(name);
  });

  it('reads the format from the content: IFCX saved as .json is IFCX', async () => {
    const renamed = join(dir, 'hello-wall.json');
    copyFileSync(IFCX, renamed);
    expect(modelFormatOf(new Uint8Array(readFileSync(renamed)))).toBe('ifcx');
    const c = capture();
    expect(await run(['rooms', renamed], c.io)).toBe(EXIT.ok);
    expect(c.out()).toMatch(/My_Space\s+My_Storey\s+40\.00/);
  });

  it('reads the format from the content: a STEP file named .ifcx is STEP', async () => {
    const renamed = join(dir, 'step-as.ifcx');
    copyFileSync(STEP, renamed);
    expect(modelFormatOf(new Uint8Array(readFileSync(renamed)))).toBe('ifc');
    const c = capture();
    expect(await run(['rooms', renamed], c.io)).toBe(EXIT.ok);
    expect(c.out()).toMatch(/My Space\s+/);
  });

  it('refuses JSON that is not an IFCX model, with one sentence', async () => {
    const file = join(dir, 'other.ifcx');
    writeFileSync(file, '{"hello": "world"}');
    for (const argv of [['check', file], ['build', file, '--out', join(dir, 'o.pdf')]]) {
      const c = capture();
      expect(await run(argv, c.io)).toBe(EXIT.failed);
      expect(c.err()).toContain('this file is JSON but not an IFCX model');
      expect(c.out()).not.toContain('has what the drawing set reads');
    }
  });

  it('refuses an IFCX with no geometry of its own the same way in check and build, and never reports it ready', async () => {
    const file = join(dir, 'overlay.ifcx');
    writeFileSync(file, OVERLAY);
    const sentence = 'this IFCX file carries no geometry of its own (an overlay on another layer), so there is nothing to lay a drawing set out on';
    for (const argv of [['check', file], ['build', file, '--out', join(dir, 'o.pdf')]]) {
      const c = capture();
      expect(await run(argv, c.io)).toBe(EXIT.failed);
      expect(c.err()).toContain(sentence);
      expect(c.out()).not.toContain('has what the drawing set reads');
    }
  });
});
