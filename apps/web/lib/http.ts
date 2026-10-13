import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { FlightPilotError } from '@flightpilot/shared';
import { authenticateSession, equalSecret, loadConfig, logEvent } from '@flightpilot/core';
export const COOKIE = 'flightpilot_session';
export function requireUser(request: NextRequest, browserOnly = false) {
  const config = loadConfig();
  if (request.headers.get('host') !== new URL(config.baseUrl).host)
    throw new FlightPilotError('FORBIDDEN', 'Unexpected request host. Use the configured FlightPilot URL.');
  if (!browserOnly) {
    const auth = request.headers.get('authorization');
    if (auth) {
      if (auth.startsWith('Bearer ') && equalSecret(auth.slice(7), config.apiToken)) return 'local-user';
      throw new FlightPilotError('UNAUTHENTICATED', 'Invalid backend access token.');
    }
  }
  return authenticateSession(request.cookies.get(COOKIE)?.value ?? '', config.apiToken);
}
export function sameOrigin(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(loadConfig().baseUrl).origin)
    throw new FlightPilotError(
      'FORBIDDEN',
      'Open checkout on the configured FlightPilot site before submitting.',
    );
}
export async function readBody(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new FlightPilotError('INVALID_INPUT', 'Use application/json.');
  const raw = await readText(request);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new FlightPilotError('INVALID_INPUT', 'Request body must be valid JSON.');
  }
}
export async function readText(request: NextRequest, max = 65536) {
  if (Number(request.headers.get('content-length') ?? 0) > max)
    throw new FlightPilotError('INVALID_INPUT', 'Request too large.');
  const reader = request.body?.getReader();
  if (!reader) return '';
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new FlightPilotError('INVALID_INPUT', 'Request too large.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function endpoint(fn: () => Promise<NextResponse>) {
  const requestId = randomUUID();
  try {
    const response = await fn();
    response.headers.set('X-Request-ID', requestId);
    return response;
  } catch (e) {
    const validation = e instanceof ZodError;
    const code = e instanceof FlightPilotError ? e.code : validation ? 'INVALID_INPUT' : 'INTERNAL_ERROR';
    const message =
      e instanceof FlightPilotError
        ? e.message
        : validation
          ? e.issues.map((v) => `${v.path.join('.') || 'request'}: ${v.message}`).join('; ')
          : 'The request could not be completed. Check diagnostics using the request ID; do not retry an uncertain booking.';
    const status =
      code === 'UNAUTHENTICATED'
        ? 401
        : code === 'FORBIDDEN'
          ? 403
          : code === 'NOT_FOUND'
            ? 404
            : code === 'RATE_LIMITED'
              ? 429
              : code === 'INTERNAL_ERROR'
                ? 500
                : code === 'PRICE_CHANGED' || code === 'CONFLICT'
                  ? 409
                  : 400;
    logEvent('request_error', { requestId, code });
    const response = json(
      { error: { code, message, retryable: e instanceof FlightPilotError ? e.retryable : false }, requestId },
      status,
    );
    response.headers.set('X-Request-ID', requestId);
    return response;
  }
}
