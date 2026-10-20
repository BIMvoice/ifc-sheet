/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The plot on a site plan: its boundary (a closed polyline the user draws on
 * the site plan, on the "Plot boundary" layer), its area, and the setbacks —
 * for each boundary edge, the perpendicular distance from it to the nearest
 * point of the building's footprint. Pure, in the site plan's drawing metres.
 */

import type { DraftEntity, Pt } from '@/drafting/types';
import type { ProjectDocument, ProjectView } from '@/project/types';

/** The drafting layer a site plan's plot boundary is drawn on. */
export const PLOT_BOUNDARY_LAYER = { id: 'plot-boundary', name: 'Plot boundary', color: '#dc2626', lineWeight: 0.5, lineType: 'dashdot' } as const;

/** Twice the signed area (shoelace); positive counter-clockwise in the ring's own (x, y). */
export function doubleSignedArea(ring: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/** A ring's area, m². */
export const ringArea = (ring: readonly Pt[]): number => Math.abs(doubleSignedArea(ring)) / 2;

/** Whether `p` lies inside `ring` (even-odd). */
export function insideRing(p: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A polyline's points as a ring: closed, or ending where it started; else `null`. */
function asRing(entity: DraftEntity): Pt[] | null {
  const s = entity.shape;
  if (s.type !== 'polyline') return null;
  const pts = s.closed ? s.pts : (s.pts.length > 3 && Math.hypot(s.pts[0].x - s.pts[s.pts.length - 1].x, s.pts[0].y - s.pts[s.pts.length - 1].y) < 1e-6 ? s.pts.slice(0, -1) : null);
  return pts && pts.length >= 3 ? pts : null;
}

/** The plot boundary drawn on `viewId`: the largest closed polyline on the plot boundary layer, or `null`. */
export function plotBoundaryOf(drafts: readonly DraftEntity[], viewId: string): Pt[] | null {
  let best: Pt[] | null = null;
  for (const d of drafts) {
    if (d.viewId !== viewId || d.layerId !== PLOT_BOUNDARY_LAYER.id) continue;
    const ring = asRing(d);
    if (ring && (!best || ringArea(ring) > ringArea(best))) best = ring;
  }
  return best;
}

/** Whether a view is a site plan. */
export const isSitePlan = (view: ProjectView | undefined): boolean => view?.kind === 'plan' && view.site === true;

/**
 * The plot area, m², from the boundary drawn on the project's site plan, or
 * `null` when no site plan has one. Exposed for the urban indicators' site
 * area to take once both are merged.
 */
export function plotAreaOf(project: Pick<ProjectDocument, 'views' | 'drafts'>): number | null {
  for (const view of project.views) {
    if (!isSitePlan(view)) continue;
    const ring = plotBoundaryOf(project.drafts, view.id);
    if (ring) return ringArea(ring);
  }
  return null;
}

export interface Setback {
  /** The boundary edge, by its first vertex's index. */
  edge: number;
  /** The footprint point nearest the edge, and its foot on the edge. */
  from: Pt;
  to: Pt;
  /** Metres. */
  distance: number;
}

/**
 * For each edge of `boundary`, the footprint vertex nearest to it whose
 * perpendicular falls on the edge, and that distance: the setback of the
 * building from that side of the plot. An edge no footprint vertex faces
 * (its perpendicular falls past both ends) has none.
 */
export function setbacks(footprint: readonly (readonly Pt[])[], boundary: readonly Pt[]): Setback[] {
  const out: Setback[] = [];
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    let best: Setback | null = null;
    for (const ring of footprint) {
      for (const p of ring) {
        const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        if (t < 0 || t > 1) continue;
        const foot = { x: a.x + t * dx, y: a.y + t * dy };
        const distance = Math.hypot(p.x - foot.x, p.y - foot.y);
        if (!best || distance < best.distance) best = { edge: i, from: p, to: foot, distance };
      }
    }
    if (best) out.push(best);
  }
  return out;
}
