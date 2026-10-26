/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Every section of the project drawer (#144). A new section is a file here plus its import and one entry in the
 * list: both alphabetical and one per line, so two features adding a section do not touch the same line. Its place
 * in the drawer is its `order`, not its place in this list (`./types.ts`), and `drawer-sections.test.tsx` refuses
 * a duplicate id or a duplicate order.
 */
import { classificationSection } from './classification';
import { commentsSection } from './comments';
import { drawingsSection } from './drawings';
import { legendsSection } from './legends';
import { librarySection } from './library';
import { materialsSection } from './materials';
import { numberingSection } from './numbering';
import { readinessSection } from './readiness';
import { schedulesSection } from './schedules';
import { sheetsSection } from './sheets';
import { standardsSection } from './standards';
import { tagFieldsSection } from './tag-fields';
import { titleBlockSection } from './title-block';
import { unitsSection } from './units';
import { viewTemplatesSection } from './view-templates';
import type { DrawerSection } from './types';

export const DRAWER_SECTIONS: readonly DrawerSection[] = [
  classificationSection,
  commentsSection,
  drawingsSection,
  legendsSection,
  librarySection,
  materialsSection,
  numberingSection,
  readinessSection,
  schedulesSection,
  sheetsSection,
  standardsSection,
  tagFieldsSection,
  titleBlockSection,
  unitsSection,
  viewTemplatesSection,
];

/** The sections of a slot, in the order they render. */
export const sectionsOf = (slot: DrawerSection['slot'], sections: readonly DrawerSection[] = DRAWER_SECTIONS): DrawerSection[] =>
  sections.filter((s) => s.slot === slot).sort((a, b) => a.order - b.order);
