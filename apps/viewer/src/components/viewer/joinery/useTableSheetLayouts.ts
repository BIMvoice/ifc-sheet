/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The layouts of the schedules that read their own data and lay themselves out, on one sheet: the bill of quantities (#75) and the tables built from the Lists engine (#78). */

import { useMemo } from 'react';
import type { ProjectSheet } from '@/project/types';
import type { ScheduleLayout } from '@/joinery/schedule-layout';
import { useBoqSheetLayouts } from '../boq/useBoq';
import { useListSheetLayouts } from '../lists/useListSchedule';

export function useTableSheetLayouts(sheet: ProjectSheet): Map<string, ScheduleLayout> {
  const boq = useBoqSheetLayouts(sheet);
  const lists = useListSheetLayouts(sheet);
  return useMemo(() => (lists.size === 0 ? boq : boq.size === 0 ? lists : new Map([...boq, ...lists])), [boq, lists]);
}
