/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { germanySetTemplate, type GermanyLand, type SetTemplate } from '@bimvoice/ifcsheet';
import type { TranslationKey } from '@/i18n';

/**
 * The German Bauantrag sheets for the project's Land, named and annotated in the installed language (#372). No Land chosen reads as
 * any other Land: nothing is read for it, and the Lageplan's note says the scale is unverified.
 */
export function germanyTemplateFor(t: (key: TranslationKey) => string, land: GermanyLand | undefined): SetTemplate {
  const chosen = land ?? 'other';
  return germanySetTemplate({
    name: t('germany.set.name'),
    plans: t('germany.set.plans'),
    sections: t('germany.set.sections'),
    elevations: t('germany.set.elevations'),
    site: t('germany.set.site'),
    siteNotes: [t(`germany.set.siteScale.${chosen}` as TranslationKey), t(chosen === 'bw' ? 'germany.set.siteToAddBw' : 'germany.set.siteToAdd')],
    setback: t('germany.set.setback'),
    setbackNotes: [t('germany.set.setbackNote')],
  }, chosen);
}
