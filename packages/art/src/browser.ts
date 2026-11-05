/**
 * Entry of the browser bundle (`build/art.iife.js`, global `WrappedArt`) that the video
 * composition loads as a plain script: the same art the web and the PNGs draw, plus the shared
 * formatting it needs, so every copy of a number or a date reads the same everywhere.
 */
export * from './index';
export {
  formatNumber,
  periodChip,
  periodLabel,
  previousYearPeriod,
  publicWrapUrl,
  yearOverYear,
} from '@wrapped/shared';
