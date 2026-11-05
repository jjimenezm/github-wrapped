import { FetchBackend, HttpBackend, HttpRequest, HttpResponse } from '@angular/common/http';
import { REQUEST } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { API_INTERNAL_URL, InternalApiBackend, internalApiUrl } from './internal-api.backend';

const PAGE = 'http://wrapped.jjimenezm.dev';
const API = 'http://wrapped-api:3000';

describe('internalApiUrl', () => {
  it('sends a same-origin /api call straight to the api container', () => {
    expect(internalApiUrl(`${PAGE}/api/wraps/ana/2026`, PAGE, API)).toBe(
      'http://wrapped-api:3000/api/wraps/ana/2026',
    );
  });

  it('keeps the query string', () => {
    expect(internalApiUrl('/api/preview/ana?locale=en', PAGE, API)).toBe(
      'http://wrapped-api:3000/api/preview/ana?locale=en',
    );
  });

  it('leaves alone what is not the api of this page', () => {
    expect(internalApiUrl(`${PAGE}/apis/x`, PAGE, API)).toBeNull();
    expect(internalApiUrl(`${PAGE}/files/x/img/1/card.png`, PAGE, API)).toBeNull();
    expect(internalApiUrl('https://api.github.com/api/users', PAGE, API)).toBeNull();
  });

  it('accepts a base with a trailing slash', () => {
    expect(internalApiUrl('/api/health', PAGE, `${API}/`)).toBe(
      'http://wrapped-api:3000/api/health',
    );
  });
});

describe('InternalApiBackend', () => {
  it('rewrites below the interceptors, so the transfer cache keeps the public URL', async () => {
    const seen: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: API_INTERNAL_URL, useValue: API },
        { provide: REQUEST, useValue: new Request(`${PAGE}/@ana/2026`) },
        {
          provide: FetchBackend,
          useValue: {
            handle: (request: HttpRequest<unknown>) => {
              seen.push(request.url);
              return of(new HttpResponse({ status: 200 }));
            },
          },
        },
        { provide: HttpBackend, useClass: InternalApiBackend },
      ],
    });
    const backend = TestBed.inject(HttpBackend);
    await firstValueFrom(backend.handle(new HttpRequest('GET', `${PAGE}/api/wraps/ana/2026`)));
    await firstValueFrom(backend.handle(new HttpRequest('GET', 'https://example.com/a')));
    expect(seen).toEqual(['http://wrapped-api:3000/api/wraps/ana/2026', 'https://example.com/a']);
  });
});
