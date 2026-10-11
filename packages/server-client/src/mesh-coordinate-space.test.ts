/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The coordinate-space tag is the server's three-variant enum on this side of
 * the wire too (#4611).
 *
 * Every field that carried it was typed `string`, so the tiers lived in a doc
 * comment. The two halves below are the two ways that failed:
 *
 *  - the COMPILE-TIME half: a consumer writing `if (space === 'site_local')`
 *    got no help, and a typo in that comparison was legal against `string`;
 *  - the RUNTIME half: a value outside the three reached the consumer looking
 *    exactly like a tag it should honour. `SiteLocal` is the concrete case -
 *    the Rust variant name, which `MeshCoordinateSpace`'s own deserializer
 *    rejects (`rust/processing/src/mesh_frame.rs`, `from_str::<..>("SiteLocal")
 *    .is_err()`), so a producer that hand-rolled the JSON instead of using
 *    serde would send it and nothing on this side would notice.
 */

import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { IfcServerClient } from './client.js';
import {
  asMeshCoordinateSpace,
  withNarrowedCoordinateSpace,
  type MeshCoordinateSpace,
} from './mesh-coordinate-space.js';
import type {
  OptimizedParquetMetadataHeader,
  OptimizedParquetParseResponse,
  ParquetMetadataHeader,
  ParquetParseResponse,
  ParseResponse,
} from './types.js';

function stubFetch(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
  );
}

function client(): IfcServerClient {
  return new IfcServerClient({ baseUrl: 'https://example.invalid' });
}

/** A `/api/v1/cache/{key}` body, minus the fields this file does not read. */
function cacheBody(space?: unknown): Record<string, unknown> {
  const body: Record<string, unknown> = {
    cache_key: 'abc',
    meshes: [],
    metadata: {},
    stats: {},
  };
  if (space !== undefined) body.mesh_coordinate_space = space;
  return body;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mesh_coordinate_space is the server enum, not a string', () => {
  it('types every response field as the three-tier union', () => {
    // All five fields, because they are five copies of one wire contract and
    // narrowing four of them would leave the fifth as the way a `string`
    // reaches a consumer. Fails typecheck if any one goes back to `string`.
    expectTypeOf<ParseResponse['mesh_coordinate_space']>().toEqualTypeOf<
      MeshCoordinateSpace | undefined
    >();
    expectTypeOf<ParquetMetadataHeader['mesh_coordinate_space']>().toEqualTypeOf<
      MeshCoordinateSpace | undefined
    >();
    expectTypeOf<ParquetParseResponse['mesh_coordinate_space']>().toEqualTypeOf<
      MeshCoordinateSpace | undefined
    >();
    expectTypeOf<OptimizedParquetMetadataHeader['mesh_coordinate_space']>().toEqualTypeOf<
      MeshCoordinateSpace | undefined
    >();
    expectTypeOf<OptimizedParquetParseResponse['mesh_coordinate_space']>().toEqualTypeOf<
      MeshCoordinateSpace | undefined
    >();
  });

  it('hands back the same shape with the tag RETYPED, not the caller\'s own type', () => {
    // The case the return type exists for: an unvalidated wire shape, the kind
    // `JSON.parse` and a hand-written interface produce. Returning the
    // argument's own `T` would hand the `string` straight back, and a caller
    // switching on the three tiers would still be holding a value the compiler
    // believes is any string. Fails typecheck if the signature goes back to
    // `(wire: T) => T`.
    const wire: { cache_key: string; mesh_coordinate_space?: string } = {
      cache_key: 'abc',
      mesh_coordinate_space: 'site_local',
    };
    const narrowed = withNarrowedCoordinateSpace(wire);
    expectTypeOf<typeof narrowed['mesh_coordinate_space']>().toEqualTypeOf<
      MeshCoordinateSpace | undefined
    >();
    // The rest of the shape survives: this is one property retyped, not a cast
    // through `unknown` that forgets everything else.
    expectTypeOf<typeof narrowed['cache_key']>().toEqualTypeOf<string>();
    expect(narrowed.mesh_coordinate_space).toBe('site_local');
  });

  it('keeps every member of a union argument whole', () => {
    // `Omit<T, 'mesh_coordinate_space'>` is NOT distributive: over a union it
    // collapses to the shared keys, so a caller holding two response shapes
    // would lose every property they do not share. An intersection
    // distributes, and this pins that it does. Fails typecheck (TS2339) if the
    // return type goes back to an `Omit`-based one.
    const either = { cache_key: 'a', meshes: [], mesh_coordinate_space: 'raw_ifc' } as
      | { cache_key: string; meshes: unknown[]; mesh_coordinate_space?: string }
      | { cache_key: string; optimized: true; mesh_coordinate_space?: string };
    const narrowed = withNarrowedCoordinateSpace(either);
    expectTypeOf<typeof narrowed['mesh_coordinate_space']>().toEqualTypeOf<
      MeshCoordinateSpace | undefined
    >();
    // The member-only properties survive, reachable after a discriminating check.
    if ('meshes' in narrowed) expect(narrowed.meshes).toEqual([]);
    else expect(narrowed.optimized).toBe(true);
  });

  it('recognises exactly the three tiers', () => {
    expect(asMeshCoordinateSpace('site_local')).toBe('site_local');
    expect(asMeshCoordinateSpace('model_rtc')).toBe('model_rtc');
    expect(asMeshCoordinateSpace('raw_ifc')).toBe('raw_ifc');
  });

  it('refuses the Rust variant spelling, which the Rust side refuses too', () => {
    expect(asMeshCoordinateSpace('SiteLocal')).toBeUndefined();
    expect(asMeshCoordinateSpace('siteLocal')).toBeUndefined();
    expect(asMeshCoordinateSpace('')).toBeUndefined();
    expect(asMeshCoordinateSpace(null)).toBeUndefined();
    expect(asMeshCoordinateSpace(7)).toBeUndefined();
  });

  it('leaves a recognised tag, and the absence of one, exactly as it found it', () => {
    expect(withNarrowedCoordinateSpace({ mesh_coordinate_space: 'model_rtc' })).toEqual({
      mesh_coordinate_space: 'model_rtc',
    });

    const absent = withNarrowedCoordinateSpace<{ mesh_coordinate_space?: unknown }>({});
    expect('mesh_coordinate_space' in absent).toBe(false);
  });

  it('drops an unrecognised tag rather than leaving it to look like a tier', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wire = withNarrowedCoordinateSpace({ mesh_coordinate_space: 'SiteLocal' });
    expect('mesh_coordinate_space' in wire).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('the client does not pass an unrecognised tag off as a tier', () => {
  it('keeps the tag a cached response actually declared', async () => {
    stubFetch(cacheBody('site_local'));
    const cached = await client().getCached('abc');
    expect(cached?.mesh_coordinate_space).toBe('site_local');
  });

  it('drops the Rust variant spelling from a cached response', async () => {
    // Pre-fix this is `'SiteLocal'` on a field typed `string`, so a consumer
    // switching on the three tiers silently takes no branch while the response
    // claims to declare one.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch(cacheBody('SiteLocal'));
    const cached = await client().getCached('abc');
    expect(cached).not.toBeNull();
    expect(cached?.mesh_coordinate_space).toBeUndefined();
  });

  it('leaves an older server that sends no tag alone', async () => {
    stubFetch(cacheBody());
    const cached = await client().getCached('abc');
    expect(cached).not.toBeNull();
    expect(cached && 'mesh_coordinate_space' in cached).toBe(false);
  });
});
