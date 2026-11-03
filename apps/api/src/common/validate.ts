import {
  CARD_STYLES,
  OAUTH_INTENTS,
  SUPPORTED_LOCALES,
  type CardStyle,
  type Locale,
  type OAuthIntent,
} from '@wrapped/shared';
import { InvalidRequestError } from './invalid-request.error';

const oneOf =
  <T extends string>(allowed: readonly T[], field: string) =>
  (value: unknown): T => {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value))
      return value as T;
    throw new InvalidRequestError(field);
  };

export const cardStyleOf: (value: unknown) => CardStyle = oneOf(CARD_STYLES, 'cardStyle');
export const localeOf: (value: unknown) => Locale = oneOf(SUPPORTED_LOCALES, 'locale');
export const intentOf: (value: unknown) => OAuthIntent = oneOf(OAUTH_INTENTS, 'intent');
