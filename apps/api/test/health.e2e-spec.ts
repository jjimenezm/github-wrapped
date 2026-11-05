import { createE2eApp } from './e2e-app';

describe('GET /api/health (e2e)', () => {
  it('answers under the /api prefix Traefik forwards, with nothing to check in memory', async () => {
    const { app, http } = await createE2eApp('2026-06-15T12:00:00Z');
    try {
      const response = await http().get('/api/health').expect(200);
      expect(response.body).toEqual({ status: 'ok', checks: {} });
    } finally {
      await app.close();
    }
  });
});
