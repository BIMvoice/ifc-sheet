/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A section of the viewport card: draw the drawing by phase (#652, #93). The controls are the engine navigator's phases section
 * (`PhaseGraphics`, one code path), set in a light panel because they are written for a light background.
 */

import { PhaseGraphics } from '@/components/viewer/project/PhaseGraphics';
import { useTranslation } from '@/i18n';
import type { ProjectView } from '@/project/types';
import { CardSection } from './CardSection';

/** Views drawn from the model, so each element has a phase to be drawn by. */
export const canBePhased = (view: ProjectView | undefined): view is ProjectView => view?.kind === 'plan' || view?.kind === 'section' || view?.kind === 'elevation';

export function PhaseCard({ view }: { view: ProjectView }) {
  const { t } = useTranslation();
  return (
    <CardSection id="phases" title={t('wall.phases.title')} summary={view.graphics?.phases ? t('wall.phases.summaryOn') : t('wall.phases.summaryOff')} defaultOpen={false}>
      <div className="mt-3 rounded-md bg-white p-3 text-zinc-900" data-phase-card>
        <PhaseGraphics view={view} />
      </div>
    </CardSection>
  );
}
