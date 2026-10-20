/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A legend on paper: rows of the configured height, a swatch and a name in
 * each, columns that balance, a title that can go, and swatches that draw
 * what the entry is (hatch lines inside the swatch box, a layer's own pen).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LEGEND, type LegendConfig } from '@/catalogue/types';
import { DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import { BUILT_IN_SYMBOLS } from '@/drafting/symbols';
import type { LegendGroup } from './legend-data.js';
import { layoutLegend, type LegendLabels, type LegendLayoutContext, type LegendPrim } from './legend-layout.js';

const labels: LegendLabels = {
  heading: { materials: 'Materials', layers: 'Layers', hatches: 'Hatches', symbols: 'Symbols', annotations: 'Annotations' },
  continued: (h) => `${h} (cont.)`, tool: (t) => t, membrane: 'membrane', sampleText: 'Abc',
};
const ctx: LegendLayoutContext = { textStyle: { ...DEFAULT_TEXT_STYLE }, patterns: [], labels };
const config = (patch: Partial<LegendConfig> = {}): LegendConfig => ({ ...DEFAULT_LEGEND, ...patch });

const groups: LegendGroup[] = [
  { category: 'materials', entries: [
    { category: 'materials', name: 'Concrete', hatch: 'CONCRETE', hatchScale: 1, fill: null, membrane: false },
    { category: 'materials', name: 'PE foil', hatch: null, hatchScale: 1, fill: null, membrane: true },
    { category: 'materials', name: 'Brick', hatch: 'BRICK', hatchScale: 1, fill: '#cc8866', membrane: false },
  ] },
  { category: 'layers', entries: [
    { category: 'layers', name: 'A-WALL', color: '#aa0000', weight: 0.5, lineType: 'dashed' },
    { category: 'layers', name: 'A-DIM', color: '#0000aa', weight: 0.18, lineType: 'continuous' },
  ] },
  { category: 'symbols', entries: [{ category: 'symbols', name: 'North arrow', symbol: BUILT_IN_SYMBOLS[0] }] },
  { category: 'annotations', entries: [
    { category: 'annotations', name: 'Grid', type: { id: 'a', name: 'Grid', tool: 'axis', axis: { bubble: 'square', ends: 'both', size: null, lineType: 'dashed' } } },
    { category: 'annotations', name: 'Plot hatch', type: { id: 'b', name: 'Plot hatch', tool: 'hatch', hatch: { pattern: 'CROSS', scale: 1, angle: 0 } } },
  ] },
];

const texts = (l: { prims: LegendPrim[] }) => l.prims.flatMap((p) => (p.kind === 'text' ? [p] : []));
const labelsOf = (l: { prims: LegendPrim[] }) => texts(l).map((t) => t.text);

describe('legend layout', () => {
  it('has a title, a heading per category and one row per entry, each named', () => {
    const l = layoutLegend(groups, config({ title: 'Plan key' }), ctx);
    const names = labelsOf(l);
    assert.ok(names.includes('Plan key'));
    for (const h of ['Materials', 'Layers', 'Symbols', 'Annotations']) assert.ok(names.includes(h), h);
    for (const n of ['Concrete', 'PE foil (membrane)', 'Brick', 'A-WALL', 'A-DIM', 'North arrow', 'Grid (axis)', 'Plot hatch (hatch)']) assert.ok(names.includes(n), n);
  });

  it('the title and the headings can be switched off, and the legend gets shorter', () => {
    const full = layoutLegend(groups, config(), ctx);
    const bare = layoutLegend(groups, config({ showTitle: false, headings: false }), ctx);
    assert.ok(bare.height < full.height);
    assert.ok(!labelsOf(bare).includes('Legend') && !labelsOf(bare).includes('Materials'));
  });

  it('row height sets the pitch of the rows', () => {
    const rows = (rowHeight: number) => {
      const l = layoutLegend(groups, config({ rowHeight, headings: false, showTitle: false }), ctx);
      // Only the names (the samples inside swatches have their own text).
      const ys = texts(l).filter((t) => Math.abs(t.x - (4 + DEFAULT_LEGEND.swatchWidth + 3)) < 1e-6).map((t) => t.y).sort((a, b) => a - b);
      return ys.slice(1).map((y, i) => y - ys[i]).filter((d) => d > 1e-6);
    };
    assert.ok(rows(7).every((d) => Math.abs(d - 7) < 1e-6));
    assert.ok(rows(12).every((d) => Math.abs(d - 12) < 1e-6));
  });

  it('columns balance: two columns are about half as tall and wider, and no text is lost', () => {
    const one = layoutLegend(groups, config({ columns: 1 }), ctx);
    const two = layoutLegend(groups, config({ columns: 2 }), ctx);
    assert.ok(two.height < one.height * 0.75, `${two.height} vs ${one.height}`);
    assert.ok(two.width > one.width);
    assert.deepEqual(labelsOf(two).filter((t) => !t.endsWith('(cont.)')).sort(), labelsOf(one).sort());
  });

  it('a heading is never left alone at the foot of a column', () => {
    for (let columns = 2; columns <= 5; columns++) {
      const l = layoutLegend(groups, config({ columns }), ctx);
      const ts = texts(l);
      const headings = ts.filter((t) => t.bold && Object.values(labels.heading).includes(t.text));
      for (const h of headings) {
        // The first entry of its category sits right under it, in its own column.
        const below = ts.filter((t) => !t.bold && Math.abs(t.x - (h.x + DEFAULT_LEGEND.swatchWidth + 3)) < 1e-6 && t.y > h.y && t.y - h.y < 12);
        assert.ok(below.length > 0, `${h.text} at ${columns} columns`);
      }
    }
  });

  it('a category that runs on into the next column gets its heading again there', () => {
    const many: LegendGroup[] = [{ category: 'layers', entries: Array.from({ length: 8 }, (_, i) => ({ category: 'layers' as const, name: `L${i}`, color: '#000000', weight: 0.25, lineType: 'continuous' as const })) }];
    const two = labelsOf(layoutLegend(many, config({ columns: 2 }), ctx));
    assert.equal(two.filter((t) => t === 'Layers').length, 1);
    assert.equal(two.filter((t) => t === 'Layers (cont.)').length, 1);
    assert.equal(labelsOf(layoutLegend(many, config({ columns: 1 }), ctx)).filter((t) => t.startsWith('Layers')).length, 1);
    assert.equal(labelsOf(layoutLegend(many, config({ columns: 2, headings: false }), ctx)).filter((t) => t.startsWith('Layers')).length, 0);
  });

  it('every primitive stays inside the legend\'s frame', () => {
    for (const columns of [1, 3]) {
      const l = layoutLegend(groups, config({ columns, swatchWidth: 24 }), ctx);
      for (const p of l.prims) {
        const pts = p.kind === 'line' ? [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }] : p.kind === 'path' ? p.pts : [{ x: p.x, y: p.y }];
        for (const q of pts) assert.ok(q.x >= -1e-6 && q.x <= l.width + 1e-6 && q.y >= -1e-6 && q.y <= l.height + 1e-6, JSON.stringify(p));
      }
    }
  });

  it('a long name widens the legend; a long title does too', () => {
    const base = layoutLegend(groups, config(), ctx).width;
    const longName = layoutLegend([{ category: 'layers', entries: [{ category: 'layers', name: 'A-WALL-EXTERNAL-FINISHED-FACE-OF-STRUCTURE', color: '#000000', weight: 0.25, lineType: 'continuous' }] }], config(), ctx).width;
    assert.ok(longName > base);
    assert.ok(layoutLegend([], config({ title: 'A very long legend title for the whole building project' }), ctx).width > 80);
  });

  it('the text style sets the text size', () => {
    const big = layoutLegend(groups, config(), { ...ctx, textStyle: { ...DEFAULT_TEXT_STYLE, height: 5 } });
    const small = layoutLegend(groups, config(), ctx);
    const entry = (l: typeof big) => texts(l).find((t) => t.text === 'Brick')!;
    assert.equal(entry(big).size, 5);
    assert.equal(entry(small).size, 2.5);
    assert.ok(big.height > small.height, 'rows grow to hold bigger text');
  });
});

describe('legend swatches', () => {
  const swatchOf = (entry: LegendGroup['entries'][number], c = config({ showTitle: false, headings: false, swatchWidth: 20, rowHeight: 8 })) =>
    layoutLegend([{ category: entry.category, entries: [entry] }], c, ctx);

  it('a hatched material is a box with the pattern\'s lines inside it, filled when it has a fill', () => {
    const l = swatchOf(groups[0].entries[2]);
    const box = l.prims.find((p) => p.kind === 'path' && p.fill === '#cc8866');
    assert.ok(box && box.kind === 'path');
    const [x0, x1] = [Math.min(...box.pts.map((q) => q.x)), Math.max(...box.pts.map((q) => q.x))];
    const [y0, y1] = [Math.min(...box.pts.map((q) => q.y)), Math.max(...box.pts.map((q) => q.y))];
    assert.deepEqual([x1 - x0, y1 - y0], [19, 6]);
    const lines = l.prims.filter((p) => p.kind === 'line' && p.w === 0.13 && p.color === '#000000');
    assert.ok(lines.length >= 5);
    for (const p of lines) {
      if (p.kind !== 'line') continue;
      for (const [x, y] of [[p.x1, p.y1], [p.x2, p.y2]]) assert.ok(x >= x0 - 1e-6 && x <= x1 + 1e-6 && y >= y0 - 1e-6 && y <= y1 + 1e-6, `${x},${y}`);
    }
  });

  it('a different pattern draws different lines', () => {
    const a = swatchOf(groups[0].entries[0]).prims.filter((p) => p.kind === 'line').length;
    const b = swatchOf({ category: 'materials', name: 'Brick', hatch: 'HORIZONTAL', hatchScale: 1, fill: null, membrane: false }).prims.filter((p) => p.kind === 'line').length;
    assert.notEqual(a, b);
  });

  it('a membrane is a heavy dashed line across the swatch', () => {
    const l = swatchOf(groups[0].entries[1]);
    const m = l.prims.find((p) => p.kind === 'line' && p.dash);
    assert.ok(m && m.kind === 'line' && m.w >= 0.7 && m.x2 - m.x1 > 15);
  });

  it('a layer is a line in the layer\'s colour and pen, dashed when its type is', () => {
    const wall = swatchOf(groups[1].entries[0]).prims.find((p) => p.kind === 'line' && p.color === '#aa0000');
    assert.ok(wall && wall.kind === 'line' && wall.w === 0.5 && wall.dash === true);
    const dim = swatchOf(groups[1].entries[1]).prims.find((p) => p.kind === 'line' && p.color === '#0000aa');
    assert.ok(dim && dim.kind === 'line' && dim.w === 0.18 && dim.dash === undefined);
  });

  it('a symbol is drawn fitted inside its swatch box', () => {
    const l = swatchOf(groups[2].entries[0]);
    const paths = l.prims.filter((p) => p.kind === 'path' && p.color === '#000000' && p.w === 0.18);
    assert.ok(paths.length >= 3);
    for (const p of paths) {
      if (p.kind !== 'path') continue;
      // The swatch box: 19 mm by 6 mm at the legend's padding.
      for (const q of p.pts) assert.ok(q.x >= 4.5 - 1e-6 && q.x <= 23.5 + 1e-6 && q.y >= 5 - 1e-6 && q.y <= 11 + 1e-6, JSON.stringify(q));
    }
  });

  it('an axis type samples its bubble shape and line', () => {
    const l = swatchOf(groups[3].entries[0]);
    assert.ok(l.prims.some((p) => p.kind === 'text' && p.text === '1'));
    const squares = l.prims.filter((p) => p.kind === 'path' && p.closed && p.pts.length === 4 && p.w === 0.25);
    assert.equal(squares.length, 2);
  });

  it('every annotation tool has a sample', () => {
    const tools = ['text', 'leader', 'tag', 'dimaligned', 'dimlinear', 'dimradius', 'dimdiameter', 'dimangular', 'level', 'axis', 'hatch'] as const;
    for (const tool of tools) {
      const l = swatchOf({ category: 'annotations', name: tool, type: { id: tool, name: tool, tool } });
      // The frame, one row rule and the label are always there; the sample is more.
      assert.ok(l.prims.length > 3, tool);
    }
  });
});
