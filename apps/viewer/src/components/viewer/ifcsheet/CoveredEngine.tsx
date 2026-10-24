/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';
import { useViewportCovered } from '../viewport-cover';

/**
 * The engine's own interface (ribbon, panels, status bar). While the IfcSheet face or any other cover hides the
 * viewport (`viewport-cover`) it is inert: no Tab stop, no screen-reader node, no click (#295). `contents` keeps its
 * children in the layout's flex column. Dialogs and the palette stay outside it or portal to the body.
 */
export function CoveredEngine({ children }: { children: ReactNode }) {
  const covered = useViewportCovered();
  return <div className="contents" data-engine-root inert={covered}>{children}</div>;
}
