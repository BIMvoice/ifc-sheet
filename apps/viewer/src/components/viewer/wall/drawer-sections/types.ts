/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ComponentType } from 'react';
import type { ModelExtent } from '@/project/drawing-set';

/** What the drawer hands every section: how to step to a sheet, how to close, and the loaded models' extent. */
export interface DrawerContext {
  /** Steps into a sheet (and brings `focus`, a view or schedule on it, forward), then closes the drawer. A null sheet does nothing. */
  go(sheetId: string | null, focus?: string | null): void;
  onClose(): void;
  extent: ModelExtent | null;
}

/**
 * One section of the project drawer (#144), registered from its own file in `./index.ts`. A feature adds a
 * section file and one line there; it does not edit `ProjectDrawer.tsx`.
 */
export interface DrawerSection {
  /** Unique; the section file's name. */
  id: string;
  /** `top`: above the scrolling list (the library, the comments); `body`: inside it. */
  slot: 'top' | 'body';
  /** Sections of a slot render in ascending order. Keep gaps (100, 200, ...) so one can slip between two. Unique per slot. */
  order: number;
  component: ComponentType<DrawerContext>;
  /**
   * A hook that says whether the section shows (it may read stores); absent: always. The section is not mounted
   * while it says no. Called on every render of the drawer, so it must follow the rules of hooks like any other.
   */
  useVisible?: () => boolean;
}
