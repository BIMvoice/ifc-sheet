/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useProjectStore } from '@/project/project-store';
import { ScanLevelsCard } from '../ScanLevelsCard';
import type { DrawerSection } from './types';

/** The levels of a scan (#181); shown only on a project that has them. */
export const scanLevelsSection: DrawerSection = {
  id: 'scan-levels',
  slot: 'body',
  order: 610,
  component: ScanLevelsCard,
  useVisible: () => useProjectStore((s) => (s.scanLevels?.length ?? 0) > 0),
};
