/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's tour belongs to the IfcSheet face and runs from that face's own
 * help button. The classic Learn hub and the command palette list the classic
 * tours only, so neither offers it.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { getTour } from '@/lib/tours/registry';
import { IFCSHEET_TOUR_ID } from '@/lib/tours/tours/ifcsheet';
import { buildPanelCommands } from '@/components/viewer/commandPaletteCommandsPanels';
import type { CommandPaletteBuildParams } from '@/components/viewer/commandPaletteCommandsTypes';
import { LearnTab } from './LearnTab';

afterEach(() => cleanup());

describe('the Wall tour stays out of the classic interface', () => {
  it('is not listed in the Learn hub, which still lists the classic tours', () => {
    const wall = getTour(IFCSHEET_TOUR_ID);
    const welcome = getTour('welcome');
    assert.ok(wall && welcome);
    const ui = render(<LearnTab onClose={() => {}} />);
    const text = ui.textContent ?? '';
    assert.ok(text.includes(welcome.title), 'control: a classic tour is listed');
    assert.equal(text.includes(wall.title), false, 'the Wall tour is not');
  });

  it('is not a command in the palette, which still offers the classic tours', () => {
    const noop = () => {};
    const params = {
      execute: noop,
      recentFiles: [],
      cachedNames: { current: new Set<string>() },
      extensionCommands: [],
      extensionHost: null,
      canEditInSession: false,
      cesiumAvailable: false,
      activateRightPanel: noop,
      activateBottomPanel: noop,
      runExport: noop,
    } satisfies CommandPaletteBuildParams;
    const ids = buildPanelCommands(params).map((c) => c.id);
    assert.ok(ids.includes('tour:welcome'), 'control: a classic tour is a command');
    assert.equal(ids.includes(`tour:${IFCSHEET_TOUR_ID}`), false, 'the Wall tour is not');
  });
});
