/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The mapping table and the totals over the Wall (#75): a window of its own, since a table of articles is wider than the viewport card. Esc closes it. */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n';
import type { ProjectSchedule } from '@/project/types';
import { WALL_PILL } from '../wall/wall-type';
import { BoqEditor } from './BoqEditor';
import { BoqPreview } from './BoqPreview';

export function BoqDialog({ schedule, onClose }: { schedule: ProjectSchedule; onClose: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('boq.editor.title')} data-owns-keys className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 p-6">
      <div className="flex min-h-0 w-full max-w-6xl flex-col rounded-xl border border-sky-300/20 bg-[#061a36] text-sky-100 shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-sky-300/20 px-5 py-3">
          <h2 className="m-0 flex-1 text-xl font-normal text-white">{schedule.name} · {t('boq.editor.title')}</h2>
          <button type="button" autoFocus className={WALL_PILL} onClick={onClose}>{t('boq.editor.close')}</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <BoqEditor />
          <div className="mt-6 border-t border-sky-300/20 pt-4"><BoqPreview schedule={schedule} /></div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
