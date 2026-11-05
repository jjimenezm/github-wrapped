import type { PublicWrap, WrapStatusView } from '@wrapped/shared';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type TestAgent from 'supertest/lib/agent';
import { createE2eApp, e2eConfig } from './e2e-app';

interface ErrorBody {
  code: string;
  retryAt?: string;
}

const ana = { id: 4242, login: 'ana-dev' };
const beto = { id: 7777, login: 'beto' };
const WEB = 'http://localhost:4200';

describe('Wraps and GitHub login (e2e)', () => {
  let t: Awaited<ReturnType<typeof createE2eApp>>;

  beforeEach(async () => {
    t = await createE2eApp('2026-03-01T12:00:00Z');
  });

  afterEach(() => t.app.close());

  /**
   * The browser round trip: start → GitHub (skipped) → callback with a fixture code. Returns the
   * callback response, with `.expect(status)` like a supertest request.
   */
  function signIn(
    agent: TestAgent,
    as: { id: number; login: string },
    params: Record<string, string | number> = {},
  ) {
    const response = (async () => {
      const start = await agent
        .get('/api/auth/github')
        .query({ login: as.login, intent: 'publish', style: 'huella', locale: 'es', ...params })
        .expect(302);
      const state = new URL(start.headers.location).searchParams.get('state') ?? '';
      return agent
        .get('/api/auth/github/callback')
        .query({ code: `fixture:${as.id}:${as.login}`, state });
    })();
    return Object.assign(response, {
      expect: (status: number) =>
        response.then((res) => {
          expect(res.status).toBe(status);
          return res;
        }),
    });
  }

  const cookies = (res: { headers: Record<string, unknown> }) =>
    ((res.headers['set-cookie'] as string[] | undefined) ?? []).join('\n');

  describe('GitHub login', () => {
    it('sends the browser to GitHub with a signed state, no scopes and a nonce cookie', async () => {
      const res = await t
        .http()
        .get('/api/auth/github')
        .query({ login: 'ana-dev', intent: 'publish', style: 'huella', locale: 'es' })
        .expect(302);
      const url = new URL(res.headers.location);
      expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/api/auth/github/callback',
      );
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.has('scope')).toBe(false);
      expect(cookies(res)).toMatch(/gw_oauth=[^;]+;.*HttpOnly/);
    });

    it.each([
      [{ login: 'ana--dev', intent: 'publish', style: 'huella', locale: 'es' }],
      [{ login: 'ana-dev', intent: 'take-over', style: 'huella', locale: 'es' }],
      [{ login: 'ana-dev', intent: 'publish', style: 'sunset', locale: 'es' }],
      [{ login: 'ana-dev', intent: 'publish', style: 'huella', locale: 'fr' }],
    ])('refuses a login request that makes no sense (%o)', async (query) => {
      await t.http().get('/api/auth/github').query(query).expect(400);
    });

    it('publishes for the owner and lands on the share screen with a session', async () => {
      const agent = t.agent();
      const res = await signIn(agent, ana, { locale: 'en', style: 'cordillera' }).expect(302);
      expect(res.headers.location).toBe(`${WEB}/@ana-dev/2026/share`);
      expect(cookies(res)).toMatch(/gw_session=[^;]+;.*HttpOnly.*SameSite=Lax/i);
      expect((await agent.get('/api/auth/session').expect(200)).body).toEqual({
        githubUserId: 4242,
        login: 'ana-dev',
      });
      const wrap = (await t.http().get('/api/wraps/ana-dev/2026').expect(200)).body as PublicWrap;
      expect(wrap).toMatchObject({
        login: 'ana-dev',
        year: 2026,
        locale: 'en',
        cardStyle: 'cordillera',
      });
      expect(t.queue.jobs).toHaveLength(1);
    });

    it('refuses an altered state without opening a session', async () => {
      const agent = t.agent();
      const start = await agent
        .get('/api/auth/github')
        .query({ login: 'ana-dev', intent: 'publish', style: 'huella', locale: 'es' });
      const state = new URL(start.headers.location).searchParams.get('state') ?? '';
      const res = await agent
        .get('/api/auth/github/callback')
        .query({ code: 'fixture:4242:ana-dev', state: `${state.slice(0, -2)}xx` })
        .expect(400);
      expect((res.body as ErrorBody).code).toBe('OAUTH_STATE_INVALID');
      expect(cookies(res)).not.toContain('gw_session=');
      await agent.get('/api/auth/session').expect(401);
    });

    it('refuses a callback from a browser that did not start the login', async () => {
      const start = await t
        .agent()
        .get('/api/auth/github')
        .query({ login: 'ana-dev', intent: 'publish', style: 'huella', locale: 'es' });
      const state = new URL(start.headers.location).searchParams.get('state') ?? '';
      await t
        .agent()
        .get('/api/auth/github/callback')
        .query({ code: 'fixture:4242:ana-dev', state })
        .expect(400);
    });

    it('sends someone publishing another person’s login back with WRONG_ACCOUNT and saves nothing', async () => {
      const res = await signIn(t.agent(), ana, { login: 'beto' }).expect(302);
      expect(res.headers.location).toBe(`${WEB}/?oauth_error=WRONG_ACCOUNT&login=beto`);
      await t.http().get('/api/wraps/beto/2026').expect(404);
      expect(t.queue.jobs).toEqual([]);
    });

    it('sends a too-early republication back with the time it will be allowed', async () => {
      const agent = t.agent();
      await signIn(agent, ana).expect(302);
      const res = await signIn(agent, ana).expect(302);
      const url = new URL(res.headers.location);
      expect(url.searchParams.get('oauth_error')).toBe('REGENERATE_TOO_SOON');
      expect(url.searchParams.get('retry_at')).toBe('2026-03-02T12:00:00.000Z');
    });

    it('opens a session for "manage" without new versions or renders', async () => {
      const agent = t.agent();
      await signIn(agent, ana).expect(302);
      const res = await signIn(agent, ana, { intent: 'manage', year: 2026 }).expect(302);
      expect(res.headers.location).toBe(`${WEB}/@ana-dev/2026/share`);
      expect(t.queue.jobs).toHaveLength(1);
      expect((await t.repo.findByOwner(4242, 2026))?.dataVersion).toBe(1);
    });

    it('sends another account trying to "manage" back to the public page with WRONG_ACCOUNT', async () => {
      await signIn(t.agent(), ana).expect(302);
      const res = await signIn(t.agent(), beto, { login: 'ana-dev', intent: 'manage', year: 2026 });
      expect(res.headers.location).toBe(`${WEB}/@ana-dev/2026?oauth_error=WRONG_ACCOUNT`);
    });

    it('goes back to the public page when the owner cancels "manage" on GitHub', async () => {
      await signIn(t.agent(), ana).expect(302);
      const agent = t.agent();
      const start = await agent
        .get('/api/auth/github')
        .query({ login: 'ana-dev', intent: 'manage', year: 2026 });
      const state = new URL(start.headers.location).searchParams.get('state') ?? '';
      const res = await agent
        .get('/api/auth/github/callback')
        .query({ error: 'access_denied', state })
        .expect(302);
      expect(res.headers.location).toBe(`${WEB}/@ana-dev/2026?oauth_error=OAUTH_CANCELLED`);
    });

    it('changes the card through the login when the session expired', async () => {
      const agent = t.agent();
      await signIn(agent, ana).expect(302);
      t.later(3);
      await agent.get('/api/auth/session').expect(401);
      await signIn(agent, ana, { intent: 'change-card', style: 'constelacion', year: 2026 }).expect(
        302,
      );
      expect((await t.repo.findByOwner(4242, 2026))?.cardStyle).toBe('constelacion');
    });

    it('goes back quietly when the person cancels on GitHub', async () => {
      const agent = t.agent();
      const start = await agent
        .get('/api/auth/github')
        .query({ login: 'ana-dev', intent: 'publish', style: 'huella', locale: 'es' });
      const state = new URL(start.headers.location).searchParams.get('state') ?? '';
      const res = await agent
        .get('/api/auth/github/callback')
        .query({
          error: 'access_denied',
          error_description: 'The user has denied your application access.',
          state,
        })
        .expect(302);
      expect(res.headers.location).toBe(`${WEB}/?oauth_error=OAUTH_CANCELLED&login=ana-dev`);
      expect(cookies(res)).not.toContain('gw_session=');
      expect(t.queue.jobs).toEqual([]);
    });

    it('reports any other GitHub error as OAUTH_FAILED', async () => {
      const agent = t.agent();
      const start = await agent
        .get('/api/auth/github')
        .query({ login: 'ana-dev', intent: 'publish', style: 'huella', locale: 'es' });
      const state = new URL(start.headers.location).searchParams.get('state') ?? '';
      const res = await agent
        .get('/api/auth/github/callback')
        .query({ error: 'redirect_uri_mismatch', state })
        .expect(302);
      expect(res.headers.location).toBe(`${WEB}/?oauth_error=OAUTH_FAILED&login=ana-dev`);
    });

    it('closes the session on logout', async () => {
      const agent = t.agent();
      await signIn(agent, ana).expect(302);
      await agent.post('/api/auth/logout').expect(204);
      await agent.get('/api/auth/session').expect(401);
    });
  });

  describe('owner routes', () => {
    it('answers 401 without a session and 403 to another account', async () => {
      const anaAgent = t.agent();
      await signIn(anaAgent, ana).expect(302);
      const betoAgent = t.agent();
      await signIn(betoAgent, beto).expect(302);

      const anonymous = await t
        .http()
        .put('/api/wraps/ana-dev/2026/card')
        .send({ cardStyle: 'cordillera' });
      expect(anonymous.status).toBe(401);
      expect((anonymous.body as ErrorBody).code).toBe('UNAUTHENTICATED');
      const other = await betoAgent
        .put('/api/wraps/ana-dev/2026/card')
        .send({ cardStyle: 'cordillera' });
      expect(other.status).toBe(403);
      expect((other.body as ErrorBody).code).toBe('NOT_OWNER');
      await betoAgent.delete('/api/wraps/ana-dev/2026').expect(403);
      await betoAgent.post('/api/wraps/ana-dev/2026/images/retry').expect(403);
    });

    it('publishes with a live session, and refuses another person’s login', async () => {
      const agent = t.agent();
      await signIn(agent, beto).expect(302);
      await t
        .http()
        .post('/api/wraps/ana-dev/publish')
        .send({ cardStyle: 'huella', locale: 'es' })
        .expect(401);
      const res = await agent
        .post('/api/wraps/ana-dev/publish')
        .send({ cardStyle: 'huella', locale: 'es' });
      expect(res.status).toBe(403);
      expect((res.body as ErrorBody).code).toBe('NOT_OWNER');
    });

    it('shows the owner the state of the renders', async () => {
      const agent = t.agent();
      await signIn(agent, ana).expect(302);
      const status = (await agent.get('/api/wraps/ana-dev/2026/status').expect(200))
        .body as WrapStatusView;
      expect(status).toEqual({
        imagesStatus: 'queued',
        imagesVersion: 1,
        imagesReadyVersion: null,
        videoStatus: 'none',
        videoReadyVersion: null,
        queuePosition: 1,
        images: null,
        videoQueuePosition: null,
        video: null,
      });
    });

    it('points the owner and the public page at the PNGs once they are ready', async () => {
      const agent = t.agent();
      await signIn(agent, ana).expect(302);
      const wrap = await t.repo.findByOwner(ana.id, 2026);
      if (!wrap) throw new Error('not published');
      await t.repo.update(wrap.id, { imagesStatus: 'ready', imagesReadyVersion: 1 }, wrap);
      await mkdir(join(t.config.filesDir, wrap.id, 'img/1'), { recursive: true });
      await writeFile(join(t.config.filesDir, wrap.id, 'img/1/card.png'), 'png');

      const images = {
        card: `/api/files/${wrap.id}/img/1/card.png`,
        og: `/api/files/${wrap.id}/img/1/og.png`,
      };
      const status = (await agent.get('/api/wraps/ana-dev/2026/status').expect(200))
        .body as WrapStatusView;
      expect(status).toMatchObject({ imagesStatus: 'ready', imagesReadyVersion: 1, images });
      const page = (await t.http().get('/api/wraps/ana-dev/2026').expect(200)).body as PublicWrap;
      expect(page.images).toEqual(images);
      await t.http().get(images.card).expect(200);
    });

    it('changes the card', async () => {
      const agent = t.agent();
      await signIn(agent, ana).expect(302);
      await agent
        .put('/api/wraps/ana-dev/2026/card')
        .send({ cardStyle: 'constelacion' })
        .expect(200);
      expect((await t.http().get('/api/wraps/ana-dev/2026').expect(200)).body).toMatchObject({
        cardStyle: 'constelacion',
      });
      await agent.put('/api/wraps/ana-dev/2026/card').send({ cardStyle: 'sunset' }).expect(400);
    });

    it('regenerates once a day and answers 429 with the time before that', async () => {
      const agent = t.agent();
      await signIn(agent, ana).expect(302);
      const res = await agent.post('/api/wraps/ana-dev/2026/regenerate').expect(429);
      expect(res.body as ErrorBody).toMatchObject({
        code: 'REGENERATE_TOO_SOON',
        retryAt: '2026-03-02T12:00:00.000Z',
      });
    });

    it('answers 409 YEAR_FROZEN when regenerating a closed year', async () => {
      const agent = t.agent();
      await signIn(agent, ana).expect(302);
      t.at('2027-02-02T12:00:00Z');
      await signIn(agent, ana, { intent: 'manage', year: 2026 }).expect(302);
      const res = await agent.post('/api/wraps/ana-dev/2026/regenerate').expect(409);
      expect((res.body as ErrorBody).code).toBe('YEAR_FROZEN');
    });

    it('deletes: the public URL answers 410 until the owner publishes again', async () => {
      const agent = t.agent();
      await signIn(agent, ana).expect(302);
      await agent.delete('/api/wraps/ana-dev/2026').expect(204);
      const gone = await t.http().get('/api/wraps/ana-dev/2026').expect(410);
      expect((gone.body as ErrorBody).code).toBe('WRAP_DELETED');
      expect((await t.repo.findByOwner(4242, 2026))?.snapshot).toBeNull();
      t.later(24);
      await signIn(agent, ana).expect(302);
      await t.http().get('/api/wraps/ana-dev/2026').expect(200);
    });
  });

  describe('video', () => {
    beforeEach(async () => {
      await t.app.close();
      t = await createE2eApp(
        '2026-03-01T12:00:00Z',
        e2eConfig({ video: { enabled: true, mediaBaseUrl: null } }),
      );
    });

    const published = async (agent: TestAgent) => {
      await signIn(agent, ana).expect(302);
      const wrap = await t.repo.findByOwner(ana.id, 2026);
      if (!wrap) throw new Error('not published');
      return wrap;
    };

    it('queues the video when publishing and tells the owner its place in line', async () => {
      const agent = t.agent();
      const wrap = await published(agent);
      expect(t.queue.videoJobs).toEqual([
        { id: `video-${wrap.id}-1`, wrapId: wrap.id, version: 1, state: 'waiting' },
      ]);
      const status = (await agent.get('/api/wraps/ana-dev/2026/status').expect(200))
        .body as WrapStatusView;
      expect(status).toMatchObject({ videoStatus: 'queued', videoQueuePosition: 1, video: null });
    });

    it('lets only the owner retry a failed video, and only a failed one', async () => {
      const agent = t.agent();
      const wrap = await published(agent);
      const notFailed = await agent.post('/api/wraps/ana-dev/2026/video/retry').expect(409);
      expect((notFailed.body as ErrorBody).code).toBe('VIDEO_NOT_FAILED');

      t.queue.setVideoState(wrap.id, 1, 'failed');
      await t.repo.update(wrap.id, { videoStatus: 'failed' }, wrap);
      const betoAgent = t.agent();
      await signIn(betoAgent, beto).expect(302);
      await betoAgent.post('/api/wraps/ana-dev/2026/video/retry').expect(403);
      await t.http().post('/api/wraps/ana-dev/2026/video/retry').expect(401);

      const retried = (await agent.post('/api/wraps/ana-dev/2026/video/retry').expect(200))
        .body as WrapStatusView;
      expect(retried).toMatchObject({ videoStatus: 'queued', videoQueuePosition: 1 });
      const anaJobs = t.queue.videoJobs.filter((job) => job.wrapId === wrap.id);
      expect(anaJobs.map((job) => [job.id, job.state])).toEqual([
        [`video-${wrap.id}-1`, 'waiting'],
      ]);
    });

    it('serves the ready MP4 by byte ranges, to the owner and on the public page', async () => {
      const agent = t.agent();
      const wrap = await published(agent);
      t.queue.setVideoState(wrap.id, 1, 'done');
      await t.repo.update(wrap.id, { videoStatus: 'ready', videoReadyVersion: 1 }, wrap);
      await mkdir(join(t.config.filesDir, wrap.id, 'video'), { recursive: true });
      await writeFile(join(t.config.filesDir, wrap.id, 'video/1.mp4'), 'mp4-bytes');

      const video = `/api/files/${wrap.id}/video/1.mp4`;
      const status = (await agent.get('/api/wraps/ana-dev/2026/status').expect(200))
        .body as WrapStatusView;
      expect(status).toMatchObject({ videoStatus: 'ready', videoReadyVersion: 1, video });
      const page = (await t.http().get('/api/wraps/ana-dev/2026').expect(200)).body as PublicWrap;
      expect(page.video).toBe(video);
      const range = await t.http().get(video).set('Range', 'bytes=0-1').expect(206);
      expect(range.headers['accept-ranges']).toBe('bytes');
      expect(range.headers['content-length']).toBe('2');
    });

    it('changing the card keeps the video; regenerating queues the next one', async () => {
      const agent = t.agent();
      const wrap = await published(agent);
      await t.repo.update(wrap.id, { videoStatus: 'ready', videoReadyVersion: 1 }, wrap);
      t.queue.setVideoState(wrap.id, 1, 'done');

      await agent.put('/api/wraps/ana-dev/2026/card').send({ cardStyle: 'cordillera' }).expect(200);
      expect(t.queue.videoJobs).toHaveLength(1);
      t.later(24);
      // The session expired overnight: the owner confirms with GitHub again (no new version).
      await signIn(agent, ana, { intent: 'manage', year: 2026 }).expect(302);
      const page = (await agent.post('/api/wraps/ana-dev/2026/regenerate').expect(200))
        .body as PublicWrap;
      expect(page).toMatchObject({ videoStatus: 'queued', videoReadyVersion: 1 });
      expect(page.video).toBe(`/api/files/${wrap.id}/video/1.mp4`);
      expect(t.queue.videoJobs.map((job) => job.id)).toEqual([
        `video-${wrap.id}-1`,
        `video-${wrap.id}-2`,
      ]);
    });
  });

  describe('public page data', () => {
    it('answers 404 for a wrap that was never published', async () => {
      const res = await t.http().get('/api/wraps/ana-dev/2026').expect(404);
      expect((res.body as ErrorBody).code).toBe('WRAP_NOT_FOUND');
    });

    it('redirects the old login to the new one after a rename', async () => {
      await signIn(t.agent(), ana).expect(302);
      await signIn(
        t.agent(),
        { id: 4242, login: 'ana-nueva' },
        { login: 'ana-dev', intent: 'manage', year: 2026 },
      ).expect(302);
      const res = await t.http().get('/api/wraps/ana-dev/2026').expect(301);
      expect(res.headers.location).toBe('/api/wraps/ana-nueva/2026');
      await t.http().get('/api/wraps/ana-nueva/2026').expect(200);
    });

    it('does not count toward the lookup limit and never needs a session', async () => {
      await signIn(t.agent(), ana).expect(302);
      for (let i = 0; i < 10; i++) await t.http().get('/api/wraps/ana-dev/2026').expect(200);
    });
  });

  it('limits login attempts per IP', async () => {
    await t.app.close();
    t = await createE2eApp(
      '2026-03-01T12:00:00Z',
      e2eConfig({
        rateLimit: {
          preview: { max: 5, windowSeconds: 600 },
          publish: { max: 2, windowSeconds: 3600 },
        },
      }),
    );
    const start = () =>
      t
        .http()
        .get('/api/auth/github')
        .query({ login: 'ana-dev', intent: 'publish', style: 'huella', locale: 'es' });
    await start().expect(302);
    await start().expect(302);
    // A full-page navigation: the person lands back on the web with the wait, not on raw JSON.
    const limited = await start().expect(302);
    expect(limited.headers.location).toBe(
      `${WEB}/?oauth_error=RATE_LIMITED&login=ana-dev&retry_after=3600`,
    );
    const manage = await t
      .http()
      .get('/api/auth/github')
      .query({ login: 'ana-dev', intent: 'manage', year: 2026 })
      .expect(302);
    expect(manage.headers.location).toBe(
      `${WEB}/@ana-dev/2026?oauth_error=RATE_LIMITED&retry_after=3600`,
    );
  });
});
