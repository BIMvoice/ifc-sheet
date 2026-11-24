/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The prebuilt engine runtime on the `prebuilt-wasm` branch of this
 * repository (#856).
 *
 * `.github/workflows/prebuilt-wasm.yml` builds packages/wasm/pkg from main's
 * Rust and commits the runtime files plus `manifest.json` to that branch as a
 * single commit. `scripts/fetch-prebuilt-wasm.mjs` downloads them from
 * raw.githubusercontent.com (public, no token) and checks every file against
 * the manifest before anything is installed. Both sides use this module, so the
 * file list and the manifest shape cannot drift apart.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where a clone looks first. `IFCSHEET_PREBUILT_WASM_URL` overrides it (tests, forks). */
export const DEFAULT_PREBUILT_BASE_URL =
  'https://raw.githubusercontent.com/BIMvoice/ifc-sheet/prebuilt-wasm';

/** The runtime files packages/wasm/package.json ships from pkg/; the .d.ts is committed instead. */
export const RUNTIME_FILES = ['ifc-lite.js', 'ifc-lite_bg.wasm'];

export const MANIFEST_NAME = 'manifest.json';
const MANIFEST_SCHEMA = 1;

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The manifest for the runtime files in `dir`, built from `commit`. `dtsPath`
 * is the ifc-lite.d.ts that build produced, recorded so a mismatch can say
 * whether the checkout's committed types differ from the prebuilt's.
 */
export function buildManifest({ dir, commit, dtsPath }) {
  const files = {};
  for (const name of RUNTIME_FILES) files[name] = sha256(readFileSync(join(dir, name)));
  return { schema: MANIFEST_SCHEMA, commit, dtsSha256: sha256(readFileSync(dtsPath)), files };
}

export function writeManifest(opts) {
  const manifest = buildManifest(opts);
  writeFileSync(join(opts.dir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Throws a message naming what is wrong with a parsed manifest; returns it when usable. */
export function validateManifest(manifest) {
  if (manifest === null || typeof manifest !== 'object') throw new Error('it is not a JSON object');
  if (manifest.schema !== MANIFEST_SCHEMA) {
    throw new Error(`its schema is ${JSON.stringify(manifest.schema)}, this script reads schema ${MANIFEST_SCHEMA}`);
  }
  if (typeof manifest.commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(manifest.commit)) {
    throw new Error('it names no source commit');
  }
  for (const name of RUNTIME_FILES) {
    if (!/^[0-9a-f]{64}$/.test(manifest.files?.[name] ?? '')) throw new Error(`it has no sha256 for ${name}`);
  }
  return manifest;
}

/**
 * Download the manifest and the runtime files from `baseUrl`, verifying each
 * file's sha256. Writes nothing to disk.
 *
 * Resolves `{ ok: true, manifest, files: Map<name, Buffer> }`, or
 * `{ ok: false, unreachable: true, reason }` when the manifest cannot be read
 * at all (no network, the branch does not exist yet), so the caller may try
 * another source. Anything wrong AFTER the manifest was read is a defect of
 * the branch, not an absence, and resolves `{ ok: false, unreachable: false,
 * reason }`: falling back would hide it.
 */
export async function downloadPrebuilt(baseUrl, { fetchImpl = fetch, timeoutMs = 120_000 } = {}) {
  const manifestUrl = `${baseUrl}/${MANIFEST_NAME}`;
  let manifestText;
  try {
    const res = await fetchImpl(manifestUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, unreachable: true, reason: `${manifestUrl} answered HTTP ${res.status}` };
    manifestText = await res.text();
  } catch (err) {
    return { ok: false, unreachable: true, reason: `${manifestUrl} could not be read (${describe(err)})` };
  }

  let manifest;
  try {
    manifest = validateManifest(JSON.parse(manifestText));
  } catch (err) {
    return { ok: false, unreachable: false, reason: `${manifestUrl} is not a usable manifest: ${describe(err)}` };
  }

  const files = new Map();
  for (const name of RUNTIME_FILES) {
    const url = `${baseUrl}/${name}`;
    let bytes;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        return { ok: false, unreachable: false, reason: `${url} answered HTTP ${res.status}, though the manifest lists it` };
      }
      bytes = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      return { ok: false, unreachable: false, reason: `${url} could not be read (${describe(err)})` };
    }
    const actual = sha256(bytes);
    if (actual !== manifest.files[name]) {
      return {
        ok: false,
        unreachable: false,
        hashMismatch: true,
        reason: `${url} has sha256 ${actual}, but the manifest says ${manifest.files[name]}`,
      };
    }
    files.set(name, bytes);
  }
  return { ok: true, manifest, files };
}

function describe(err) {
  const cause = err?.cause?.code ?? err?.cause?.message;
  return cause ? `${err.message}: ${cause}` : String(err?.message ?? err);
}
