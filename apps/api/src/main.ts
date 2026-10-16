import { createApp } from './app.js';
import { createCtx } from './context.js';
import { seedIfEmpty } from './fixtures/seed.js';

const ctx = await createCtx();
if (process.env.AIDEV_SEED === 'demo') await seedIfEmpty(ctx);
const app = await createApp(ctx);
const port = +(process.env.PORT ?? 4000);
await app.listen(port);
console.log(`AI Development Hub API listening on http://localhost:${port}/v1`);
