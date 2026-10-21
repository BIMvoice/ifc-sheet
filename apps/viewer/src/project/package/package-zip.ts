/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zipping a project package (`package-io.ts` writes and reads the parts).
 * Kept free of the rest of the package code so a worker can load it alone:
 * the recovery copy zips the whole IFC, 1.4 s of the main thread on a 56 MB
 * model (#154), and now does it in `package-zip.worker.ts`.
 */

import { zipSync, type Zippable } from 'fflate';

/** The package as path → bytes, manifest included. */
export type PackageFiles = Map<string, Uint8Array>;

/** IFC text compresses well; already-compressed or tiny parts are stored. */
export function zipPackage(files: PackageFiles): Uint8Array {
  const entries: Zippable = {};
  for (const [path, bytes] of files) entries[path] = [bytes, { level: path.endsWith('.ifc') || path.endsWith('.json') ? 6 : 0 }];
  return zipSync(entries);
}

export interface ZipRequest { entries: [string, Uint8Array][] }
export type ZipReply = { bytes: Uint8Array } | { error: string };

/** What the worker does with one request: the same zip, as a reply. */
export function answerZipRequest(request: ZipRequest): ZipReply {
  try {
    return { bytes: zipPackage(new Map(request.entries)) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** The worker as the client uses it; a test installs an in-process one. */
export interface ZipWorker {
  postMessage(message: ZipRequest): void;
  onmessage: ((event: { data: ZipReply }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  terminate(): void;
}

let makeWorker: (() => ZipWorker) | null = typeof Worker === 'undefined'
  ? null
  : () => new Worker(new URL('./package-zip.worker.ts', import.meta.url), { type: 'module' }) as unknown as ZipWorker;

/** For tests: replace how a worker is made (`null` = none can run). Returns the way back. */
export function setZipWorkerFactoryForTests(factory: (() => ZipWorker) | null): () => void {
  const before = makeWorker;
  makeWorker = factory;
  return () => { makeWorker = before; };
}

/**
 * The same bytes as {@link zipPackage}, made in a worker so the page stays
 * responsive. Where no worker can run (Node, where the tests drive this), or
 * the worker fails, it zips here: a recovery copy that blocks for a moment is
 * better than none.
 */
export function zipPackageOffThread(files: PackageFiles): Promise<Uint8Array> {
  if (!makeWorker) return Promise.resolve(zipPackage(files));
  return new Promise<Uint8Array>((resolve) => {
    let worker: ZipWorker;
    try {
      worker = makeWorker!();
    } catch (err) {
      console.warn('[project] zip worker unavailable, zipping on the page', err);
      resolve(zipPackage(files));
      return;
    }
    const finish = (fallback: boolean, bytes?: Uint8Array, why?: unknown) => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      if (fallback) console.warn('[project] zip worker failed, zipping on the page', why);
      resolve(bytes ?? zipPackage(files));
    };
    worker.onmessage = ({ data }) => ('bytes' in data ? finish(false, data.bytes) : finish(true, undefined, data.error));
    worker.onerror = (event) => finish(true, undefined, event.message);
    worker.postMessage({ entries: [...files] });
  });
}
