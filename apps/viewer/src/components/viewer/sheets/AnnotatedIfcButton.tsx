/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** EXPORT IFC WITH ANNOTATIONS (#82): the button, and what the export said. The work is `issue/annotated-ifc.ts`. */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { deliverAnnotatedIfc, runAnnotatedIfc } from '@/issue/annotated-ifc';
import type { SetSkin } from './set-skin';

export function AnnotatedIfcButton({ skin }: { skin: SetSkin }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const run = async () => {
    setBusy(true);
    setLines([]);
    try {
      const result = await runAnnotatedIfc();
      const said = result.lines.map((l) => t(l.key, l.params));
      const delivered = deliverAnnotatedIfc(result);
      setLines(delivered && result.files.length > 1 ? [...said, t('annotatedIfc.msg.files', { count: result.files.length, name: delivered })] : said);
    } catch (error) {
      setLines([error instanceof Error ? error.message : String(error)]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={skin.button} disabled={busy} onClick={() => void run()}>{t('annotatedIfc.action')}</button>
      </div>
      <p className={skin.note}>{t('annotatedIfc.hint')}</p>
      {lines.map((l, i) => <p key={i} className={skin.note}>{l}</p>)}
    </div>
  );
}
