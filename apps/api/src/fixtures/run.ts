import { createCtx } from '../context.js';
import { seedIfEmpty } from './seed.js';
const ctx = await createCtx();
const did = await seedIfEmpty(ctx);
if (!did) console.log('Database already has artifacts; nothing to seed.');
await ctx.db.close();
