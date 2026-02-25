import { buildApp } from './app.js';
import { env } from './config/env.js';
import { setupSocketIO } from './socket/index.js';

async function main() {
  const app = buildApp();

  // Fastify의 raw HTTP 서버에 Socket.IO 연결
  await app.ready();
  setupSocketIO(app.server);

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
