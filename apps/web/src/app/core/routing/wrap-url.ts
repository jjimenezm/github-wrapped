import { UrlSegment, type UrlMatcher } from '@angular/router';

/** The screens that hang off a published wrap: `/@login/year/<suffix>`. */
export type WrapSuffix = 'share' | 'card';

const YEAR = /^\d{4}$/;

/** `/@ana-dev/2026` (the public page) or `/@ana-dev/2026/share`. */
export function wrapPath(login: string, year: number, suffix?: WrapSuffix): string {
  return `/@${login}/${year}${suffix ? `/${suffix}` : ''}`;
}

/**
 * The router can't express a `@:login` segment, so these routes use a matcher: `@login`, a
 * four-digit year and the suffix, handing `login` and `year` over as route params.
 */
export function wrapMatcher(suffix: WrapSuffix): UrlMatcher {
  return (segments) => {
    const [user, year, rest] = segments;
    if (segments.length !== 3 || !user || !year || rest?.path !== suffix) return null;
    if (!user.path.startsWith('@') || user.path.length < 2 || !YEAR.test(year.path)) return null;
    return {
      consumed: segments,
      posParams: { login: new UrlSegment(user.path.slice(1), user.parameters), year },
    };
  };
}
