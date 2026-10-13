import { NextRequest } from 'next/server';
import { COOKIE, endpoint, json, sameOrigin } from '../../../lib/http';
export async function POST(request: NextRequest) {
  return endpoint(async () => {
    sameOrigin(request);
    const response = json({ ok: true });
    response.cookies.delete(COOKIE);
    return response;
  });
}
