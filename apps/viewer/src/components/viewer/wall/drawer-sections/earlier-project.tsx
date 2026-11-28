/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEarlierProjectStore } from '@/project/earlier-project-store';
import { EarlierProjectOffer } from '../EarlierProjectOffer';
import type { DrawerSection } from './types';

/** The project of an earlier version of the model, on offer (#922): shown above everything while it is. */
export const earlierProjectSection: DrawerSection = {
  id: 'earlier-project',
  slot: 'top',
  order: 10,
  component: () => <div className="px-4"><EarlierProjectOffer /></div>,
  useVisible: () => useEarlierProjectStore((s) => s.offer !== null),
};
