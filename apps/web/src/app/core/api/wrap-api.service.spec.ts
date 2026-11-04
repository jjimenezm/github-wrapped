import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { demoSnapshot } from '../../../testing/snapshot';
import { ApiError } from './api-error';
import { WrapApiService } from './wrap-api.service';

describe('WrapApiService.preview', () => {
  let api: WrapApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(WrapApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function failWith(
    body: object | string,
    init: { status: number; statusText: string; headers?: Record<string, string> },
  ): Promise<ApiError> {
    const result = firstValueFrom(api.preview('ana')).then(
      () => {
        throw new Error('Expected the preview to fail');
      },
      (error: unknown) => error,
    );
    http.expectOne('/api/preview/ana').flush(body, init);
    const error = await result;
    if (!(error instanceof ApiError)) throw new Error(`Not an ApiError: ${String(error)}`);
    return error;
  }

  it('reads the snapshot from the api', async () => {
    const snapshot = demoSnapshot({ login: 'ana' });
    const result = firstValueFrom(api.preview('ana'));

    const request = http.expectOne('/api/preview/ana');
    expect(request.request.method).toBe('GET');
    request.flush(snapshot);

    expect(await result).toEqual(snapshot);
  });

  it('encodes the login into the path', () => {
    void firstValueFrom(api.preview('a/b?c')).catch(() => undefined);

    http.expectOne('/api/preview/a%2Fb%3Fc').flush({});
  });

  it('keeps the stable code of an api error', async () => {
    const error = await failWith(
      { statusCode: 404, code: 'USER_NOT_FOUND', message: 'No such user' },
      { status: 404, statusText: 'Not Found' },
    );

    expect(error).toMatchObject({ status: 404, code: 'USER_NOT_FOUND', retryAfter: null });
  });

  it('reads retryAfter from the body', async () => {
    const error = await failWith(
      { statusCode: 503, code: 'GITHUB_RATE_LIMITED', message: 'Later', retryAfter: 42 },
      { status: 503, statusText: 'Service Unavailable', headers: { 'Retry-After': '99' } },
    );

    expect(error).toMatchObject({ status: 503, code: 'GITHUB_RATE_LIMITED', retryAfter: 42 });
  });

  it('falls back to the Retry-After header', async () => {
    const error = await failWith(
      { statusCode: 429, code: 'RATE_LIMITED', message: 'Slow down' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '60' } },
    );

    expect(error).toMatchObject({ code: 'RATE_LIMITED', retryAfter: 60 });
  });

  it('calls a failure without a body from the api UNKNOWN', async () => {
    const error = await failWith('<html>Bad gateway</html>', {
      status: 502,
      statusText: 'Bad Gateway',
    });

    expect(error).toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('calls a request that never reached the api NETWORK', async () => {
    const result = firstValueFrom(api.preview('ana')).catch((error: unknown) => error);

    http.expectOne('/api/preview/ana').error(new ProgressEvent('error'));

    expect(await result).toMatchObject({ status: 0, code: 'NETWORK' });
  });
});

describe('WrapApiService for published wraps', () => {
  let api: WrapApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(WrapApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads a public wrap by login and year', async () => {
    const result = firstValueFrom(api.publicWrap('ana-dev', 2026));

    http.expectOne('/api/wraps/ana-dev/2026').flush({ login: 'ana-dev', year: 2026 });

    expect(await result).toMatchObject({ login: 'ana-dev', year: 2026 });
  });

  it('asks who is signed in, with the session cookie', async () => {
    const result = firstValueFrom(api.session());

    const request = http.expectOne('/api/auth/session');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ githubUserId: 1, login: 'ana-dev' });

    expect(await result).toEqual({ githubUserId: 1, login: 'ana-dev' });
  });

  it('changes the card of a wrap the session owns', async () => {
    const result = firstValueFrom(api.changeCard('ana-dev', 2026, 'cordillera'));

    const request = http.expectOne('/api/wraps/ana-dev/2026/card');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ cardStyle: 'cordillera' });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ login: 'ana-dev', year: 2026, cardStyle: 'cordillera' });

    expect(await result).toMatchObject({ cardStyle: 'cordillera' });
  });

  it('reports an expired session with its code', async () => {
    const result = firstValueFrom(api.changeCard('ana-dev', 2026, 'huella')).catch(
      (error: unknown) => error,
    );

    http
      .expectOne('/api/wraps/ana-dev/2026/card')
      .flush(
        { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Sign in' },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(await result).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('reads the state of the renders for the owner', async () => {
    const result = firstValueFrom(api.status('ana-dev', 2026));

    const request = http.expectOne('/api/wraps/ana-dev/2026/status');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ imagesStatus: 'queued', imagesVersion: 1, imagesReadyVersion: null });

    expect(await result).toMatchObject({ imagesStatus: 'queued', imagesVersion: 1 });
  });

  it('asks to render failed images again', async () => {
    const result = firstValueFrom(api.retryImages('ana-dev', 2026));

    const request = http.expectOne('/api/wraps/ana-dev/2026/images/retry');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ imagesStatus: 'queued', imagesVersion: 1 });

    expect(await result).toMatchObject({ imagesStatus: 'queued' });
  });

  it('deletes a wrap the session owns', async () => {
    const result = firstValueFrom(api.deleteWrap('ana-dev', 2026));

    const request = http.expectOne('/api/wraps/ana-dev/2026');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null, { status: 204, statusText: 'No Content' });

    await expect(result).resolves.toBeNull();
  });

  it('logs out', async () => {
    const result = firstValueFrom(api.logout());

    const request = http.expectOne('/api/auth/logout');
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 204, statusText: 'No Content' });

    await expect(result).resolves.toBeNull();
  });
});
