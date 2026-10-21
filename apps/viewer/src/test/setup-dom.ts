/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * happy-dom global registration for React rendering tests (#1907).
 *
 * Import this module FIRST in a `.test.tsx` file: ESM evaluates imported
 * modules in declaration order, so putting this import above `react-dom`
 * (and anything that transitively pulls it in) guarantees `window`,
 * `document`, `HTMLElement` etc. exist before React's module bodies run.
 *
 * There is deliberately no `unregister()` counterpart: the node test
 * runner executes each test file in its own child process, and code under
 * test schedules trailing timers (toast dismissal, blob-URL revocation)
 * that would blow up if the DOM globals disappeared underneath them.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';

// happy-dom 21 turns iframe page loading off by default (an SSRF guard for
// untrusted HTML); with it off an appended <iframe> has a null contentDocument.
// The pop-out and wheel tests append EMPTY iframes (no src) as stand-ins for
// child windows and read their contentDocument, so opt back in. Nothing here
// renders untrusted markup or gives an iframe a URL. CSS file loading stays
// at the new default (off); no test fetches stylesheets.
GlobalRegistrator.register({ url: 'http://localhost/', settings: { enableIframePageLoading: true } });

// React 19's `act()` (and `createRoot` in tests) requires the environment
// to opt in explicitly; without this flag every act() call warns and
// updates are not flushed act-style.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
