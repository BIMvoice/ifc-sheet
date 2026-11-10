/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A DXF block as the plan symbol of a door or window type (#448): read from a fixture DXF (millimetres; `DOOR90` a left-hand leaf open
 * towards -Y with its swing arc, `WIN120` a frame with a glazing line, a circle, and a TEXT and an ELLIPSE that cannot be drawn), fitted
 * to the opening, mirrored for a right-hand type, and kept on the catalogue entry through a project file.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultDoorSpec, defaultWindowSpec, type JoinerySpec } from '@ifc-lite/create';
import { blockPlanStrokes, listDxfBlocks, mirrorsBlock, readDxfBlock, readJoineryBlock, withPlanBlock } from './joinery-block-symbol.js';
import { readJoineryList, readJoinerySpec } from './joinery-spec-read.js';

const DXF = readFileSync(new URL('./__fixtures__/door-window-blocks.dxf', import.meta.url), 'utf8');

const door = (op: 'swing-left' | 'swing-right', width = 1): JoinerySpec => {
  const d = defaultDoorSpec();
  return { ...d, width, panels: [{ col: 0, row: 0, operation: op }], planBlock: readDxfBlock(DXF, 'DOOR90').symbol! };
};
const bounds = (strokes: { pts: { x: number; y: number }[] }[]) => {
  const xs = strokes.flatMap((s) => s.pts.map((p) => p.x)), ys = strokes.flatMap((s) => s.pts.map((p) => p.y));
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

describe('reading a block of a DXF', () => {
  it('lists the blocks that hold drawable geometry', () => {
    expect(listDxfBlocks(DXF)).toEqual(['DOOR90', 'WIN120']);
  });

  it('turns the block\'s lines, polyline, arc and circle into strokes in metres from its base point', () => {
    const { symbol, report } = readDxfBlock(DXF, 'DOOR90');
    expect(symbol?.name).toBe('DOOR90');
    const b = bounds(symbol!.paths.map((p) => ({ pts: p.pts.map(([x, y]) => ({ x, y })) })));
    // The file is in millimetres ($INSUNITS 4): 900 become 0.9 m.
    expect(b.x1).toBeCloseTo(0.9, 6);
    expect(b.x0).toBeCloseTo(0, 6);
    expect(b.y0).toBeCloseTo(-0.9, 6);
    expect(symbol!.paths.filter((p) => p.closed)).toHaveLength(1);
    expect(report.assumedMillimetres).toBe(false);
    expect(readDxfBlock(DXF, 'WIN120').symbol!.paths).toHaveLength(3);
  });

  it('reports what it does not draw instead of dropping it silently', () => {
    const { symbol, report } = readDxfBlock(DXF, 'WIN120');
    expect(symbol).not.toBeNull();
    expect(report.unsupported).toEqual({ text: 1, ellipse: 1 });
    expect(readDxfBlock(DXF, 'DOOR90').report.unsupported).toEqual({});
  });

  it('a file without units is read as millimetres and says so; a missing block is no symbol', () => {
    const unitless = DXF.replace('$INSUNITS\n70\n4', '$INSUNITS\n70\n0');
    const read = readDxfBlock(unitless, 'DOOR90');
    expect(read.report.assumedMillimetres).toBe(true);
    expect(bounds(read.symbol!.paths.map((p) => ({ pts: p.pts.map(([x, y]) => ({ x, y })) }))).x1).toBeCloseTo(0.9, 6);
    expect(readDxfBlock(DXF, 'NOPE').symbol).toBeNull();
  });
});

describe('fitting the block to an opening', () => {
  it('a door\'s block takes the opening width, its swing keeping its proportions', () => {
    const b = bounds(blockPlanStrokes(door('swing-left', 0.8))!);
    expect(b.x1 - b.x0).toBeCloseTo(0.8, 6);
    expect(b.y1 - b.y0).toBeCloseTo(0.8, 6);
  });

  it('a window\'s block takes the opening width and the frame depth, centred on the frame', () => {
    const w = defaultWindowSpec();
    const spec: JoinerySpec = { ...w, width: 1.5, frame: { ...w.frame, depth: 0.2, offset: 0.05 }, planBlock: readDxfBlock(DXF, 'WIN120').symbol! };
    const b = bounds(blockPlanStrokes(spec)!);
    expect(b.x1 - b.x0).toBeCloseTo(1.5, 6);
    expect(b.y1 - b.y0).toBeCloseTo(0.2, 6);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(0.05, 6);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(0, 6);
  });

  it('a right-hand type mirrors the block, a left-hand one does not', () => {
    const leaf = (spec: JoinerySpec) => blockPlanStrokes(spec)!.find((s) => s.closed)!.pts.map((p) => p.x);
    const left = leaf(door('swing-left')), right = leaf(door('swing-right'));
    // The leaf is on the hinge side: the left edge for a left-hand door, the right edge for a right-hand one.
    expect(Math.max(...left)).toBeLessThan(0);
    expect(Math.min(...right)).toBeGreaterThan(0);
    expect(mirrorsBlock(door('swing-right'))).toBe(true);
    expect(mirrorsBlock(door('swing-left'))).toBe(false);
  });
});

describe('a project file', () => {
  it('keeps the block on the entry and reads it back', () => {
    const spec = door('swing-right');
    const back = readJoinerySpec(JSON.parse(JSON.stringify(spec)));
    expect(back?.planBlock).toEqual(spec.planBlock);
    expect(readJoineryBlock({ name: 'x', paths: [{ pts: [[0, 0], [Number.NaN, 1]] }] })).toBeNull();
  });

  it('an entry saved before blocks existed has none, and nothing about it changes', () => {
    const legacy = JSON.parse(JSON.stringify(defaultDoorSpec()));
    const [read] = readJoineryList([legacy]);
    expect('planBlock' in read).toBe(false);
    expect(blockPlanStrokes(read)).toBeNull();
    expect(read).toEqual(readJoinerySpec({ ...legacy, planBlock: 'garbage' }));
  });

  it('assigns and removes a block on one entry only', () => {
    const a = { ...defaultDoorSpec(), id: 'a' }, b = { ...defaultDoorSpec(), id: 'b' };
    const block = readDxfBlock(DXF, 'DOOR90').symbol!;
    const set = withPlanBlock([a, b], 'a', block);
    expect(set[0].planBlock).toBe(block);
    expect('planBlock' in set[1]).toBe(false);
    expect('planBlock' in withPlanBlock(set, 'a', null)[0]).toBe(false);
  });
});
