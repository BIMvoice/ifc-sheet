/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { toast } from '@/components/ui/toast';
import type { useTranslation } from '@/i18n';
import type { ArtifactFile, SkippedModel } from '@/lib/export/model-changes';

type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * The toast shown after a successful download: plain success, or an info
 * toast when models were skipped or edits could not be represented (#5201).
 */
export function showExportCompletedToast(
  t: Translate,
  files: ArtifactFile[],
  skipped: SkippedModel[],
  exportedChanges: number,
): void {
  const unrepresented = files.reduce((n, f) => n + f.skippedCount, 0);
  const unrepresentedNote = unrepresented > 0
    ? ` — ${t('exportChangesReviewDialog.toast.psetsLeftOut', { count: unrepresented })}`
    : '';
  const exportedMessage = () => files.length === 1
    ? t('exportChangesReviewDialog.toast.exportedFile', { name: `${files[0].base}.${files[0].ext}`, count: exportedChanges })
    : t('exportChangesReviewDialog.toast.exportedModels', {
        models: t('exportChangesReviewDialog.modelsCount', { count: files.length }),
        count: exportedChanges,
      });
  if (skipped.length > 0) {
    // The empty-pset note rides along: a skipped model must not hide it (#5201).
    toast.info(
      t('exportChangesReviewDialog.toast.exportedPartial', {
        exported: files.length,
        models: t('exportChangesReviewDialog.modelsCount', { count: files.length + skipped.length }),
        count: skipped.length,
        reason: skipped[0].reason,
      }) + unrepresentedNote,
    );
  } else if (unrepresented > 0) {
    // Not a plain success: part of the edits could not be written (#5201).
    toast.info(exportedMessage() + unrepresentedNote);
  } else {
    toast.success(exportedMessage());
  }
}
