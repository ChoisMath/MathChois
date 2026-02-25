import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from './env.js';
import * as schema from '../db/schema.js';

const client = postgres(env.DATABASE_URL, {
  max: 20,
  idle_timeout: 30,
});

export const db = drizzle(client, { schema });
export { client as pgClient };
