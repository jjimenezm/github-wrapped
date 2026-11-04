import { InjectionToken } from '@angular/core';

/**
 * Videos arrive in phase 2. Until then the share screen hides the Video action and nothing
 * promises a video; phase 2 turns this on.
 */
export const VIDEO_SHARING = new InjectionToken<boolean>('VIDEO_SHARING', {
  providedIn: 'root',
  factory: () => false,
});
