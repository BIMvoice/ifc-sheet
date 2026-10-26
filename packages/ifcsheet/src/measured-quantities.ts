/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An element's volume and area measured from its geometry (#74), for the
 * takeoffs of a model that states no Qto set. The model's own figure always
 * wins (`withMeasured`); a measured one is marked as measured wherever it is
 * printed, and a figure that cannot be measured soundly is refused with a
 * reason rather than guessed.
 *
 * ## Frame and units
 *
 * The meshes are the ones the viewer draws (`MeshData`): Y up, METRES, world
 * position = `origin + positions[i]`. The engine puts them there, not this
 * module: `GeometryRouter` in `rust/geometry/src/router/mod.rs` reads the
 * file's length unit (`scan_unit_scale`) and scales the geometry and the
 * placement translation by it (`scale_transform`), and the wasm boundary swaps
 * IFC Z-up to Y-up (`[x, z, -y]`, `rust/processing/src/simplify_math.rs`). So a
 * volume summed here is in m³ and an area in m² whatever the model's length
 * unit is; no unit scale is applied, and applying one would be wrong.
 *
 * ## Volume: the divergence theorem, only over a closed, oriented surface
 *
 * V = (1/6) Σ a · (b × c) over the triangles. That sum is the enclosed volume
 * only when the triangles form a closed surface wound one way. Meshes repeat a
 * vertex per face (flat normals), so the vertices are first welded by position
 * (a 10 µm grid, the kernel orienter's weld). Then every directed edge a→b must
 * be matched by as many b→a: an unmatched edge is a hole (an open shell) or a
 * face wound against its neighbours, and either way the sum would be a wrong
 * number, so it is refused. Each connected part is summed on its own; parts
 * wound opposite ways are refused too (it cannot be told whether that is a void
 * or a flipped part). An inward-wound solid is turned outward.
 *
 * Every coordinate is taken relative to a point of the element itself (its
 * first vertex) before anything is summed: a georeferenced model sits millions
 * of metres from the origin, where a · (b × c) is ~10²⁰ and the volume of a wall
 * would cancel away in rounding.
 *
 * The meshes are the cut geometry the viewer renders (openings already
 * subtracted), so the volume is the net volume.
 *
 * ## Areas
 *
 * Both are taken from the same closed, outward-oriented surface.
 * - Wall (`wallSide`): ONE side face, openings removed. The faces standing
 *   upright whose normal lies within 10° of the wall's thickness direction (the
 *   area-weighted principal direction of the upright faces), totalled and
 *   halved: the two sides are averaged, and the ends and the reveals of the
 *   openings are left out. A wall whose such faces are under half its upright
 *   area is not straight (curved, or no longer than thick) and gets no area.
 * - Slab (`slabTop`): the top face, openings removed: the faces whose outward
 *   normal points up by more than 10° (a pitched slab's top included).
 */

/** One mesh piece of an element: what `MeshData` carries, the origin folded in by this module. */
export interface MeasureMesh {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  origin?: readonly number[] | null;
}

/** Why a figure was not measured. */
export type MeasureRefusal =
  /** No triangle to measure (no body, or not loaded). */
  | 'noGeometry'
  /** The surface has holes: an open shell, a sheet. */
  | 'notClosed'
  /** The surface is closed but its faces, or its parts, are not wound one way. */
  | 'notOriented'
  /** Closed, but encloses nothing (a doubled sheet). */
  | 'noVolume'
  /** A wall that is curved, or no longer than it is thick: no one side face to measure. */
  | 'notStraight';

export type MeasuredFigure = { value: number; refusal: null } | { value: null; refusal: MeasureRefusal };

export type MeasuredAreaKind = 'wallSide' | 'slabTop';

export interface ElementMeasure {
  /** m³. */
  volume: MeasuredFigure;
  /** m²; null when the class has no measured area (only walls and slabs do). */
  area: MeasuredFigure | null;
  areaKind: MeasuredAreaKind | null;
}

/** The weld grid, metres: vertices closer than this on every axis are one. */
const WELD = 1e-5;
/** Below this a closed surface encloses nothing, m³ (a millimetre cube). */
const NO_VOLUME = 1e-9;
/** sin 10° and cos 10°: the tolerance on "upright", "up" and "along the thickness". */
const SIN_10 = Math.sin((10 * Math.PI) / 180);
const COS_10 = Math.cos((10 * Math.PI) / 180);

/** Which measured area a class has: walls their side, slabs their top; others none. */
export function measuredAreaKind(className: string): MeasuredAreaKind | null {
  const c = className.toUpperCase().replace(/(STANDARDCASE|ELEMENTEDCASE)$/, '');
  if (c === 'IFCWALL') return 'wallSide';
  if (c === 'IFCSLAB') return 'slabTop';
  return null;
}

const refuse = (refusal: MeasureRefusal): MeasuredFigure => ({ value: null, refusal });

interface Surface {
  /** Welded vertex positions, relative to the element's first vertex, xyz. */
  points: number[];
  /** Triangles as welded vertex ids, three each; degenerate ones dropped. */
  triangles: number[];
}

/** The element's triangles, welded, relative to its first vertex; null when there is none. */
function weld(meshes: readonly MeasureMesh[]): Surface | null {
  const ids = new Map<string, number>();
  const points: number[] = [];
  const triangles: number[] = [];
  let anchor: [number, number, number] | null = null;
  for (const mesh of meshes) {
    const p = mesh.positions, ix = mesh.indices;
    const count = Math.floor(p.length / 3);
    const ox = mesh.origin?.[0] ?? 0, oy = mesh.origin?.[1] ?? 0, oz = mesh.origin?.[2] ?? 0;
    if (!anchor && count > 0) anchor = [ox + p[0], oy + p[1], oz + p[2]];
    if (!anchor) continue;
    // Origin minus anchor first: both may be millions of metres, their difference is small and exact enough.
    const dx = ox - anchor[0], dy = oy - anchor[1], dz = oz - anchor[2];
    const corner = new Array<number>(3);
    for (let t = 0; t + 2 < ix.length; t += 3) {
      let bad = false;
      for (let k = 0; k < 3; k++) {
        const v = ix[t + k];
        if (!(v >= 0 && v < count)) { bad = true; break; }
        const x = dx + p[v * 3], y = dy + p[v * 3 + 1], z = dz + p[v * 3 + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { bad = true; break; }
        const key = `${Math.round(x / WELD)},${Math.round(y / WELD)},${Math.round(z / WELD)}`;
        let id = ids.get(key);
        if (id === undefined) {
          id = points.length / 3;
          ids.set(key, id);
          points.push(x, y, z);
        }
        corner[k] = id;
      }
      // An unreadable triangle leaves a hole where it was; the edge check refuses the element.
      if (bad) { triangles.push(-1, -1, -1); continue; }
      // A triangle welded to a line or a point has no area and its edges cancel: drop it.
      if (corner[0] === corner[1] || corner[1] === corner[2] || corner[0] === corner[2]) continue;
      triangles.push(corner[0], corner[1], corner[2]);
    }
  }
  return triangles.length ? { points, triangles } : null;
}

/** Closed and wound one way: every directed edge a→b matched by as many b→a. Else why not. */
function edgeCheck(s: Surface): MeasureRefusal | null {
  if (s.triangles.includes(-1)) return 'notClosed';
  const n = s.points.length / 3;
  const directed = new Map<number, number>();
  for (let t = 0; t < s.triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const key = s.triangles[t + k] * n + s.triangles[t + ((k + 1) % 3)];
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }
  let unmatched = false;
  for (const [key, count] of directed) {
    const a = Math.floor(key / n), b = key % n;
    const back = directed.get(b * n + a) ?? 0;
    if (back === count) continue;
    unmatched = true;
    // An edge used an odd number of times in all is a hole: no winding can close it.
    if ((count + back) % 2 === 1) return 'notClosed';
  }
  return unmatched ? 'notOriented' : null;
}

/** The connected parts: a part id per triangle. */
function parts(s: Surface): Int32Array {
  const parent = new Int32Array(s.points.length / 3).map((_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let t = 0; t < s.triangles.length; t += 3) {
    const a = root(s.triangles[t]);
    parent[root(s.triangles[t + 1])] = a;
    parent[root(s.triangles[t + 2])] = a;
  }
  const part = new Int32Array(s.triangles.length / 3);
  for (let t = 0; t < part.length; t++) part[t] = root(s.triangles[t * 3]);
  return part;
}

/** Six times the signed volume of each triangle's tetrahedron with the anchor. */
function signedSix(s: Surface, t: number): number {
  const P = s.points, a = s.triangles[t] * 3, b = s.triangles[t + 1] * 3, c = s.triangles[t + 2] * 3;
  return P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1])
    - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c])
    + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
}

/** Twice the area vector of a triangle, outward when `sign` is the surface's winding. */
function areaVector(s: Surface, t: number, sign: number): [number, number, number] {
  const P = s.points, a = s.triangles[t] * 3, b = s.triangles[t + 1] * 3, c = s.triangles[t + 2] * 3;
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
  const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
  return [sign * (uy * vz - uz * vy), sign * (uz * vx - ux * vz), sign * (ux * vy - uy * vx)];
}

function slabTop(s: Surface, sign: number): MeasuredFigure {
  let twice = 0;
  for (let t = 0; t < s.triangles.length; t += 3) {
    const [x, y, z] = areaVector(s, t, sign);
    const len = Math.hypot(x, y, z);
    if (len > 0 && y / len > SIN_10) twice += len;
  }
  return { value: twice / 2, refusal: null };
}

function wallSide(s: Surface, sign: number): MeasuredFigure {
  // The upright faces, and the thickness direction: their normals' principal direction, by doubled angle so n and -n agree.
  const upright: { x: number; z: number; len: number }[] = [];
  let c2 = 0, s2 = 0, total = 0;
  for (let t = 0; t < s.triangles.length; t += 3) {
    const [x, y, z] = areaVector(s, t, sign);
    const len = Math.hypot(x, y, z);
    if (len === 0 || Math.abs(y) / len >= SIN_10) continue;
    const h = Math.hypot(x, z);
    upright.push({ x: x / h, z: z / h, len });
    c2 += len * ((x * x - z * z) / (h * h));
    s2 += len * ((2 * x * z) / (h * h));
    total += len;
  }
  if (total === 0) return refuse('notStraight');
  const phi = Math.atan2(s2, c2) / 2;
  const ax = Math.cos(phi), az = Math.sin(phi);
  let aligned = 0;
  for (const f of upright) if (Math.abs(f.x * ax + f.z * az) >= COS_10) aligned += f.len;
  // Two equal sides against everything else upright: under half means no straight wall to take a side of.
  if (aligned < total / 2) return refuse('notStraight');
  // Twice the area, both sides: a quarter of the sum is one side.
  return { value: aligned / 4, refusal: null };
}

/**
 * Measure one element from its mesh pieces (all of one occurrence). The
 * volume for any class; the area for walls (one side) and slabs (top) only.
 */
export function measureElement(className: string, meshes: readonly MeasureMesh[]): ElementMeasure {
  const areaKind = measuredAreaKind(className);
  const fail = (r: MeasureRefusal): ElementMeasure => ({ volume: refuse(r), area: areaKind ? refuse(r) : null, areaKind });
  const s = weld(meshes);
  if (!s) return fail('noGeometry');
  const bad = edgeCheck(s);
  if (bad) return fail(bad);
  const part = parts(s);
  const byPart = new Map<number, number>();
  for (let t = 0; t < part.length; t++) byPart.set(part[t], (byPart.get(part[t]) ?? 0) + signedSix(s, t * 3));
  let pos = 0, neg = 0;
  for (const six of byPart.values()) {
    if (six / 6 > NO_VOLUME) pos += six; else if (six / 6 < -NO_VOLUME) neg += six;
  }
  if (pos > 0 && neg < 0) return fail('notOriented');
  const signed = (pos + neg) / 6;
  if (Math.abs(signed) <= NO_VOLUME) return fail('noVolume');
  const sign = signed > 0 ? 1 : -1;
  const area = areaKind === 'wallSide' ? wallSide(s, sign) : areaKind === 'slabTop' ? slabTop(s, sign) : null;
  return { volume: { value: Math.abs(signed), refusal: null }, area, areaKind };
}

export type QuantitySource = 'declared' | 'measured';

/** An element's volume and area with where each comes from. */
export interface SourcedQuantities {
  volume: number | null;
  area: number | null;
  /** null when the figure is null. */
  volumeSource: QuantitySource | null;
  areaSource: QuantitySource | null;
  /** Why a figure the model does not state could not be measured either; absent when it was not attempted. */
  volumeRefusal?: MeasureRefusal;
  areaRefusal?: MeasureRefusal;
}

/**
 * The model's own figures, with what it does not state measured from the
 * geometry: a declared figure always wins, and the geometry is only read
 * (`meshes` called) when one is missing. A measured area is only filled for
 * the classes `measuredAreaKind` names.
 */
export function withMeasured(
  declared: { volume: number | null; area: number | null },
  className: string,
  meshes: () => readonly MeasureMesh[] | undefined,
): SourcedQuantities {
  const out: SourcedQuantities = {
    volume: declared.volume, area: declared.area,
    volumeSource: declared.volume === null ? null : 'declared', areaSource: declared.area === null ? null : 'declared',
  };
  const wantArea = declared.area === null && measuredAreaKind(className) !== null;
  if (declared.volume !== null && !wantArea) return out;
  const m = measureElement(className, meshes() ?? []);
  if (declared.volume === null) {
    if (m.volume.value !== null) Object.assign(out, { volume: m.volume.value, volumeSource: 'measured' });
    else out.volumeRefusal = m.volume.refusal;
  }
  if (wantArea && m.area) {
    if (m.area.value !== null) Object.assign(out, { area: m.area.value, areaSource: 'measured' });
    else out.areaRefusal = m.area.refusal;
  }
  return out;
}
