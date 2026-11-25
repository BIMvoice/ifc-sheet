/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Open several model files as one set (detail: File[]). Unlike
 * `ifc-lite:load-file`, which takes one file, every file goes through the
 * viewport's own router: no model loaded and several files is a fresh
 * federation, models already loaded and the files are added to them. The
 * listener is `useOpenModelFiles`, mounted once by the viewport. The start
 * page sends it when it is given more than one IFC file (#863).
 */
export const EVENT_LOAD_FILES = 'ifc-lite:load-files';
