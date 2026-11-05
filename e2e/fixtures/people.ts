/** A GitHub account the suite plays: `fixtures/github/<login>.json` answers for it. */
export interface Person {
  id: number;
  login: string;
}

/** Published in English by the global setup: the public page's spec. */
export const ANA: Person = { id: 4242, login: 'ana-dev' };
/** Published and deleted by the global setup; also the "other account" when signing in. */
export const BETO: Person = { id: 7777, login: 'beto' };
/** The Spanish journey: two featured projects, so two slides. */
export const SOFIA: Person = { id: 5151, login: 'sofia-dev' };
/** The English journey: nothing to feature, so the projects slide is skipped. */
export const LIAM: Person = { id: 6262, login: 'liam-codes' };
/** GitHub fails on the merged pull requests search: that metric is left out, never shown as 0. */
export const PR_FALLA: Person = { id: 6161, login: 'pr-falla' };
/** Looked up, then signed in with someone else's account: nothing may get published. */
export const NICO: Person = { id: 8383, login: 'nico-ux' };
