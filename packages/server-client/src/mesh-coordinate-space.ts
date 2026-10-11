// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * The coordinate-space tag, on the TypeScript side of the wire (#4611).
 *
 * The server's `MeshCoordinateSpace` (`rust/processing/src/mesh_frame.rs`) is a
 * three-variant enum whose `serde` attribute spells the wire form, and the ffi,
 * export and Python consumers all read it as that enum. Every TypeScript field
 * that carried it was typed `string`, so the three tiers lived in a doc comment
 * and nothing — not the compiler, not a runtime check — kept a fourth value out.
 * A consumer writing `if (space === 'site_local')` got no help from the type,
 * and a server sending the Rust variant name (`SiteLocal`, which the Rust
 * deserializer itself rejects: see `mesh_frame.rs`'s `from_str` test) reached
 * that consumer looking exactly like a tag it should honour.
 */

/** The three tiers, in the order `MeshCoordinateSpace` declares them. */
export const MESH_COORDINATE_SPACES = ['site_local', 'model_rtc', 'raw_ifc'] as const;

/**
 * Which frame serialized mesh vertices are expressed in.
 *
 * - `site_local`: the `IfcSite` placement's translation was subtracted and its
 *   rotation removed.
 * - `model_rtc`: a detected model-level anchor was subtracted; no rotation.
 * - `raw_ifc`: nothing was subtracted.
 *
 * A response field of this type is optional, and absent means "this server did
 * not say" — either it predates the tag, or it sent something outside the three
 * (see {@link asMeshCoordinateSpace}). Absence is the case every consumer has
 * had to handle since the field was introduced, which is why an unrecognised
 * value resolves to it rather than to a guess.
 */
export type MeshCoordinateSpace = (typeof MESH_COORDINATE_SPACES)[number];

/** The tag when `value` is one of the three tiers, `undefined` otherwise. */
export function asMeshCoordinateSpace(value: unknown): MeshCoordinateSpace | undefined {
  return MESH_COORDINATE_SPACES.find((space) => space === value);
}

/**
 * Earn the narrowed type on a freshly parsed wire object: drop a
 * `mesh_coordinate_space` that is not one of the three tiers, say so, and hand
 * the object back with the field RETYPED, so a caller can wrap its
 * `JSON.parse` in place and get a value the compiler agrees about.
 *
 * The return type is the point, not decoration. `JSON.parse` hands back `any`
 * and a hand-written wire interface can carry the field as `string`; returning
 * the argument's own `T` would hand that straight back and the caller would
 * still be holding a `string` the type system believes.
 *
 * Intersection rather than `Omit`, and that is not a style choice: `Omit` is
 * NOT distributive, so applied to a union it collapses to the shared keys and
 * a caller holding `ParquetParseResponse | OptimizedParquetParseResponse`
 * would lose every property the two do not share. An intersection distributes
 * (`(A | B) & X` is `(A & X) | (B & X)`), and `string & MeshCoordinateSpace`
 * reduces to the union, so the field comes out narrowed and the rest of the
 * shape comes out untouched.
 *
 * MUTATES `wire` and returns that same object: it is called on what this
 * client just built from `JSON.parse`, so mutating in place is cheaper than
 * copying a response that carries every mesh, and the object is not shared
 * with anyone yet. A caller passing an object it keeps a second reference to
 * sees the field disappear from both, and a frozen object throws. Deleting rather than assigning
 * `undefined` keeps "the server sent nothing" and "the server sent something
 * unusable" indistinguishable to a consumer, which is what the type says.
 */
export function withNarrowedCoordinateSpace<T extends { mesh_coordinate_space?: unknown }>(
  wire: T
): T & { mesh_coordinate_space?: MeshCoordinateSpace } {
  const raw = wire.mesh_coordinate_space;
  if (raw !== undefined && asMeshCoordinateSpace(raw) === undefined) {
    console.warn(
      `[client] Ignoring unrecognised mesh_coordinate_space ${JSON.stringify(raw)}; expected one of ${MESH_COORDINATE_SPACES.join(', ')}`
    );
    delete wire.mesh_coordinate_space;
  }
  // The one cast a runtime guard exists to license: by here the field is
  // absent or one of the three tiers. Scoped to this property rather than an
  // `as unknown as`, so the rest of the shape is still checked.
  return wire as T & { mesh_coordinate_space?: MeshCoordinateSpace };
}
