/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Why "Annotate the set" did not run or stopped (#869): said in the panel and under the intro's button, so a click never ends in silence. */

import { useTranslation } from '@/i18n';
import type { AnnotateProblem as Problem } from '@/annotate-set/store';

export function AnnotateProblem({ problem }: { problem: Problem }) {
  const { t } = useTranslation();
  return (
    <p role="alert" data-testid="annotate-problem" className="m-0 text-xs text-amber-300">
      {problem.kind === 'failed' ? t('wall.annotateRun.failed', { message: problem.message }) : problem.kind === 'noModel' ? t('wall.annotateRun.noModel') : t('wall.annotateRun.nothingOn')}
    </p>
  );
}
