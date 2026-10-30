/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Moved to the engine package (`packages/ifcsheet/src/site-area.ts`, #581): the site area POT and CUT are measured on is chosen by one rule, typed, then the plot drawn on the site plan, then the model's IfcSite. Re-exported so the app's imports stay as they were. */

export { siteAreaOf, type SiteAreaChoice, type SiteAreaSource } from '@bimvoice/ifcsheet';
