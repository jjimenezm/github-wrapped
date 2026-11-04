import { RESPONSE_INIT, inject } from '@angular/core';
import { RedirectCommand, Router, type ResolveFn } from '@angular/router';
import type { PublicWrap } from '@wrapped/shared';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { WrapApiService } from '../../core/api/wrap-api.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { wrapLogin } from '../../core/routing/wrap-url';

/** What `/@login/year` shows: the wrap, or why there is none. */
export type PublicPage =
  | { kind: 'wrap'; wrap: PublicWrap }
  | { kind: 'missing' | 'gone' | 'failed'; login: string; year: number };

/** The status the server answers with when there is no wrap to show (R9). */
const STATUS = { missing: 404, gone: 410, failed: 503 } as const;

/**
 * Loads the public wrap before the page renders, on the server and in the browser alike
 * (HttpClient's transfer cache spares the second request). It switches the UI to the wrap's
 * language, sets the HTTP status the server sends, and moves a renamed login to its new URL.
 */
export const publicWrapResolver: ResolveFn<PublicPage> = async (route, state) => {
  const api = inject(WrapApiService);
  const locale = inject(LocaleService);
  const router = inject(Router);
  const response = inject(RESPONSE_INIT, { optional: true });
  const login = wrapLogin(route.paramMap.get('handle') ?? '');
  const year = Number(route.paramMap.get('year'));

  try {
    const wrap = await firstValueFrom(api.publicWrap(login, year));
    // The api follows a GitHub rename (301); the page moves to the current login for good.
    if (wrap.login.toLowerCase() !== login.toLowerCase()) {
      if (response) response.status = 301;
      const moved = state.url.replace(/^\/@[^/?#]+/, `/@${wrap.login}`);
      return new RedirectCommand(router.parseUrl(moved), { replaceUrl: true });
    }
    await locale.showWrap(wrap.locale);
    return { kind: 'wrap', wrap };
  } catch (error) {
    const { code } = ApiError.from(error);
    const kind =
      code === 'WRAP_DELETED' ? 'gone' : code === 'WRAP_NOT_FOUND' ? 'missing' : 'failed';
    if (response) response.status = STATUS[kind];
    return { kind, login, year };
  }
};
