import { buildApp } from './app.js';
import { env } from './config/env.js';
import { setupSocketIO } from './socket/index.js';
import { pgClient } from './config/database.js';
import { runStartupMigrations } from './db/startupMigrate.js';

async function main() {
  const app = buildApp();

  // Fastify의 raw HTTP 서버에 Socket.IO 연결
  await app.ready();

  // 누락 컬럼 보강 (html_url 등) — 새 코드의 쿼리가 깨지지 않도록 listen 전에 실행
  await runStartupMigrations(app.log);

  setupSocketIO(app.server, app.log);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    await app.close();
    await pgClient.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
