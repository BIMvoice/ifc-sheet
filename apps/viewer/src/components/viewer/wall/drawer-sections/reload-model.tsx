/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { requestModelReload } from '@/whatchanged/reload-event';
import { action } from './parts';
import type { DrawerSection } from './types';

function ReloadModel() {
  const { t } = useTranslation();
  const loading = useViewerStore((s) => s.loading);
  return (
    <div className="px-4 pb-3">
      {/* The event is sent inside the click, so the file picker it may open keeps the gesture. */}
      <button type="button" className={`${action} disabled:opacity-40`} disabled={loading} onClick={requestModelReload}>
        {loading ? t('modelReload.reloading') : t('modelReload.action')}
      </button>
      <p className="m-0 mt-1.5 text-xs text-sky-200/70">{t('modelReload.hint')}</p>
    </div>
  );
}

/** Reload the IFC model with the project kept (#922): shown while the project is drawn from one model. */
export const reloadModelSection: DrawerSection = {
  id: 'reload-model',
  slot: 'top',
  order: 50,
  component: ReloadModel,
  useVisible: () => useViewerStore((s) => s.models.size === 1),
};
