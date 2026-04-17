import { buildApp } from './app.js';

const app = buildApp();

async function main() {
  await app.listen({ port: app.env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

