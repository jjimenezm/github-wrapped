/**
 * The period a wrap covers (R12). Dates are `YYYY-MM-DD` in UTC, the format the GitHub API takes.
 */
export interface WrapPeriod {
  year: number;
  from: string;
  to: string;
  /** True when the period is the whole calendar year (wraps generated in January). */
  complete: boolean;
}

export interface DateRange {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;
const lastDayOfMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * February to December: the current year up to today.
 * January: the whole previous year, when a yearly recap is shared the most.
 */
export function resolveWrapPeriod(now: Date): WrapPeriod {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  if (month === 0) {
    const previous = year - 1;
    return {
      year: previous,
      from: isoDate(previous, 0, 1),
      to: isoDate(previous, 11, 31),
      complete: true,
    };
  }

  return {
    year,
    from: isoDate(year, 0, 1),
    to: isoDate(year, month, now.getUTCDate()),
    complete: false,
  };
}

/** The same span one year earlier, for the year-over-year comparison. */
export function previousYearPeriod(period: WrapPeriod): DateRange {
  const year = period.year - 1;
  const [, month = '1', day = '1'] = period.to.split('-');
  const monthIndex = Number(month) - 1;

  return {
    from: isoDate(year, 0, 1),
    to: isoDate(year, monthIndex, Math.min(Number(day), lastDayOfMonth(year, monthIndex))),
  };
}

/** A year's wrap can be regenerated until January 31st of the next year (UTC), then it freezes. */
export function isRegenerable(year: number, now: Date): boolean {
  return now.getTime() < Date.UTC(year + 1, 1, 1);
}
