/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useTranslation } from '@/i18n';
import { UnitsAndNumbersForm } from '../UnitsAndNumbersForm';
import { Collapsible } from './parts';
import type { DrawerSection } from './types';

function Units() {
  const { t } = useTranslation();
  return <Collapsible title={t('wall.units.title')}><UnitsAndNumbersForm /></Collapsible>;
}

/** The project's units and number format (#88). */
export const unitsSection: DrawerSection = { id: 'units', slot: 'body', order: 400, component: Units };
