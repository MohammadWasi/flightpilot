import { NextRequest } from 'next/server';
import { z } from 'zod';
import { FlightPilotError } from '@flightpilot/shared';
import { equalSecret, loadConfig, rateLimit, sessionCookie } from '@flightpilot/core';
import { COOKIE, endpoint, json, readBody, sameOrigin } from '../../../lib/http';
export async function POST(request: NextRequest) {
  return endpoint(async () => {
    sameOrigin(request);
    rateLimit('login', 10, 60000);
    const { token } = z
      .object({ token: z.string().max(512) })
      .strict()
      .parse(await readBody(request));
    const config = loadConfig();
    if (!equalSecret(token, config.apiToken))
      throw new FlightPilotError(
        'UNAUTHENTICATED',
        'Incorrect workspace access token. Read the ignored .env file on your own computer.',
      );
    const response = json({ userId: 'local-user' });
    response.cookies.set(COOKIE, sessionCookie(config.apiToken), {
      httpOnly: true,
      secure: config.baseUrl.startsWith('https:'),
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 3600,
    });
    return response;
  });
}
