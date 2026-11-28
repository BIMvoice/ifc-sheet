/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useTranslation } from '@/i18n';
import { TitleBlockForm } from '../TitleBlockForm';
import { Collapsible } from './parts';
import type { DrawerSection } from './types';

/** The project's title block form, every sheet's: the drawer's section and the top bar's panel (#923) show the same. */
export function TitleBlockBody() {
  const { t } = useTranslation();
  return (
    <>
      <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('wall.tb.everySheet')}</p>
      <TitleBlockForm />
    </>
  );
}

function TitleBlock() {
  const { t } = useTranslation();
  return (
    <Collapsible title={t('wall.tb.title')}>
      <TitleBlockBody />
    </Collapsible>
  );
}

/** The title block every sheet prints, filled once. */
export const titleBlockSection: DrawerSection = { id: 'title-block', slot: 'body', order: 500, component: TitleBlock };
