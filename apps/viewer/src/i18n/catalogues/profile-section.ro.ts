/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `profile-section` (#526). Term choices: `../ro-glossary.md`. */
export const profileSectionRo = {
  'profileSection.field.depth': 'Adâncime',
  'profileSection.field.flange': 'Talpă',
  'profileSection.field.flangeWidth': 'Lățimea tălpii',
  'profileSection.field.girth': 'Buză',
  'profileSection.field.height': 'Înălțime',
  'profileSection.field.overallDepth': 'Înălțime totală',
  'profileSection.field.overallWidth': 'Lățime',
  'profileSection.field.radius': 'Rază',
  'profileSection.field.thickness': 'Grosime',
  'profileSection.field.wall': 'Grosimea peretelui',
  'profileSection.field.web': 'Inimă',
  'profileSection.field.width': 'Lățime',
  'profileSection.kind.C': 'Profil C cu buză (C)',
  'profileSection.kind.Circle': 'Cerc',
  'profileSection.kind.CircleHollow': 'Țeavă rotundă',
  'profileSection.kind.I': 'I / H',
  'profileSection.kind.L': 'Cornier (L)',
  'profileSection.kind.Rectangle': 'Dreptunghi',
  'profileSection.kind.RectangleHollow': 'Țeavă dreptunghiulară',
  'profileSection.kind.T': 'Profil T (T)',
  'profileSection.kind.U': 'Profil U (U)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
