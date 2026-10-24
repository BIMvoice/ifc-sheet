/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #285: the tour paused under a modal. The card sat above an open dialog
 * (z-[60] over z-50) and, being pointer-events-auto, stayed clickable through
 * Radix's outside-pointer-events lock. While any modal is open the tour is
 * not rendered at all, so it is inert and cannot take focus; it returns when
 * the modal closes. The rule reads the modal itself (`aria-modal="true"`), so
 * it covers every dialog built on the shared primitive and the native Print
 * preview alike.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { cleanup, click, render, waitFor } from '@/test/render.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { resetTourState, useTourStore } from '@/lib/tours/tour-store';
import { TourHost } from './TourHost.js';

afterEach(() => {
  cleanup();
  resetTourState();
});

const tourCard = (): HTMLElement | null => document.querySelector('[data-owns-keys][aria-labelledby^="tour-step-title-"]');

function runCanvasStep(): void {
  // 'orbit' is a canvas step: docked card, no anchor needed.
  useTourStore.setState({ status: 'running', tourId: 'welcome', stepIndex: 1, stepPhase: 'active', targetEl: null });
}

function Harness({ modal = true, native = false }: { modal?: boolean; native?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="open" onClick={() => setOpen(true)}>open</button>
      <TourHost />
      {native && open && <dialog open aria-modal="true" aria-label="native"><button type="button" data-testid="close" onClick={() => setOpen(false)}>x</button></dialog>}
      {!native && (
        <Dialog open={open} onOpenChange={setOpen} modal={modal}>
          <DialogContent>
            <DialogTitle>Review by element</DialogTitle>
            <DialogDescription>d</DialogDescription>
            <button type="button" data-testid="inside">inside</button>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

const byId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

describe('the tour pauses under a modal (#285)', () => {
  it('hides the card while a Radix modal is open, keeps focus in it, and brings the card back on close', async () => {
    runCanvasStep();
    render(<Harness />);
    await waitFor(() => tourCard() !== null, 'the card shows with no modal open');

    click(byId('open'));
    await waitFor(() => document.querySelector('[role="dialog"][aria-modal="true"]') !== null, 'the modal opened');
    await waitFor(() => tourCard() === null, 'the card is gone while the modal is open');
    const modal = document.querySelector('[role="dialog"][aria-modal="true"]')!;
    assert.ok(modal.contains(document.activeElement), 'focus stays inside the modal');

    click(document.querySelector<HTMLElement>('[role="dialog"] button.absolute')!);
    await waitFor(() => document.querySelector('[role="dialog"][aria-modal="true"]') === null, 'the modal closed');
    await waitFor(() => tourCard() !== null, 'the card is back after the modal closes');
  });

  it('pauses under the native Print preview dialog too', async () => {
    runCanvasStep();
    render(<Harness native />);
    await waitFor(() => tourCard() !== null, 'the card shows');
    click(byId('open'));
    await waitFor(() => tourCard() === null, 'the card is gone under the native modal');
    click(byId('close'));
    await waitFor(() => tourCard() !== null, 'the card returns');
  });

  it('does not pause for a non-modal dialog (the split export preview)', async () => {
    runCanvasStep();
    render(<Harness modal={false} />);
    click(byId('open'));
    await waitFor(() => document.querySelector('[role="dialog"]:not([data-owns-keys])') !== null, 'the dialog opened');
    assert.ok(tourCard(), 'the card stays for a non-modal dialog');
  });
});
