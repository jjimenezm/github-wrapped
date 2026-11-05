import {
  FetchBackend,
  type HttpBackend,
  type HttpEvent,
  type HttpRequest,
} from '@angular/common/http';
import { Injectable, InjectionToken, REQUEST, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { API_BASE } from './wrap-api.service';

/** The api as the web container reaches it inside the server (e.g. `http://wrapped-api:3000`). */
export const API_INTERNAL_URL = new InjectionToken<string>('API_INTERNAL_URL');

/**
 * The internal URL for a same-origin `/api` call, or null for anything else. `pageOrigin` is the
 * origin of the page being rendered; relative URLs count as same-origin.
 */
export function internalApiUrl(
  url: string,
  pageOrigin: string,
  internalBase: string,
): string | null {
  const parsed = new URL(url, pageOrigin);
  const sameOrigin = parsed.origin === new URL(pageOrigin).origin;
  const isApi = parsed.pathname === API_BASE || parsed.pathname.startsWith(`${API_BASE}/`);
  if (!sameOrigin || !isApi) return null;
  return `${internalBase.replace(/\/+$/, '')}${parsed.pathname}${parsed.search}`;
}

/**
 * Server only. Without it, the server-rendered public page would ask for its wrap at the public
 * origin: out through Cloudflare and back in, past the origin's client-certificate check. As the
 * HTTP backend it runs after every interceptor, so the transfer cache keys the request exactly as
 * it would without it, and hydration still finds the answer.
 */
@Injectable()
export class InternalApiBackend implements HttpBackend {
  private readonly fetch = inject(FetchBackend);
  private readonly internalBase = inject(API_INTERNAL_URL);
  private readonly pageOrigin = new URL(
    inject(REQUEST, { optional: true })?.url ?? 'http://localhost',
  ).origin;

  handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const url = internalApiUrl(request.url, this.pageOrigin, this.internalBase);
    return this.fetch.handle(url ? request.clone({ url }) : request);
  }
}
