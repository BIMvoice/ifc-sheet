/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Says so while drawings are being made on the page itself (#863).
 *
 * When the drawing worker cannot be used, the views are drawn on the main
 * thread one at a time (`main-thread-fallback.ts`): slower, and the page can
 * pause while a large view is cut. Without a word that read as a set that
 * never finishes. A notice shows while views are waiting there and goes when
 * the last one is drawn; dismissed, it comes back only the next time drawings
 * fall back.
 */

import { useEffect } from 'react';
import { toast } from '@/components/ui/toast';
import { useTranslation } from '@/i18n';
import { mainThreadDrawingsWaiting, subscribeMainThreadDrawings } from '@/lib/drawing/generation/main-thread-fallback';

const NOTICE_KEY = 'drawing-main-thread';

export function useMainThreadDrawingNotice(): void {
  const { t } = useTranslation();
  useEffect(() => {
    let dismiss: (() => void) | null = null;
    const update = (waiting: number) => {
      if (waiting > 0 && !dismiss) dismiss = toast.status(NOTICE_KEY, () => t('drawing.mainThread.notice'));
      else if (waiting === 0 && dismiss) { dismiss(); dismiss = null; }
    };
    update(mainThreadDrawingsWaiting());
    const unsubscribe = subscribeMainThreadDrawings(update);
    return () => { unsubscribe(); dismiss?.(); };
  }, [t]);
}
