/** A request the api can't make sense of (unknown card style, locale, intent, year…). */
export class InvalidRequestError extends Error {
  constructor(readonly field: string) {
    super(`Invalid or missing "${field}".`);
    this.name = 'InvalidRequestError';
  }
}
