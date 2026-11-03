/** "Now", injected so the year rule and cache expiry can be tested with fixed dates. */
export type Clock = () => Date;

export const CLOCK = Symbol('CLOCK');
