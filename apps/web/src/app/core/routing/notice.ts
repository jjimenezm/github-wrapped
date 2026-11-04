/**
 * What the entry screen says after the share screen deleted a wrap. It travels as router state,
 * not in the URL, so a reload or a shared link never repeats it.
 */
export interface DeletedNotice {
  notice: 'deleted';
  year: number;
}

/** The deleted year when the navigation carried a {@link DeletedNotice}. */
export function deletedYear(state: unknown): number | null {
  const notice = state as Partial<DeletedNotice> | null | undefined;
  return notice?.notice === 'deleted' && typeof notice.year === 'number' ? notice.year : null;
}
