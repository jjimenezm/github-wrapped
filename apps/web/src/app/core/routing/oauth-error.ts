import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

/** `/` with `?oauth_error=`: where the api sends a sign-in back when it didn't publish. */
export const hasOAuthError: CanMatchFn = () =>
  inject(Router).currentNavigation()?.extractedUrl.queryParamMap.has('oauth_error') ?? false;
