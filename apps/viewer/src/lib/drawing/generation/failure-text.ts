/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Why the drawing worker could not be used, as one line of plain text (#863).
 *
 * The fallback used to log the failure as an object after a fixed message. A
 * console log copied out of the browser keeps the text and may drop the
 * object, and the one report we had ended on the fixed message with nothing
 * after it. Everything that tells the next report the cause goes into the
 * text: the error's name and message, and for an event (the worker's `error`
 * or `messageerror`) its kind, type, message and where it was raised.
 */

/** The fields of a worker `error` / `messageerror` event the client reads. */
export interface WorkerFailureEvent {
  type?: string;
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  error?: unknown;
}

function isEventLike(value: object): value is WorkerFailureEvent {
  if (typeof Event !== 'undefined' && value instanceof Event) return true;
  return 'type' in value && ('filename' in value || 'lineno' in value);
}

/** One line that says what `failure` was, never empty. */
export function describeWorkerFailure(failure: unknown): string {
  if (failure === null || failure === undefined) return `no error value (${String(failure)})`;
  if (typeof failure !== 'object') return `${typeof failure} ${JSON.stringify(failure)}`;
  if (isEventLike(failure)) {
    const kind = (failure as object).constructor?.name ?? 'event';
    const parts = [`${kind} "${failure.type ?? '?'}"`];
    parts.push(failure.message ? `message ${JSON.stringify(failure.message)}` : 'no message');
    if (failure.filename) parts.push(`at ${failure.filename}:${failure.lineno ?? '?'}:${failure.colno ?? '?'}`);
    if (failure.error !== undefined && failure.error !== null) parts.push(`error ${describeWorkerFailure(failure.error)}`);
    return parts.join(', ');
  }
  const { name, message } = failure as { name?: unknown; message?: unknown };
  const label = typeof name === 'string' && name ? name : (failure as object).constructor?.name ?? 'object';
  return `${label}: ${typeof message === 'string' && message ? message : '(no message)'}`;
}
