/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model state a new version is compared with, and what the last comparison found, for the
 * panel and the command line to share. The reference is the project's `modelState`: recorded the
 * first time the comparison runs on a project that has none, and replaced only when the user
 * takes the model as it is as the reference (ACCEPT, "Use as the reference").
 */

import { create } from 'zustand';
import type { SheetChanges } from './report';

export interface WhatChangedResult {
  /** Elements of the model that changed, wherever they are drawn. */
  changed: number;
  sheets: SheetChanges[];
  /** Views cut along a plane that is not along an axis: their changes are not listed. */
  unread: number;
  /** Revision clouds drawn. */
  clouds: number;
}

interface WhatChangedState {
  result: WhatChangedResult | null;
  running: boolean;
  /** The first thing the last run said: what it compared with, or why it did not. */
  message: string | null;
}

export const useWhatChanged = create<WhatChangedState>()(() => ({ result: null, running: false, message: null }));

export const setResult = (result: WhatChangedResult | null): void => useWhatChanged.setState({ result });
