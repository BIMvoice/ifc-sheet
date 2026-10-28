/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Parsed models of the hosted endpoint, per server instance, by the SHA-256 of
 * the file. A serverless platform may or may not send the next request of a
 * session to this instance, so this is only a speed-up: a miss parses the
 * file again and nothing else changes. Bounded: at most `maxEntries` models
 * and `maxCost` bytes, the least recently used evicted first.
 */

import { createHash } from 'node:crypto';
import type { OpenedModel } from '@bimvoice/ifcsheet/headless';

/** Models kept on one instance. */
export const CACHE_MAX_MODELS = 2;
/** A parsed model takes several times the size of its file (meshes, tables); this is the estimate used to bound memory. */
export const CACHE_COST_FACTOR = 4;
/** Estimated memory the cache may hold, bytes. */
export const CACHE_MAX_BYTES = 200 * 1024 * 1024;

export const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Fields of a cached model that stay mutable: the wasm-backed data store is a live handle, not data to freeze. */
const LIVE_FIELDS = new Set(['dataStore']);

const isPlain = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === Array.prototype || proto === null;
};

/**
 * Freezes plain objects and arrays, recursively. Typed arrays (the mesh
 * buffers) cannot be frozen in JavaScript, so they are left as they are, and so
 * are class instances (Map, Set, ...) and functions: the guard covers what the
 * tools read as plain data, not the buffers. The mesh buffers are covered by
 * the interleaving test, which hashes them.
 */
export function deepFreeze<T>(value: T, skip: ReadonlySet<string> = new Set()): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value) || !isPlain(value)) return value;
  Object.freeze(value);
  for (const [key, child] of Object.entries(value)) if (!skip.has(key)) deepFreeze(child);
  return value;
}

export class ModelCache<T> {
  private readonly entries = new Map<string, { value: T; cost: number }>();
  constructor(private readonly maxEntries = CACHE_MAX_MODELS, private readonly maxCost = CACHE_MAX_BYTES) {}

  get size(): number { return this.entries.size; }
  keys(): string[] { return [...this.entries.keys()]; }

  get(hash: string): T | undefined {
    const hit = this.entries.get(hash);
    if (!hit) return undefined;
    this.entries.delete(hash);
    this.entries.set(hash, hit); // most recently used last
    return hit.value;
  }

  set(hash: string, value: T, cost: number): void {
    this.entries.delete(hash);
    if (cost > this.maxCost) return; // never worth evicting everything for
    // Every session shares this object: freeze what the tools read (projectName, storeys, meshes
    // and buildingMeshes as arrays and mesh records, extent, farElements, includeFarElements, the
    // model object itself) so a tool that writes to it throws instead of leaking between sessions.
    // The data store (wasm-backed) and typed arrays are not frozen; see deepFreeze.
    deepFreeze(value, LIVE_FIELDS);
    this.entries.set(hash, { value, cost });
    let total = 0;
    for (const e of this.entries.values()) total += e.cost;
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries && total <= this.maxCost) break;
      if (key === hash) continue;
      total -= this.entries.get(key)!.cost;
      this.entries.delete(key);
    }
  }

  clear(): void { this.entries.clear(); }
}

class HostedModelCache {
  readonly cache = new ModelCache<OpenedModel>();
  /** Opens `bytes` with `open`, or returns the model parsed earlier from the same bytes. */
  async open(bytes: Uint8Array, open: (b: Uint8Array) => Promise<OpenedModel>): Promise<{ model: OpenedModel; hash: string }> {
    const hash = sha256Hex(bytes);
    const hit = this.cache.get(hash);
    if (hit) return { model: hit, hash };
    const model = await open(bytes);
    this.cache.set(hash, model, bytes.byteLength * CACHE_COST_FACTOR);
    return { model, hash };
  }
}

export const hostedModelCache = new HostedModelCache();
