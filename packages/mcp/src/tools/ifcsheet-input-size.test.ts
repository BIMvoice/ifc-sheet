/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The size of a project or template a tool takes (#432): `project_json`, a project file and `template_json` are held to the limit the
 * server gives a model (`config.maxModelBytes`, 25 MB on the hosted endpoint), refused with the limit in the message before anything is
 * parsed. A server with no limit (a local one) takes any size, as it takes any model file.
 */

import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModelRegistry, ToolContext } from '../context.js';
import { ToolErrorCode } from '../errors.js';
import { pathOrInline } from './ifcsheet-shared.js';
import { ifcsheetCheckReadiness } from './ifcsheet.js';
import { ifcsheetBoq } from './ifcsheet-takeoff.js';
import { addSheetModel } from './ifcsheet-store.js';

const LIMIT = 1000;
let tmp: string;
beforeAll(async () => { tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-size-'))); });
afterAll(async () => { await rm(tmp, { recursive: true, force: true }); });

const ctx = (maxModelBytes?: number): ToolContext => ({
  registry: {} as ModelRegistry,
  config: { readOnly: false, samplingEnabled: false, allowedPaths: [tmp], ...(maxModelBytes === undefined ? {} : { maxModelBytes }) },
}) as unknown as ToolContext;

/** A project-shaped text of exactly `bytes` bytes (padding inside a string, so it is still JSON). */
const projectOf = (bytes: number): string => {
  const head = '{"format":"ifclite-project","version":1,"pad":"';
  const tail = '"}';
  return head + 'x'.repeat(bytes - head.length - tail.length) + tail;
};

describe('the size of a project or template a tool takes', () => {
  it('refuses inline text over the limit, naming the limit and the size, and takes text at the limit', async () => {
    await expect(pathOrInline({ project_json: projectOf(LIMIT + 1) }, ctx(LIMIT), 'project', 'project')).rejects.toMatchObject({
      code: ToolErrorCode.INVALID_INPUT,
      message: expect.stringMatching(/project_json is larger than the 1,000 byte limit of this server \(it is 1,001 bytes\)/),
      details: { limit_bytes: LIMIT, size_bytes: LIMIT + 1 },
    });
    await expect(pathOrInline({ template_json: projectOf(LIMIT + 1) }, ctx(LIMIT), 'template', 'set template')).rejects.toThrow(/template_json is larger than the 1,000 byte limit/);
    expect((await pathOrInline({ project_json: projectOf(LIMIT) }, ctx(LIMIT), 'project', 'project')).text).toHaveLength(LIMIT);
  });

  it('counts bytes, not characters', async () => {
    const wide = `{"a":"${'é'.repeat(LIMIT / 2)}"}`;
    expect(wide.length).toBeLessThan(LIMIT);
    await expect(pathOrInline({ project_json: wide }, ctx(LIMIT), 'project', 'project')).rejects.toThrow(/byte limit/);
  });

  it('refuses a file over the limit without reading it, and takes one at the limit', async () => {
    const big = join(tmp, 'big.ifclite-project.json');
    const edge = join(tmp, 'edge.ifclite-project.json');
    await writeFile(big, projectOf(LIMIT + 1));
    await writeFile(edge, projectOf(LIMIT));
    await expect(pathOrInline({ project_path: big }, ctx(LIMIT), 'project', 'project')).rejects.toMatchObject({
      message: expect.stringContaining(`'${big}' is larger than the 1,000 byte limit`),
      details: { limit_bytes: LIMIT },
    });
    expect((await pathOrInline({ project_path: edge }, ctx(LIMIT), 'project', 'project')).text).toHaveLength(LIMIT);
  });

  it('takes any size when the server has no limit', async () => {
    expect((await pathOrInline({ project_json: projectOf(LIMIT * 50) }, ctx(), 'project', 'project')).text).toHaveLength(LIMIT * 50);
  });

  it('reaches the takeoff tools: ifcsheet_boq refuses an oversize project_json and reads a small one past the limit check', async () => {
    const c = ctx(LIMIT);
    const entry = addSheetModel(c, 'm.ifc', {} as never, { bytes: new Uint8Array() });
    await expect(ifcsheetBoq.handler({ model_id: entry.id, project_json: projectOf(LIMIT + 1) }, c)).rejects.toThrow(/project_json is larger than the 1,000 byte limit/);
    // Under the limit the text is parsed, and this one is not a usable project: refused for that, not for its size.
    await expect(ifcsheetBoq.handler({ model_id: entry.id, project_json: '{}' }, c)).rejects.toThrow(/cannot be used as a project/);
  });

  it('reaches ifcsheet_check_readiness, which reads its project by its own path', async () => {
    const c = ctx(LIMIT);
    const entry = addSheetModel(c, 'm.ifc', {} as never, { bytes: new Uint8Array() });
    const big = join(tmp, 'readiness.ifclite-project.json');
    await writeFile(big, projectOf(LIMIT + 1));
    await expect(ifcsheetCheckReadiness.handler({ model_id: entry.id, project_json: projectOf(LIMIT + 1) }, c)).rejects.toThrow(/project_json is larger than the 1,000 byte limit/);
    await expect(ifcsheetCheckReadiness.handler({ model_id: entry.id, project_path: big }, c)).rejects.toThrow(/is larger than the 1,000 byte limit/);
  });
});
