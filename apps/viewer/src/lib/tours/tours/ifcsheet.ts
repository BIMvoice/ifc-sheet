/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The IfcSheet face's tour: open a model, the set is already drawn, hang it
 * on the Wall, step into a sheet, the six tools, issue the set. The same
 * engine as the classic tours; only the definition is new.
 *
 * Texts are read through getters, so they come from the catalogue in the
 * language active when the step shows, not when this module loads.
 */

import { openDemoModel } from '@/components/viewer/ifcsheet/demo-model';
import { resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import { stepInto, useWallNav } from '@/components/viewer/wall/wall-nav';
import { useProjectStore } from '@/project/project-store';
import { TOUR_ANCHORS } from '../anchors';
import { waitForModelSettled } from '../demo-kit';
import { EVENT_WALL_HUNG, EVENT_WALL_STEPPED, emitWallHung } from '../events';
import type { TourDefinition, TourStep, ViewerStoreApi } from '../types';

export const IFCSHEET_TOUR_ID = 'ifcsheet';

type Key = TranslationKey;
const text = (key: string): string => resolve(key as Key);

/** A step whose title and body are looked up at read time from `ifcsheetTour.<id>.title|body`. */
function step(id: string, rest: Omit<TourStep, 'id' | 'title' | 'body'>): TourStep {
  return Object.defineProperties({ id, ...rest, title: '', body: '' } as TourStep, {
    title: { enumerable: true, get: () => text(`ifcsheetTour.${id}.title`) },
    body: { enumerable: true, get: () => text(`ifcsheetTour.${id}.body`) },
    ...(rest.action ? { action: { enumerable: true, get: () => ({ ...rest.action!, label: text(`ifcsheetTour.${id}.action`) }) } } : {}),
  });
}

/** Steps that need a model for their anchor: skipping "open" must not leave them pointing at an empty Wall. */
async function ensureModel(store: ViewerStoreApi): Promise<void> {
  if (store.getState().models.size === 0) await openDemoModel();
  await waitForModelSettled();
}

/** The Wall past its intro, on the grid of sheets. */
function onTheWall(): void {
  emitWallHung();
  if (useWallNav.getState().stepped !== null) stepInto(null);
}

export const IFCSHEET_TOUR: TourDefinition = {
  id: IFCSHEET_TOUR_ID,
  face: 'ifcsheet',
  get title() { return text('ifcsheetTour.title'); },
  get description() { return text('ifcsheetTour.description'); },
  minutes: 1,
  version: 1,
  steps: [
    step('open', {
      kind: 'action',
      anchor: TOUR_ANCHORS.wallDemo,
      placement: 'bottom',
      action: { label: '', run: () => openDemoModel() },
      expectsModelLoad: true,
      skipLoadsDemo: true,
      gate: {
        predicate: (s) => s.models.size > 0 && !s.loading && !s.geometryStreamingActive,
        hintAfterMs: 30_000,
      },
    }),
    step('drawn', {
      // The whole Wall is the subject: a card docked over it, nothing spotlit.
      kind: 'canvas',
      prepare: (store) => ensureModel(store),
    }),
    step('hang', {
      kind: 'action',
      anchor: TOUR_ANCHORS.wallHang,
      placement: 'top',
      gate: { event: EVENT_WALL_HUNG },
    }),
    step('sheet', {
      kind: 'canvas',
      prepare: async (store) => {
        await ensureModel(store);
        onTheWall();
      },
      gate: { event: EVENT_WALL_STEPPED },
    }),
    step('tools', {
      kind: 'passive',
      anchor: TOUR_ANCHORS.wallToolRail,
      placement: 'right',
      prepare: async (store) => {
        await ensureModel(store);
        emitWallHung();
        const first = useProjectStore.getState().sheets[0];
        if (useWallNav.getState().stepped === null && first) stepInto(first.id);
      },
    }),
    step('issue', {
      kind: 'passive',
      anchor: TOUR_ANCHORS.wallIssue,
      placement: 'bottom',
      prepare: async (store) => {
        await ensureModel(store);
        emitWallHung();
      },
    }),
  ] satisfies TourStep[],
};
