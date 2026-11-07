/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Height labels on the major contours (#182): a cone TIN (a hill 12 m high, 0.5 m of fall per metre) contoured every metre,
 * so the majors are 0, 5 and 10 m. The labels stand on major contours only, each reads its contour's height, none runs
 * over the plan's edge, the contour is broken under each, and the same labels reach the sheet and its DXF.
 */

import { describe, expect, it } from 'vitest';
import { createSectionConfig, type Drawing2D, type DrawingLine, type Point2D } from '@ifc-lite/drawing-2d';
import { grid } from './__fixtures__/contour-grid.js';
import { withContours } from './contour-drawing.js';
import { CONTOUR_IFC_TYPE, contourLabelsOf, layoutContourLabels } from './contour-labels.js';
import type { PlanProjectView, ProjectDocument } from './document.js';
import { exportDxf } from './export.js';
import { sheetGraphic } from './sheet-graphic.js';

const cone = grid(40, 40, (x, z) => 12 - 0.5 * Math.hypot(x - 20, z - 20));
const view: PlanProjectView = { id: 'site', name: 'Site', createdAt: 0, kind: 'plan', level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, site: true, contourInterval: 1 };
const empty = (): Drawing2D => ({
  config: createSectionConfig('y', 1.2), lines: [], cutPolygons: [], projectionPolygons: [], bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
  stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
});
const contoured = withContours(empty(), view, [cone]);
const contourLinesOf = (d: Drawing2D): DrawingLine[] => d.lines.filter((l) => l.ifcType === CONTOUR_IFC_TYPE);

/** How far `p` is from the nearest of `lines`. */
function distanceToLines(p: Point2D, lines: readonly DrawingLine[]): number {
  let best = Infinity;
  for (const { line: { start: a, end: b } } of lines) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

describe('contour height labels (#182)', () => {
  it('labels the major contours only, each with its own height, in the dimension format', () => {
    const { texts } = layoutContourLabels(contoured, 100, 'en');
    expect(texts.length).toBeGreaterThan(3);
    expect(new Set(texts.map((t) => t.text))).toEqual(new Set(['0.00', '5.00', '10.00']));
    // Each label stands on the ring of the height it reads: the cone's contour at h is a circle of radius (12 - h) / 0.5 about its apex.
    const centre = contoured.bounds;
    const apex = { x: (centre.min.x + centre.max.x) / 2, y: (centre.min.y + centre.max.y) / 2 };
    for (const l of contourLabelsOf(contoured)) {
      expect(l.height % 5).toBe(0);
      expect(Math.hypot(l.at.x - apex.x, l.at.y - apex.y)).toBeCloseTo(24 - 2 * l.height, 0);
      expect(distanceToLines(l.at, contourLinesOf(contoured))).toBeLessThan(1e-6);
    }
    for (const t of texts) expect(contourLabelsOf(contoured).some((l) => l.at.x === t.at.x && l.at.y === t.at.y && l.height === Number(t.text))).toBe(true);
  });

  it('turns each label to follow its contour and keeps it readable', () => {
    const { texts } = layoutContourLabels(contoured, 100, 'en');
    expect(texts.every((t) => t.angle >= -90 && t.angle < 90)).toBe(true);
    expect(texts.some((t) => Math.abs(t.angle) > 10)).toBe(true);
  });

  it('keeps every label, with its room, inside the plan', () => {
    const { texts } = layoutContourLabels(contoured, 100, 'en');
    const { min, max } = contoured.bounds;
    for (const t of texts) {
      expect(t.at.x).toBeGreaterThan(min.x + 0.3);
      expect(t.at.x).toBeLessThan(max.x - 0.3);
      expect(t.at.y).toBeGreaterThan(min.y + 0.3);
      expect(t.at.y).toBeLessThan(max.y - 0.3);
    }
    // A scale at which the text is wider than the plan leaves none.
    expect(layoutContourLabels(contoured, 100000, 'en').texts).toEqual([]);
  });

  it('breaks the contour under each label', () => {
    const { drawing, texts } = layoutContourLabels(contoured, 100, 'en');
    for (const t of texts) expect(distanceToLines(t.at, contourLinesOf(drawing))).toBeGreaterThan(0.1);
    // Away from the labels nothing is lost: the broken lines still cover most of the contour.
    expect(contourLinesOf(drawing).length).toBeGreaterThan(contourLinesOf(contoured).length * 0.9);
  });

  it('is the same drawing, with no labels, when the plan takes none', () => {
    const none = withContours(empty(), { ...view, contourInterval: 0 }, [cone]);
    expect(layoutContourLabels(none, 100, 'en')).toEqual({ drawing: none, texts: [] });
  });

  it('writes the same figures on the sheet and in its DXF (a comma-decimal project too)', () => {
    const doc: ProjectDocument = { name: 'p', models: [], views: [view], sheets: [{ id: 's', number: 'A-1', name: 'Site', createdAt: 0, viewports: [{ id: 'v', viewId: 'site', x: 210, y: 148, scale: 200, width: 0, height: 0, center: null }] }] };
    const sheet = sheetGraphic(doc.sheets[0], doc, new Map([['site', contoured]]));
    const labels = sheet.texts.filter((t) => ['0.00', '5.00', '10.00'].includes(t.text));
    expect(labels.length).toBeGreaterThan(3);
    expect(labels.every((t) => t.size === 2.5 && t.align === 'center')).toBe(true);
    const dxf = exportDxf(sheet);
    expect(dxf).toContain('10.00');
    expect(dxf).toContain('5.00');
    const ro = sheetGraphic(doc.sheets[0], doc, new Map([['site', contoured]]), null, new Map(), undefined, undefined, undefined, undefined, undefined, undefined, { north: null, locale: 'ro' });
    expect(exportDxf(ro)).toContain('10,00');
  });
});
