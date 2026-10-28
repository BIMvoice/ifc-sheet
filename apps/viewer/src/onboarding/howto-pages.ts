/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The how-to pages of the "?" menu (#455): each a title and its steps, as catalogue keys (`onboarding.howto.<id>.*`). */

import type { TranslationKey } from '@/i18n';

export const HOWTO_PAGES = [
  { id: 'open', steps: 5 },
  { id: 'hang', steps: 6 },
  { id: 'dimension', steps: 5 },
  { id: 'schedules', steps: 5 },
  { id: 'titleBlock', steps: 5 },
  { id: 'export', steps: 5 },
] as const;

export type HowToId = (typeof HOWTO_PAGES)[number]['id'];

/** The catalogue keys are built from the id: `howto-pages.test.tsx` proves every one resolves in every language. */
export function howToTitleKey(id: HowToId): TranslationKey {
  return `onboarding.howto.${id}.title` as TranslationKey;
}

export function howToStepKeys(id: HowToId): TranslationKey[] {
  const page = HOWTO_PAGES.find((p) => p.id === id);
  return Array.from({ length: page?.steps ?? 0 }, (_, i) => `onboarding.howto.${id}.step${i + 1}` as TranslationKey);
}
