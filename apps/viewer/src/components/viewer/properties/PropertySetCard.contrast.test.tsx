/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pins the IFC-type tooltip in `PropertySetCard` (shown on a property name
 * when its value carries a typed IFC measure, e.g. `IFCLABEL,Concrete`) to
 * the app's accessible semantic tokens.
 *
 * Same root cause as `QuantitySetCard.contrast.test.tsx`: `TooltipContent`
 * switched to the neutral `bg-popover`/`text-popover-foreground` surface in
 * #4767, but this card's secondary tooltip line kept `text-primary-foreground/80`
 * — white-on-white in light mode, identical-on-identical in dark mode
 * (`apps/viewer/src/index.css`).
 *
 * Reverting the fix (className back to `text-primary-foreground/80`) turns
 * this red.
 */

import '@/test/setup-dom.js';
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ProjectUnits } from '@ifc-lite/parser';
import { TooltipProvider } from '@/components/ui/tooltip.js';
import { PropertySetCard } from './PropertySetCard.js';

const UNITS = ProjectUnits.empty();

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(node: ReactElement): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<TooltipProvider>{node}</TooltipProvider>);
  });
  return host;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('PropertySetCard IFC-type tooltip contrast', () => {
  it('renders the type tooltip on the popover surface with semantic muted text', () => {
    render(
      <PropertySetCard
        pset={{ name: 'Pset_Common', properties: [{ name: 'Reference', value: 'IFCLABEL,Concrete' }] }}
        entityId={1}
        projectUnits={UNITS}
      />,
    );

    const trigger = Array.from(document.querySelectorAll('span')).find((el) => el.textContent === 'Reference');
    assert.ok(trigger, 'property name with a typed value renders as a tooltip trigger');
    // Radix opens the tooltip immediately (no hover delay) on keyboard focus.
    act(() => {
      (trigger as HTMLElement).focus();
    });

    const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]');
    assert.ok(tooltip, 'tooltip content opened');
    assert.ok(tooltip!.classList.contains('bg-popover'), 'tooltip surface is the neutral popover, not bg-primary');
    assert.ok(!tooltip!.classList.contains('bg-primary'));

    const secondary = tooltip!.querySelector('span');
    assert.equal(secondary?.textContent, 'Label');
    assert.equal(secondary?.className, 'text-muted-foreground', 'secondary text derives from the popover surface, not primary-foreground');
  });
});
