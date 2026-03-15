import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from './env.js';
import * as schema from '../db/schema.js';

const client = postgres(env.DATABASE_URL, {
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export { client as pgClient };
