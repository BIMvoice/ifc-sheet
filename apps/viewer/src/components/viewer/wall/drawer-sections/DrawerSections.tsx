/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DRAWER_SECTIONS, sectionsOf } from './index';
import type { DrawerContext, DrawerSection } from './types';

const alwaysVisible = (): boolean => true;

function Slot({ section, context }: { section: DrawerSection; context: DrawerContext }) {
  const useVisible = section.useVisible ?? alwaysVisible;
  const visible = useVisible();
  const Section = section.component;
  return visible ? <Section {...context} /> : null;
}

/** Renders the sections of one slot of the project drawer, in order, with no element of their own. */
export function DrawerSections({ slot, context, sections = DRAWER_SECTIONS }: { slot: DrawerSection['slot']; context: DrawerContext; sections?: readonly DrawerSection[] }) {
  return <>{sectionsOf(slot, sections).map((s) => <Slot key={s.id} section={s} context={context} />)}</>;
}
