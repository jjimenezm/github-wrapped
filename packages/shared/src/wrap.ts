import type { CardStyle, ImagesStatus, Locale, VideoStatus, WrapSnapshot } from './types';

/** Why a person signs in with GitHub: first publication, a card change after the session expired, or managing a wrap. */
export const OAUTH_INTENTS = ['publish', 'change-card', 'manage'] as const;
export type OAuthIntent = (typeof OAUTH_INTENTS)[number];

/** What the public page of a wrap shows (`GET /api/wraps/:login/:year`). */
export interface PublicWrap {
  login: string;
  year: number;
  locale: Locale;
  cardStyle: CardStyle;
  snapshot: WrapSnapshot;
  publishedAt: string;
  /** The last image version that finished rendering; null while the first one renders. */
  imagesReadyVersion: number | null;
  videoReadyVersion: number | null;
  videoStatus: VideoStatus;
}

/** The owner's view of the renders, for the share screen (`GET /api/wraps/:login/:year/status`). */
export interface WrapStatusView {
  imagesStatus: ImagesStatus;
  imagesVersion: number;
  imagesReadyVersion: number | null;
  videoStatus: VideoStatus;
  videoReadyVersion: number | null;
  /** Position of the current image render in the queue (1 = next), or null when not waiting. */
  queuePosition: number | null;
}
