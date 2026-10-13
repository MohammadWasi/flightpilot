import { SimulatorProvider, DuffelProvider } from '@flightpilot/providers';
import { loadConfig } from './config';
import { Store } from './store';
import { FlightService } from './service';
export * from './config';
export * from './service';
export * from './security';
export * from './airports';
export * from './store';
const globalState = globalThis as typeof globalThis & { flightpilotService?: Promise<FlightService> };
export function getService() {
  return (globalState.flightpilotService ??= (async () => {
    const config = loadConfig();
    const store = await Store.open(config);
    await store.purge();
    const provider =
      config.mode === 'duffel_test'
        ? new DuffelProvider({ token: config.duffelToken! })
        : new SimulatorProvider();
    await store.put('users', 'local-user', 'local-user', {
      id: 'local-user',
      authentication: 'local access key',
    });
    return new FlightService(store, provider, config);
  })());
}
export * from './webhooks';
