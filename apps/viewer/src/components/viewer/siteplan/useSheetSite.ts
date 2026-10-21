/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a sheet's site plans show beyond their drawing: the plot boundary the
 * user drew, the building's footprint (the ground storey cut's outer rings,
 * `siteplan/footprint.ts`, united by the kernel's 2D booleans) and the
 * setbacks between them. The areas are the urban indicators' (`SiteBalance.tsx`).
 */

import { useEffect, useMemo, useState } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { Contours2D, resolve2d } from '@ifc-lite/wasm';
import { ensureWasm } from '@/lib/wasm/ensure-wasm';
import type { DraftEntity, Pt } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { footprintRings, type RingUnion } from '@/siteplan/footprint';
import { isSitePlan, plotBoundaryOf, setbacks, type Setback } from '@/siteplan/plot';

export interface SiteContent {
  boundary: Pt[] | null;
  /** `null` until the footprint is computed (the wasm module loads once). */
  footprint: Pt[][] | null;
  setbacks: Setback[];
}

/** The kernel's self-union (`resolve2d`), outer ring of each shape only. */
export const wasmUnion: RingUnion = (rings) => {
  const coords = new Float64Array(rings.reduce((n, r) => n + r.length * 2, 0));
  let i = 0;
  for (const r of rings) for (const p of r) { coords[i++] = p.x; coords[i++] = p.y; }
  const input = new Contours2D(coords, Uint32Array.from(rings.map((r) => r.length)));
  const united = resolve2d(input);
  try {
    const flat = united.coords();
    const lengths = united.ringLengths();
    const outers = new Set(united.shapeOffsets());
    const out: Pt[][] = [];
    let at = 0;
    lengths.forEach((n, ring) => {
      if (outers.has(ring)) out.push(Array.from({ length: n }, (_, k) => ({ x: flat[(at + k) * 2], y: flat[(at + k) * 2 + 1] })));
      at += n;
    });
    return out;
  } finally {
    input.free();
    united.free();
  }
};

/** The site content of each site plan placed on the sheet, by view id. */
export function useSheetSite(
  viewIds: readonly string[], views: readonly ProjectView[], drafts: readonly DraftEntity[], drawingOf: (viewId: string) => Drawing2D | null,
): Map<string, SiteContent> {
  const siteIds = useMemo(() => [...new Set(viewIds)].filter((id) => isSitePlan(views.find((v) => v.id === id))), [viewIds, views]);
  const drawings = useMemo(() => siteIds.map((id) => [id, drawingOf(id)] as const), [siteIds, drawingOf]);
  const [footprints, setFootprints] = useState<Map<string, Pt[][]>>(new Map());
  useEffect(() => {
    if (drawings.length === 0) return;
    let cancelled = false;
    ensureWasm().then(() => {
      if (cancelled) return;
      const next = new Map<string, Pt[][]>();
      for (const [id, drawing] of drawings) {
        if (!drawing) continue;
        try {
          next.set(id, footprintRings(drawing.cutPolygons, wasmUnion));
        } catch (error) {
          console.warn('[site] footprint not computed', error);
        }
      }
      setFootprints(next);
    }).catch((error: unknown) => console.warn('[site] wasm unavailable for the footprint', error));
    return () => { cancelled = true; };
  }, [drawings]);
  return useMemo(() => {
    const out = new Map<string, SiteContent>();
    for (const id of siteIds) {
      const boundary = plotBoundaryOf(drafts, id);
      const footprint = footprints.get(id) ?? null;
      out.set(id, {
        boundary,
        footprint,
        setbacks: boundary && footprint ? setbacks(footprint, boundary) : [],
      });
    }
    return out;
  }, [siteIds, drafts, footprints]);
}

/** A drawing's bounds grown to hold its plot boundary, so the viewport fits and centres on the whole site. */
export function siteBounds(bounds: Drawing2D['bounds'], site: SiteContent | undefined): Drawing2D['bounds'] {
  if (!site?.boundary) return bounds;
  const xs = [bounds.min.x, bounds.max.x, ...site.boundary.map((p) => p.x)];
  const ys = [bounds.min.y, bounds.max.y, ...site.boundary.map((p) => p.y)];
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}
