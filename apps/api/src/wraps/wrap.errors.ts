export class WrapNotFoundError extends Error {
  constructor() {
    super('There is no wrap for that login and year.');
    this.name = 'WrapNotFoundError';
  }
}

export class WrapDeletedError extends Error {
  constructor() {
    super('This wrap was deleted by its owner.');
    this.name = 'WrapDeletedError';
  }
}

export class NotOwnerError extends Error {
  constructor() {
    super('Only the GitHub account the wrap belongs to can do this.');
    this.name = 'NotOwnerError';
  }
}

export class YearFrozenError extends Error {
  constructor(readonly year: number) {
    super(`${year} closed on January 31; its wrap can no longer be regenerated.`);
    this.name = 'YearFrozenError';
  }
}

export class RegenerateTooSoonError extends Error {
  constructor(readonly retryAt: Date) {
    super(`A wrap can be regenerated once a day; next time: ${retryAt.toISOString()}.`);
    this.name = 'RegenerateTooSoonError';
  }
}

export class ImagesNotFailedError extends Error {
  constructor() {
    super('Only failed images can be retried.');
    this.name = 'ImagesNotFailedError';
  }
}

export class VideoNotFailedError extends Error {
  constructor() {
    super('Only a failed video can be retried.');
    this.name = 'VideoNotFailedError';
  }
}

/** Repository: the person already has a wrap for that year. */
export class WrapExistsError extends Error {
  constructor() {
    super('A wrap for that person and year already exists.');
    this.name = 'WrapExistsError';
  }
}

/** Repository: someone changed the wrap between reading and writing it. */
export class ConcurrentUpdateError extends Error {
  constructor() {
    super('The wrap changed in the meantime.');
    this.name = 'ConcurrentUpdateError';
  }
}
