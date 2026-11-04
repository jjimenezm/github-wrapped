import type { CardStyle, ImagesStatus, Locale, VideoStatus, WrapSnapshot } from './types';

/** Why a person signs in with GitHub: first publication, a card change after the session expired, or managing a wrap. */
export const OAUTH_INTENTS = ['publish', 'change-card', 'manage'] as const;
export type OAuthIntent = (typeof OAUTH_INTENTS)[number];

/** The PNGs of one images version: the 4:5 card and the 1200×630 link preview. */
export interface WrapImages {
  card: string;
  og: string;
}

/** Where the api serves the PNGs of an images version (same origin as the web). */
export function wrapImages(wrapId: string, version: number): WrapImages {
  const base = `/api/files/${wrapId}/img/${version}`;
  return { card: `${base}/card.png`, og: `${base}/og.png` };
}

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
  /** The PNGs of `imagesReadyVersion`; null until the first version is ready. */
  images: WrapImages | null;
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
  /** The PNGs of `imagesReadyVersion`, which may still be an older card while a new one renders. */
  images: WrapImages | null;
}
