/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Save a drafting view to the detail library. When the library already has an
 * entry of that name the person is asked first: replace it, keep both (the new
 * one renamed "Name (2)", the default) or cancel. The logic is
 * `catalogue/detail-actions.ts`.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { libraryDetailNamed, saveViewAsLibraryDetail, type SameNameChoice } from '@/catalogue/detail-actions';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import type { ProjectView } from '@/project/types';

export function SaveToLibraryButton({ view }: { view: ProjectView }) {
  const { t } = useTranslation();
  const [clash, setClash] = useState<string | null>(null);
  // Keep both is the default answer: it has the focus, so Enter takes it.
  const keepBoth = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (clash !== null) keepBoth.current?.focus(); }, [clash]);
  const save = (sameName?: SameNameChoice) => {
    setClash(null);
    if (saveViewAsLibraryDetail(view.id, undefined, sameName)) toast.success(t('projectNavigator.props.detailSaved'));
  };
  if (clash !== null) {
    return (
      <fieldset aria-label={t('projectNavigator.action.saveDetail')} className="m-0 space-y-2 border-0 p-0">
        <p className="m-0 text-xs text-zinc-600 dark:text-zinc-400">{t('projectNavigator.saveDetail.exists', { name: clash })}</p>
        <div className="flex gap-2">
          <Button ref={keepBoth} variant="default" size="sm" onClick={() => save('both')}>{t('projectNavigator.saveDetail.keepBoth')}</Button>
          <Button variant="outline" size="sm" onClick={() => save('replace')}>{t('projectNavigator.saveDetail.replace')}</Button>
          <Button variant="outline" size="sm" onClick={() => setClash(null)}>{t('projectNavigator.saveDetail.cancel')}</Button>
        </div>
      </fieldset>
    );
  }
  return (
    <Button
      variant="outline" size="sm" className="w-full"
      onClick={() => { const existing = libraryDetailNamed(view.id); if (existing) setClash(existing.name); else save(); }}
    >
      {t('projectNavigator.action.saveDetail')}
    </Button>
  );
}
