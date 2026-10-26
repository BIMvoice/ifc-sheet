/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useTranslation } from '@/i18n';
import { SheetNumberingForm } from '../SheetNumberingForm';
import { Collapsible } from './parts';
import type { DrawerSection } from './types';

function Numbering() {
  const { t } = useTranslation();
  return <Collapsible title={t('wall.num.title')}><SheetNumberingForm /></Collapsible>;
}

/** How sheets are numbered. */
export const numberingSection: DrawerSection = { id: 'numbering', slot: 'body', order: 300, component: Numbering };
