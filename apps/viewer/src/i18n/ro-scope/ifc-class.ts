/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Keys `locales/ro.test.ts` requires Romanian for: the names of IFC classes in the tool names, the bulk editor's class list
 * and the model-element kinds (#602), every key of `catalogues/ifc-class.ro.ts`.
 */
import { ifcClassRo } from '../catalogues/ifc-class.ro';

export const keys: readonly string[] = Object.keys(ifcClassRo);
