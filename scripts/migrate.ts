import { loadConfig } from '../packages/core/src/config';
import { Store } from '../packages/core/src/store';
const store = await Store.open(loadConfig());
await store.purge();
await store.close();
console.log('Database schema ready; retention cleanup complete.');
