/**
 * Production entrypoint: build the authoritative Catan server and listen.
 *
 * All wiring lives in `app.ts` (`createGameServer`) so tests can boot the same
 * server on an ephemeral port with deterministic RNG; here we just read the
 * environment and start listening.
 */

import { createGameServer } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const VACANCY_MS = Number(process.env.VACANCY_MS ?? 2 * 60 * 1000);

const { httpServer } = createGameServer({ clientOrigin: CLIENT_ORIGIN, vacancyMs: VACANCY_MS });

httpServer.listen(PORT, () => {
  console.log(`Catan server listening on http://localhost:${PORT}`);
  console.log(`Accepting client origin: ${CLIENT_ORIGIN}`);
});
