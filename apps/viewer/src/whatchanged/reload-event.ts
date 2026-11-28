/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The window event that asks for the IFC model to be reloaded with the project kept (#922). The project drawer and
 * RELOADMODEL dispatch it inside the click or the key press, so a file picker it may open still has the person's
 * gesture; `useReloadModel`, mounted once with the ribbon, answers it.
 */
export const RELOAD_MODEL_EVENT = 'ifcsheet:reload-model';

export function requestModelReload(): void {
  window.dispatchEvent(new Event(RELOAD_MODEL_EVENT));
}
