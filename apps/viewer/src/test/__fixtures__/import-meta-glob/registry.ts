/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What `import-meta-glob.test.ts` loads under the runner: each supported form once. A comment naming import.meta.glob('./outside.ts') is not a call. */
export const eager = import.meta.glob<{ value: string }>(['./entries/*.ts', '!./entries/*.skip.ts'], { eager: true });
export const defaults = import.meta.glob<string>('./entries/*.ts', { eager: true, import: 'default' });
export const lazy = import.meta.glob<{ value: string }>('./entries/*.ts');
export const lazyValue = import.meta.glob<string>('./entries/*.ts', { import: 'value' });
export const self = import.meta.glob('./*.ts', { eager: true });
export const text = "import.meta.glob('./outside.ts', { eager: true })";
