/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/**
 * Toasts of the exports the command palette starts (CSV, JSON, screenshot) and of opening a file
 * (`exportToast.*`, `fileLoad.toast.*`). Count-bearing messages take `{count}` for the plural forms.
 */
export const exportToastsEn = {
  'exportToast.unknownError': 'Unknown error',
  'exportToast.table.entities': 'entities',
  'exportToast.table.properties': 'properties',
  'exportToast.table.quantities': 'quantities',
  'exportToast.table.spatial': 'spatial hierarchy',
  'exportToast.activeModelOnly': {
    one: 'active model only, {count} other loaded model not included',
    other: 'active model only, {count} other loaded models not included',
  },
  'exportToast.csvDone': 'Exported {table} CSV{note}',
  'exportToast.csvFailed': 'CSV export failed: {reason}',
  'exportToast.jsonDone': {
    one: 'Exported {count} entity as JSON{note}',
    other: 'Exported {count} entities as JSON{note}',
  },
  'exportToast.jsonFailed': 'JSON export failed: {reason}',
  'exportToast.screenshotDone': 'Screenshot saved',
  'exportToast.screenshotFailed': 'Screenshot failed',
  'fileLoad.toast.changedSinceCached': '"{name}" changed since it was cached — reloading with the current file.',
  'fileLoad.toast.tooDetailed': '"{name}" was too detailed for this device — retrying at lower detail…',
  'fileLoad.toast.pointCloudsKeepRaw': 'Point clouds loaded before this model keep their raw coordinates — reload the scan to align it with the model georeference.',
  'fileLoad.toast.pointCloudRealignFailed': 'Point-cloud realignment failed; existing scan transforms were restored.',
  'fileLoad.toast.orphanImages': '{names}: no image of the same name was selected beside it.',
} as const satisfies Record<string, TranslationValue>;
