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

/** This project's folder in the media bucket, which may hold other things too. */
export const VIDEO_OBJECT_ROOT = 'wrapped/';

/** A wrap's folder in the media bucket. */
export const videoObjectPrefix = (wrapId: string) => `${VIDEO_OBJECT_ROOT}${wrapId}/`;

/** The video of a data version in the media bucket. */
export const videoObjectKey = (wrapId: string, version: number) =>
  `${videoObjectPrefix(wrapId)}${version}.mp4`;

/**
 * Where the MP4 of a data version plays from: the api's files route (same origin), or the media
 * origin when videos live in object storage (`PUBLIC_MEDIA_URL`, without a trailing slash).
 */
export function wrapVideo(wrapId: string, version: number, mediaBaseUrl: string | null = null) {
  return mediaBaseUrl
    ? `${mediaBaseUrl}/${videoObjectKey(wrapId, version)}`
    : `/api/files/${wrapId}/video/${version}.mp4`;
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
  /** The MP4 of `videoReadyVersion`; null until the first video is ready. */
  video: string | null;
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
  /** Position of the current video render in the queue (1 = next), or null when not waiting. */
  videoQueuePosition: number | null;
  /** The MP4 of `videoReadyVersion`, which may be an older one while the data's new video renders. */
  video: string | null;
}
