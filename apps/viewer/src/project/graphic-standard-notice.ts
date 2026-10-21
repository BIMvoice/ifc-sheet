/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one warning for a graphic standard id this app does not have, shown by
 * both paths that read one: opening a project file (`loadProjectDocument`)
 * and importing a library file (`applyCatalogueImport`). Both fall back to
 * the default standard.
 */

import { toast } from '@/components/ui/toast';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import { resolve } from '@/i18n/registry';

export function warnUnknownGraphicStandard(id: string): void {
  toast.error(resolve('library.standard.unknown', { id, fallback: DEFAULT_GRAPHIC_STANDARD.name }));
}
