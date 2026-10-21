/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useState } from 'react';
import { useViewerStore } from '@/store';
import type { ScheduleData } from '@/joinery/schedule-data';
import type { ElementViews } from '@/joinery/element-views';
import { entryViews } from '@/joinery/element-views-source';

/** One schedule whose cards want views, at its drawing scale. */
export interface ViewRequest { id: string; data: ScheduleData; scale: number }

type Views = ReadonlyMap<string, ElementViews>;
const NONE: ReadonlyMap<string, Views> = new Map();

/**
 * The views of each requested schedule's entries (by schedule id, then entry
 * key), cut from the models' geometry after the first paint: empty until then,
 * and again until a changed request has been cut. Pass a memoised `requests`.
 */
export function useElementViews(requests: readonly ViewRequest[]): ReadonlyMap<string, Views> {
  const [state, setState] = useState<{ requests: readonly ViewRequest[]; views: ReadonlyMap<string, Views> } | null>(null);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  useEffect(() => {
    if (requests.length === 0) return;
    let live = true;
    Promise.all(requests.map(async (r) => [r.id, await entryViews(r.data, r.scale)] as const))
      .then((rows) => { if (live) setState({ requests, views: new Map(rows) }); })
      .catch((err: unknown) => console.warn('[joinery] the views failed:', err));
    return () => { live = false; };
    // mutationVersion: an edit to the models re-cuts (the source memo is keyed on it).
  }, [requests, mutationVersion]);
  return state && state.requests === requests ? state.views : NONE;
}
