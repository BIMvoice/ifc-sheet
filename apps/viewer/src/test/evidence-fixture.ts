/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Root of the recorded-evidence fixtures some tests replay. */
export const EVIDENCE_DIR = fileURLToPath(new URL('../../../../docs/architecture/evidence/', import.meta.url));

/**
 * A skip reason for a test that replays a recorded evidence file the IfcSheet
 * documentation edition does not ship (#67), else `false`. It un-skips by
 * itself the day the files are restored.
 */
export function evidenceSkip(...relativePaths: string[]): string | false {
  const missing = relativePaths.filter((path) => !existsSync(`${EVIDENCE_DIR}${path}`));
  return missing.length === 0
    ? false
    : `recorded evidence fixture not shipped in the IfcSheet edition: docs/architecture/evidence/${missing[0]} (#67)`;
}
