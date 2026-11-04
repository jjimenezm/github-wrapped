import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CardStyle, PublicWrap, WrapSnapshot, WrapStatusView } from '@wrapped/shared';
import { Observable, catchError, throwError } from 'rxjs';
import { ApiError } from './api-error';

/** Same origin in production (Traefik) and in development (the `ng serve` proxy). */
export const API_BASE = '/api';

/** Who the session cookie says is signed in. */
export interface SessionIdentity {
  githubUserId: number;
  login: string;
}

const asApiError = <T>(source: Observable<T>) =>
  source.pipe(catchError((error: unknown) => throwError(() => ApiError.from(error))));

@Injectable({ providedIn: 'root' })
export class WrapApiService {
  private readonly http = inject(HttpClient);

  /** The year so far for a normalized login; nothing is stored for people who don't publish. */
  preview(login: string): Observable<WrapSnapshot> {
    return asApiError(
      this.http.get<WrapSnapshot>(`${API_BASE}/preview/${encodeURIComponent(login)}`),
    );
  }

  publicWrap(login: string, year: number): Observable<PublicWrap> {
    return asApiError(this.http.get<PublicWrap>(this.wrapUrl(login, year)));
  }

  session(): Observable<SessionIdentity> {
    return asApiError(
      this.http.get<SessionIdentity>(`${API_BASE}/auth/session`, { withCredentials: true }),
    );
  }

  /** Needs the owner's session; a 401 means it expired and GitHub has to confirm again. */
  changeCard(login: string, year: number, cardStyle: CardStyle): Observable<PublicWrap> {
    return asApiError(
      this.http.put<PublicWrap>(
        `${this.wrapUrl(login, year)}/card`,
        { cardStyle },
        { withCredentials: true },
      ),
    );
  }

  /** The owner's view of the renders; polled by the share screen until the images are ready. */
  status(login: string, year: number): Observable<WrapStatusView> {
    return asApiError(
      this.http.get<WrapStatusView>(`${this.wrapUrl(login, year)}/status`, {
        withCredentials: true,
      }),
    );
  }

  /** Only for images that failed: they go back to the queue. */
  retryImages(login: string, year: number): Observable<WrapStatusView> {
    return asApiError(
      this.http.post<WrapStatusView>(`${this.wrapUrl(login, year)}/images/retry`, null, {
        withCredentials: true,
      }),
    );
  }

  /** The public URL and the QR answer 410 from then on; the owner can publish again. */
  deleteWrap(login: string, year: number): Observable<null> {
    return asApiError(this.http.delete<null>(this.wrapUrl(login, year), { withCredentials: true }));
  }

  logout(): Observable<null> {
    return asApiError(
      this.http.post<null>(`${API_BASE}/auth/logout`, null, { withCredentials: true }),
    );
  }

  private wrapUrl(login: string, year: number): string {
    return `${API_BASE}/wraps/${encodeURIComponent(login)}/${year}`;
  }
}
