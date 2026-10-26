/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The hosted MCP endpoint at /mcp (#165). Off unless IFCSHEET_HOSTED_MCP=1: it answers 404 otherwise.
// Node runtime (not edge): the drawing engine needs it. Built from the viewer's dependencies (`@ifc-lite/mcp`).
import { handleHostedMcp } from '../packages/mcp/dist/transport/hosted.js';

export default {
  fetch: (request: Request): Promise<Response> => handleHostedMcp(request),
};
