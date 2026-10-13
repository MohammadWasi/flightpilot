import { NextRequest } from 'next/server';
import { getService } from '@flightpilot/core';
import { ToolSchemas, FlightPilotError, type ToolName } from '@flightpilot/shared';
import { endpoint, json, readBody, requireUser, sameOrigin } from '../../../../lib/http';
export async function POST(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  return endpoint(async () => {
    const user = requireUser(request);
    if (!request.headers.get('authorization')) sameOrigin(request);
    const { name } = await context.params;
    if (!Object.hasOwn(ToolSchemas, name))
      throw new FlightPilotError('UNKNOWN_TOOL', 'This tool is not supported.');
    return json(await (await getService()).tool(user, name as ToolName, await readBody(request)));
  });
}
