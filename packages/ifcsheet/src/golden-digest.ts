/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The golden-sheet benchmark's digest (#363): a compact, deterministic summary
 * of a model's drawing set, small enough to keep in the repository and read in
 * a review. Per sheet: number, name, paper, scales, the vector layout (counts,
 * a rounded bounding box, a hash of the path data rounded to 0.01 mm, per pen
 * and overall) and the text. Per model: the key figures (Au and its levels).
 *
 * Nothing in it is a timestamp, an id or an engine-internal order: sheets are
 * keyed by number, pens by layer, colour and ordinal, paths and texts sorted.
 */

import { createHash } from 'node:crypto';
import type { ProjectDocument } from './document.js';
import type { Polyline, SheetGraphic } from './sheet-graphic.js';
import { roomSchedule } from './room-schedule.js';
import { readRooms } from './room-read.js';
import type { OpenedModel } from './model.js';

export const DIGEST_VERSION = 1;

/** Paper millimetres, rounded to 0.01 and never `-0`. */
const mm = (v: number): number => Math.round(v * 100) / 100 + 0;

export interface PathStats {
  paths: number;
  points: number;
  /** sha256 (16 hex) of the sorted, rounded path data. */
  hash: string;
}

export interface PenDigest extends PathStats {
  width: number;
  dash: string;
  /** Fill regions; `paths` counts a stroke's runs. */
  regions: number;
}

export interface SheetDigest {
  name: string;
  paper: string;
  scales: string[];
  views: string[];
  bbox: number[];
  frame: PathStats;
  cut: PathStats;
  lines: PathStats;
  marks: PathStats;
  pens: Record<string, PenDigest>;
  texts: string[];
  images: number;
}

export interface FigureDigest {
  storeys: string[];
  rooms: number;
  /** Au, m², 0.01. Null when no room has an area. */
  au: number | null;
  levelTotals: Record<string, number | null>;
  areaFromGeometry: number;
  roomsWithoutArea: number;
  extent: string;
}

export interface ModelDigest {
  version: number;
  figures: FigureDigest;
  sheets: Record<string, SheetDigest>;
}

const pathData = (p: Polyline): string => p.map((q) => `${mm(q.x)},${mm(q.y)}`).join(' ');
const hashOf = (parts: readonly string[]): string => createHash('sha256').update([...parts].sort().join('\n')).digest('hex').slice(0, 16);

function stats(paths: readonly Polyline[]): PathStats {
  return { paths: paths.length, points: paths.reduce((n, p) => n + p.length, 0), hash: hashOf(paths.map(pathData)) };
}

function boxOf(sheet: SheetGraphic): number[] {
  const all: Polyline[] = [...sheet.frame, ...sheet.cut, ...sheet.lines, ...sheet.marks, ...sheet.pens.flatMap((p) => [...p.runs, ...p.regions.flat()])];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const path of all) for (const q of path) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return all.length ? [mm(x0), mm(y0), mm(x1), mm(y1)] : [];
}

/** Pens in paint order get `layer stroke fill #n`: the same pen keeps its key when its weight changes. */
function pensOf(sheet: SheetGraphic): Record<string, PenDigest> {
  const seen = new Map<string, number>();
  const out: Record<string, PenDigest> = {};
  for (const pen of sheet.pens) {
    const base = `${pen.layer} stroke=${pen.stroke ?? '-'} fill=${pen.fill ?? '-'}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const regions = pen.regions.map((loops) => loops.map(pathData).join(' | '));
    const runs = pen.runs.map(pathData);
    out[`${base} #${n}`] = {
      width: mm(pen.width),
      dash: (pen.dash ?? []).map(mm).join(','),
      paths: pen.runs.length,
      regions: pen.regions.length,
      points: pen.runs.reduce((k, r) => k + r.length, 0) + pen.regions.reduce((k, loops) => k + loops.reduce((j, l) => j + l.length, 0), 0),
      hash: hashOf([...runs.map((r) => `run ${r}`), ...regions.map((r) => `region ${r}`)]),
    };
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

const sorted = <T>(xs: T[]): T[] => xs.sort((a, b) => (String(a) < String(b) ? -1 : 1));

export function digestSheet(sheet: SheetGraphic, doc: ProjectDocument): SheetDigest {
  const placed = doc.sheets.find((s) => s.id === sheet.sheetId)?.viewports ?? [];
  const viewName = (id: string) => doc.views.find((v) => v.id === id)?.name ?? '?';
  return {
    name: sheet.name,
    paper: `${mm(sheet.paper.w)} x ${mm(sheet.paper.h)} mm`,
    scales: sorted([...new Set(placed.map((vp) => `1:${vp.scale}`))]),
    views: sorted(placed.map((vp) => `${viewName(vp.viewId)} 1:${vp.scale}`)),
    bbox: boxOf(sheet),
    frame: stats(sheet.frame),
    cut: stats(sheet.cut),
    lines: stats(sheet.lines),
    marks: stats(sheet.marks),
    pens: pensOf(sheet),
    texts: sorted(sheet.texts.map((t) => `${t.text} @${mm(t.at.x)},${mm(t.at.y)} h${mm(t.size)}${t.align ? ` ${t.align}` : ''}${t.angle ? ` rot${mm(t.angle)}` : ''}`)),
    images: sheet.images.length,
  };
}

export function digestFigures(model: OpenedModel): FigureDigest {
  const read = readRooms(model.dataStore, model.meshes);
  const schedule = roomSchedule(read.levels, read.rooms);
  const round = (v: number | null) => (v === null ? null : mm(v));
  const e = model.extent;
  return {
    storeys: sorted(model.storeys.map((s) => s.name)),
    rooms: schedule.rooms,
    au: round(schedule.total),
    levelTotals: Object.fromEntries(sorted(schedule.levels.map((l) => [l.name || '(no level)', round(l.total)] as const)).map((x) => x)),
    areaFromGeometry: schedule.fromGeometry,
    roomsWithoutArea: schedule.withoutArea,
    extent: e ? [e.min.x, e.min.y, e.min.z, e.max.x, e.max.y, e.max.z].map((v) => Math.round(v * 100) / 100 + 0).join(' ') : '',
  };
}

/** The digest of a model's drawing set. Sheets are keyed by number (a repeated number gets `#2`, `#3`). */
export function digestModel(model: OpenedModel, doc: ProjectDocument, sheets: readonly SheetGraphic[]): ModelDigest {
  const keyed: Record<string, SheetDigest> = {};
  for (const sheet of sheets) {
    let key = sheet.number;
    for (let n = 2; key in keyed; n++) key = `${sheet.number} #${n}`;
    keyed[key] = digestSheet(sheet, doc);
  }
  return { version: DIGEST_VERSION, figures: digestFigures(model), sheets: Object.fromEntries(Object.entries(keyed).sort(([a], [b]) => (a < b ? -1 : 1))) };
}
