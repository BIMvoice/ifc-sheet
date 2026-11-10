/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The coordinate frames a plan symbol is placed through (`plan-symbols.ts`): IfcAxis2Placement and
 * IfcLocalPlacement chains, IfcCartesianTransformationOperator, and the unit scales, all as 3 x 4 affine
 * matrices in the file's own length unit. Read from the parsed entities, not from the geometry engine,
 * which does not read 2D plan curves.
 */

import { firstProjAxis } from '@ifc-lite/data';
import type { IfcDataStore } from '@ifc-lite/parser';

export interface P3 { x: number; y: number; z: number }

/** Row-major 3 x 4: `[a00 a01 a02 tx, a10 a11 a12 ty, a20 a21 a22 tz]`. */
export type Xf = readonly number[];

export const IDENTITY: Xf = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export const ref = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** `a` applied after `b`. */
export function compose(a: Xf, b: Xf): Xf {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      out.push(a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + (c === 3 ? a[r * 4 + 3] : 0));
    }
  }
  return out;
}

export function apply(m: Xf, p: P3): P3 {
  return {
    x: m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
    y: m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
    z: m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11],
  };
}

/** The inverse of a rigid frame (an axis placement: orthonormal axes); not for a scaling operator. */
export function invertRigid(m: Xf): Xf {
  const t = [m[3], m[7], m[11]];
  const row = (r: number) => [m[r], m[4 + r], m[8 + r], -(m[r] * t[0] + m[4 + r] * t[1] + m[8 + r] * t[2])];
  return [...row(0), ...row(1), ...row(2)];
}

const norm = (v: readonly number[]): [number, number, number] | null => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-12 && Number.isFinite(l) ? [v[0] / l, v[1] / l, v[2] / l] : null;
};
const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The coordinates of an IfcCartesianPoint, or of an IfcDirection's ratios: three numbers (z 0 when the point is 2D). */
export function coords(store: IfcDataStore, id: number | null): [number, number, number] | null {
  if (id === null) return null;
  const list: unknown = store.getEntity(id)?.attributes?.[0];
  if (!Array.isArray(list) || list.length < 2) return null;
  const v: unknown[] = [list[0], list[1], list.length > 2 ? list[2] : 0];
  return v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? [v[0] as number, v[1] as number, v[2] as number] : null;
}

/**
 * The frame of an IfcAxis2Placement2D / 3D: its Location, and axes from Axis (z) and RefDirection (x), the missing
 * RefDirection filled the way the geometry engine fills it (`firstProjAxis`), so a symbol sits where the body does.
 */
export function axisFrame(store: IfcDataStore, id: number | null): Xf | null {
  if (id === null) return null;
  const placement = store.getEntity(id);
  if (!placement) return null;
  const type = String(placement.type).toUpperCase();
  if (type !== 'IFCAXIS2PLACEMENT2D' && type !== 'IFCAXIS2PLACEMENT3D') return null;
  const origin = coords(store, ref(placement.attributes?.[0]));
  if (!origin) return null;
  const is3d = type === 'IFCAXIS2PLACEMENT3D';
  const z = is3d ? norm(coords(store, ref(placement.attributes?.[1])) ?? [0, 0, 1]) ?? [0, 0, 1] : [0, 0, 1] as [number, number, number];
  const given = coords(store, ref(placement.attributes?.[is3d ? 2 : 1]));
  const dir = given ? norm(given) : null;
  // x = RefDirection less its component along z.
  const fill = firstProjAxis(z);
  const raw = dir ?? fill;
  const along = raw[0] * z[0] + raw[1] * z[1] + raw[2] * z[2];
  const x = norm([raw[0] - along * z[0], raw[1] - along * z[1], raw[2] - along * z[2]]) ?? fill;
  const y = cross(z, x);
  return [x[0], y[0], z[0], origin[0], x[1], y[1], z[1], origin[1], x[2], y[2], z[2], origin[2]];
}

/** An element's ObjectPlacement through every PlacementRelTo hop, or null for a placement this does not read (grid, linear). */
export function placementFrame(store: IfcDataStore, id: number | null, seen = new Set<number>()): Xf | null {
  if (id === null) return IDENTITY;
  if (seen.has(id)) return null;
  seen.add(id);
  const placement = store.getEntity(id);
  if (!placement || String(placement.type).toUpperCase() !== 'IFCLOCALPLACEMENT') return null;
  const parentId = ref(placement.attributes?.[0]);
  const parent = parentId === null ? IDENTITY : placementFrame(store, parentId, seen);
  const own = axisFrame(store, ref(placement.attributes?.[1]));
  return parent && own ? compose(parent, own) : null;
}

/**
 * An IfcCartesianTransformationOperator2D / 3D (an IfcMappedItem's MappingTarget): Axis1, Axis2 (and Axis3), LocalOrigin and
 * Scale (the non-uniform forms' Scale2 / Scale3 too). The axes follow IFC4 IfcBaseAxis: z is Axis3 or (0, 0, 1); x is Axis1
 * projected onto the plane perpendicular to z (IfcFirstProjAxis), except that a 2D operator with no Axis1 but an Axis2 takes
 * x = (Axis2.y, -Axis2.x); y is Axis2 projected perpendicular to z and x (IfcSecondProjAxis), or z x x when Axis2 is absent.
 * A second axis that points the other way mirrors, as the schema allows, and z is never flipped to undo it.
 */
export function operatorFrame(store: IfcDataStore, id: number | null): Xf | null {
  if (id === null) return IDENTITY;
  const op = store.getEntity(id);
  if (!op) return null;
  const type = String(op.type).toUpperCase();
  const is3d = type.startsWith('IFCCARTESIANTRANSFORMATIONOPERATOR3D');
  if (!is3d && !type.startsWith('IFCCARTESIANTRANSFORMATIONOPERATOR2D')) return null;
  const a = op.attributes ?? [];
  const origin = coords(store, ref(a[2])) ?? [0, 0, 0];
  const scale = typeof a[3] === 'number' && a[3] > 0 ? a[3] : 1;
  const nonUniform = type.endsWith('NONUNIFORM');
  const s2 = nonUniform && typeof a[is3d ? 5 : 4] === 'number' ? (a[is3d ? 5 : 4] as number) : scale;
  const s3 = nonUniform && is3d && typeof a[6] === 'number' ? (a[6] as number) : scale;
  const axis1 = coords(store, ref(a[0]));
  const axis2 = coords(store, ref(a[1]));
  const z: [number, number, number] = (is3d ? norm(coords(store, ref(a[4])) ?? [0, 0, 1]) : null) ?? [0, 0, 1];
  // IfcBaseAxis, 2D form: with no Axis1, an authored Axis2 fixes the frame and x is its clockwise perpendicular.
  const fromAxis2 = !is3d && !axis1 && axis2 && Math.hypot(axis2[0], axis2[1]) > 1e-12 ? [axis2[1], -axis2[0], 0] : null;
  const fill = firstProjAxis(z);
  const raw = norm(axis1 ?? fromAxis2 ?? fill) ?? fill;
  // IfcFirstProjAxis: x is the given axis less its component along z.
  const along = raw[0] * z[0] + raw[1] * z[1] + raw[2] * z[2];
  const x = norm([raw[0] - along * z[0], raw[1] - along * z[1], raw[2] - along * z[2]]) ?? fill;
  // IfcSecondProjAxis: y is Axis2 less its components along z and x, keeping its side (a mirrored operator keeps its mirror).
  const zx = cross(z, x);
  let y = zx;
  if (axis2) {
    const dz = axis2[0] * z[0] + axis2[1] * z[1] + axis2[2] * z[2];
    const v = [axis2[0] - dz * z[0], axis2[1] - dz * z[1], axis2[2] - dz * z[2]];
    const dx = v[0] * x[0] + v[1] * x[1] + v[2] * x[2];
    y = norm([v[0] - dx * x[0], v[1] - dx * x[1], v[2] - dx * x[2]]) ?? zx;
  }
  return [x[0] * scale, y[0] * s2, z[0] * s3, origin[0], x[1] * scale, y[1] * s2, z[1] * s3, origin[1], x[2] * scale, y[2] * s2, z[2] * s3, origin[2]];
}

/** One IFC plane-angle unit in radians: 1 for the SI radian, the conversion factor of a conversion-based unit (the degree). */
export function planeAngleScale(store: IfcDataStore): number {
  for (const id of store.entityIndex.byType.get('IFCCONVERSIONBASEDUNIT') ?? []) {
    const unit = store.getEntity(id);
    if (!unit || String(unit.attributes?.[1]).toUpperCase() !== '.PLANEANGLEUNIT.') continue;
    const measure = store.getEntity(ref(unit.attributes?.[3]) ?? -1);
    const value = measure?.attributes?.[0];
    const n = Array.isArray(value) ? value[1] : value;
    if (typeof n === 'number' && n > 0) return n;
  }
  return 1;
}
