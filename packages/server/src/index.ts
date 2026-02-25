import { buildApp } from './app.js';
import { env } from './config/env.js';

async function main() {
  const app = buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
