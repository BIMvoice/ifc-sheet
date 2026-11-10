/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A DXF block as the plan symbol of a door or window type (#448): read from a DXF file, kept on the type's catalogue entry
 * (`JoinerySpec.planBlock`), and fitted to each opening when a plan draws it.
 *
 * Reading reuses the DXF parser and converter of `@ifc-lite/drawing-2d` (units from $INSUNITS, arcs, circles and polyline bulges
 * flattened, nested INSERTs expanded): the chosen block becomes a one-block document and goes through `convertDxfToUnderlay`. Drawn:
 * LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE and INSERTs of blocks made of those. Every other entity (text, hatch, ellipse, spline, solid,
 * dimension, ...) is not drawn and is counted in the report, never dropped silently. A file with no $INSUNITS is taken as millimetres,
 * the unit of building drawings, and the report says so.
 *
 * Convention of the block: drawn as a left-hand opening (hinge at -X), the opening running along X and +Y towards the exterior, the
 * type frame of `symbols.ts`. A type whose leaf hinges on the right draws it mirrored in X.
 */

import { convertDxfToUnderlay, parseDxf, type DxfDocument, type DxfEntity } from '@ifc-lite/drawing-2d';
import type { JoineryBlockPath, JoineryBlockSymbol, JoinerySpec } from '@ifc-lite/create';

export const MAX_BLOCK_PATHS = 2000;
export const MAX_BLOCK_POINTS = 20000;
const DRAWN = new Set<DxfEntity['kind']>(['line', 'polyline', 'circle', 'arc', 'insert']);

export interface DxfBlockReport {
  /** Entities of the block (and of the blocks it inserts) that are not drawn, by entity kind. */
  unsupported: Record<string, number>;
  /** Entity types the parser skipped anywhere in the file; they may or may not be in this block. */
  skippedInFile: Record<string, number>;
  /** The file states no $INSUNITS and the block was read as millimetres. */
  assumedMillimetres: boolean;
  /** The block held more strokes or points than a symbol keeps; the rest is left out. */
  truncated: boolean;
  warnings: string[];
}

export interface DxfBlockRead { symbol: JoineryBlockSymbol | null; report: DxfBlockReport }

/** The names of the blocks of a DXF that hold drawable geometry (anonymous `*` blocks, such as dimension and model space, are left out). */
export function listDxfBlocks(text: string): string[] {
  const doc = parseDxf(text);
  return [...doc.blocks.values()].filter((b) => !b.name.startsWith('*') && b.entities.some((e) => DRAWN.has(e.kind))).map((b) => b.name);
}

/** The kinds of entity of `name` and, once each, of every block it inserts, that are not drawn. */
function countUnsupported(doc: DxfDocument, name: string, seen: Set<string>, out: Record<string, number>): void {
  if (seen.has(name)) return;
  seen.add(name);
  for (const e of doc.blocks.get(name)?.entities ?? []) {
    if (e.kind === 'insert') countUnsupported(doc, e.blockName, seen, out);
    else if (!DRAWN.has(e.kind)) out[e.kind] = (out[e.kind] ?? 0) + 1;
  }
}

/** The block `name` of the DXF `text` as a plan symbol, with what was not read. The symbol is null when the block is missing or has nothing drawable. */
export function readDxfBlock(text: string, name: string): DxfBlockRead {
  const doc = parseDxf(text);
  const report: DxfBlockReport = { unsupported: {}, skippedInFile: { ...doc.skipped }, assumedMillimetres: doc.insunits === 0, truncated: false, warnings: [] };
  const block = doc.blocks.get(name);
  if (!block) return { symbol: null, report: { ...report, warnings: [`Block "${name}" is not in the file.`] } };
  countUnsupported(doc, name, new Set(), report.unsupported);
  // Only what is drawn goes through the converter, so nothing else is drawn by accident.
  const blocks = new Map([...doc.blocks].map(([k, b]) => [k, { ...b, entities: b.entities.filter((e) => DRAWN.has(e.kind)) }]));
  const one: DxfDocument = { ...doc, blocks, entities: blocks.get(name)!.entities };
  const underlay = convertDxfToUnderlay(one, name, report.assumedMillimetres ? { metersPerUnit: 0.001 } : {});
  report.warnings.push(...underlay.warnings.filter((w) => !w.includes('$INSUNITS')));
  const bx = block.baseX * underlay.unitScale, by = block.baseY * underlay.unitScale;
  const paths: JoineryBlockPath[] = [];
  let points = 0;
  for (const layer of underlay.layers) {
    for (const p of layer.paths) {
      if (p.points.length < 2) continue;
      if (paths.length >= MAX_BLOCK_PATHS || points + p.points.length > MAX_BLOCK_POINTS) { report.truncated = true; continue; }
      points += p.points.length;
      paths.push({ pts: p.points.map((q): [number, number] => [q.x - bx, q.y - by]), ...(p.closed ? { closed: true as const } : {}), ...(p.dashed ? { dashed: true as const } : {}) });
    }
  }
  return { symbol: paths.length ? { name, paths } : null, report };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A stored block, tolerantly: strokes of at least two finite points, within the caps; null when nothing is left. */
export function readJoineryBlock(v: unknown): JoineryBlockSymbol | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const raw = v as Record<string, unknown>;
  if (!Array.isArray(raw.paths)) return null;
  const paths: JoineryBlockPath[] = [];
  let points = 0;
  for (const p of raw.paths) {
    if (paths.length >= MAX_BLOCK_PATHS || typeof p !== 'object' || p === null || !Array.isArray((p as { pts?: unknown }).pts)) continue;
    const q = p as { pts: unknown[]; closed?: unknown; dashed?: unknown };
    const pts = q.pts.filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2 && isNum(pt[0]) && isNum(pt[1])).map((pt): [number, number] => [pt[0], pt[1]]);
    if (pts.length < 2 || points + pts.length > MAX_BLOCK_POINTS) continue;
    points += pts.length;
    paths.push({ pts, ...(q.closed === true ? { closed: true as const } : {}), ...(q.dashed === true ? { dashed: true as const } : {}) });
  }
  return paths.length ? { name: typeof raw.name === 'string' ? raw.name : '', paths } : null;
}

export interface BlockStroke { pts: Array<{ x: number; y: number }>; closed?: boolean; dashed?: boolean; weight: 'cut' | 'outline' }

/** Whether the type's leaves hinge on the right: its first handed leaf (left to right) is a right-hand one. Such a type draws the block mirrored. */
export function mirrorsBlock(spec: Pick<JoinerySpec, 'panels'>): boolean {
  const handed = [...spec.panels].sort((a, b) => a.row - b.row || a.col - b.col).find((p) => p.operation.endsWith('-left') || p.operation.endsWith('-right'));
  return handed?.operation.endsWith('-right') === true;
}

/**
 * The strokes of the type's plan block in the type frame (x along the opening, centred; y across the wall, +y exterior), or null when the
 * type has none (or it has no extent). The block's width becomes the opening width. A window's depth becomes the frame depth, centred
 * on the frame; a door keeps the block's proportions (its swing stays a circle) and its base point sits on the frame's centre line.
 * A right-hand type is mirrored in X.
 */
export function blockPlanStrokes(spec: Pick<JoinerySpec, 'kind' | 'width' | 'frame' | 'panels' | 'planBlock'>): BlockStroke[] | null {
  const block = spec.planBlock;
  if (!block) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of block.paths) for (const [x, y] of p.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (!(x1 - x0 > 1e-9)) return null;
  const sx = spec.width / (x1 - x0);
  const flat = !(y1 - y0 > 1e-9);
  const window = spec.kind === 'window';
  const sy = window && !flat ? spec.frame.depth / (y1 - y0) : sx;
  const mid = (x0 + x1) / 2;
  const y = (v: number) => spec.frame.offset + (window ? (v - (y0 + y1) / 2) * sy : v * sy);
  const m = mirrorsBlock(spec) ? -1 : 1;
  return block.paths.map((p) => ({
    pts: p.pts.map(([px, py]) => ({ x: m * (px - mid) * sx, y: y(py) })),
    closed: p.closed === true,
    dashed: p.dashed === true,
    weight: p.closed === true ? 'cut' : 'outline',
  }));
}

/** The catalogue with entry `entryId` carrying `block` as its plan symbol (null removes it); the list itself when it has no such entry. The input is not changed. */
export function withPlanBlock(types: readonly JoinerySpec[], entryId: string, block: JoineryBlockSymbol | null): JoinerySpec[] {
  return types.map((e) => {
    if (e.id !== entryId) return e;
    const { planBlock: _p, ...rest } = e;
    return block ? { ...rest, planBlock: block } : rest;
  });
}
