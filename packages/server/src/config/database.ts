import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from './env.js';
import * as schema from '../db/schema.js';

const client = postgres(env.DATABASE_URL, {
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idle_timeout: 30,
  connect_timeout: 10,
  // 부팅 시 startupMigrate 의 멱등 DDL(IF NOT EXISTS)이 "already exists, skipping" NOTICE 를
  // 수십 건 남겨 Railway 로그를 가린다. NOTICE 는 버리고 WARNING 이상만 남긴다.
  onnotice: (notice) => {
    if (notice.severity !== 'NOTICE') console.warn(`[postgres] ${notice.severity}: ${notice.message}`);
  },
});

export const db = drizzle(client, { schema });
export { client as pgClient };
