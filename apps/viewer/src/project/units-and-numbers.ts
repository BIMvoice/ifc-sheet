/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's "Units and numbers" setting (#88) as the figures of a sheet receive it: the interface language together
 * with the project's setting, one value (`SheetLocale`) that goes where the language alone went to the one formatter
 * (`sheetNumber`, `sheetLevel`, `formatDistance`). A project that sets nothing gets the language string back, unchanged.
 */

import { useMemo } from 'react';
import { sheetFormat, type SheetLocale } from '@bimvoice/ifcsheet/names';
import { useTranslation } from '@/i18n';
import { useProjectStore } from './project-store';

/** The language and the open project's setting. For a hook or a component; everything else takes the value as an argument. */
export function useSheetLocale(): SheetLocale {
  const { locale } = useTranslation();
  const units = useProjectStore((s) => s.unitsAndNumbers);
  return useMemo(() => sheetFormat(locale, units), [locale, units]);
}

/** The same value outside React (a command, a store subscription): the open project's setting read now. */
export function currentSheetLocale(locale: string): SheetLocale {
  return sheetFormat(locale, useProjectStore.getState().unitsAndNumbers);
}
