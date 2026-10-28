/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the title block's parameters from a project file (#143). The readers are the engine's
 * (`packages/ifcsheet/src/title-block-file-read.ts`, `title-block-template-read.ts`): `ifcsheet build --project`
 * reads the same file the same way.
 */

import { readSheetParams, readTitleBlockParams, readTitleBlockTemplate } from '@bimvoice/ifcsheet';

export { readSheetParams, readTitleBlockParams, readTitleBlockTemplate };
