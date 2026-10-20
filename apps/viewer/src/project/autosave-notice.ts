/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the person is told when the autosave cannot do its job: the browser refused to store the
 * slot, or the slot holds a project from a newer version, which this one leaves alone. Both stay
 * on screen until dismissed (an error toast), under one key, so repeated failures show one notice.
 */

import { toast } from '@/components/ui/toast';
import { resolve } from '@/i18n/registry';

/** One notice for every autosave failure, kept until dismissed: the drawings are not being saved. */
export const AUTOSAVE_FAILED = 'project-autosave-failed';

/** The browser refused the write: the slot still holds an older copy, so later changes are only in this page. */
export function noticeAutosaveFailed(err: unknown): void {
  toast.error(resolve('projectPackage.autosaveFailed', { detail: err instanceof Error ? err.message : String(err) }), AUTOSAVE_FAILED);
}

/** The model state or a raster capture could not be kept in IndexedDB beside the slot. */
export function noticeAutosaveImagesFailed(): void {
  toast.error(resolve('projectPackage.autosaveImagesFailed'), AUTOSAVE_FAILED);
}

/** The slot was written by a newer version: it is not loaded and not written to, so nothing done here is autosaved. */
export function noticeAutosaveTooNew(): void {
  toast.error(resolve('projectPackage.autosaveTooNew'), AUTOSAVE_FAILED);
}
