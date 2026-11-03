import type { LanguageShare } from '@wrapped/shared';
import type { OwnRepository } from './queries';

const TOP = 3;

/**
 * Bytes per language across the person's own public repos (forks never count), as the top three
 * plus the bytes of everything else, which the slide shows as "Otros".
 */
export function summarizeLanguages(repos: OwnRepository[]): {
  languages: LanguageShare[];
  otherBytes: number;
} {
  const totals = new Map<string, LanguageShare>();
  for (const repo of repos) {
    if (repo.isFork) continue;
    for (const { size, node } of repo.languages.edges) {
      const share = totals.get(node.name) ?? { name: node.name, color: node.color, bytes: 0 };
      share.bytes += size;
      totals.set(node.name, share);
    }
  }
  const sorted = [...totals.values()].sort(
    (a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name),
  );
  return {
    languages: sorted.slice(0, TOP),
    otherBytes: sorted.slice(TOP).reduce((sum, l) => sum + l.bytes, 0),
  };
}
