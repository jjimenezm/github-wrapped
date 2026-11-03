import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { WrapSnapshot } from '@wrapped/shared';
import { Observable, catchError, throwError } from 'rxjs';
import { ApiError } from './api-error';

/** Same origin in production (Traefik) and in development (the `ng serve` proxy). */
export const API_BASE = '/api';

@Injectable({ providedIn: 'root' })
export class WrapApiService {
  private readonly http = inject(HttpClient);

  /** The year so far for a normalized login; nothing is stored for people who don't publish. */
  preview(login: string): Observable<WrapSnapshot> {
    return this.http
      .get<WrapSnapshot>(`${API_BASE}/preview/${encodeURIComponent(login)}`)
      .pipe(catchError((error: unknown) => throwError(() => ApiError.from(error))));
  }
}
