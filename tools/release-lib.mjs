// Pure release logic (no I/O) so it can be unit-tested. SemVer + Conventional Commits.
export const SECTIONS = [
  ['breaking', 'Breaking changes'],
  ['feat', 'Features'],
  ['fix', 'Bug fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['docs', 'Documentation'],
  ['build', 'Build and CI'],
  ['ci', 'Build and CI'],
  ['test', 'Tests'],
];
const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<subject>.+)$/;

/** Parses one squash-commit message (subject + body). Returns null for non-conventional or release commits. */
export function parseCommit({ hash, subject, body = '' }) {
  const m = HEADER.exec(subject.trim());
  if (!m?.groups) return null;
  const { type, scope, bang, subject: text } = m.groups;
  if (type === 'chore' && scope === 'release') return null;
  const breaking = Boolean(bang) || /^BREAKING[ -]CHANGE:/m.test(body);
  return {
    hash,
    type,
    scope: scope ?? '',
    breaking,
    text: text.replace(/ \(#\d+\)$/, ''),
    pr: /\(#(\d+)\)$/.exec(subject.trim())?.[1] ?? '',
  };
}

/** none | patch | minor | major. Pre-1.0 is not special-cased: this project is already 1.x. */
export function bumpFor(commits) {
  if (commits.some((c) => c.breaking)) return 'major';
  if (commits.some((c) => c.type === 'feat')) return 'minor';
  if (commits.some((c) => c.type === 'fix' || c.type === 'perf')) return 'patch';
  return 'none';
}

export function nextVersion(current, bump) {
  const [maj, min, pat] = current.split('.').map(Number);
  if (![maj, min, pat].every(Number.isInteger)) throw new Error(`Not a SemVer version: ${current}`);
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  if (bump === 'patch') return `${maj}.${min}.${pat + 1}`;
  return current;
}

export function renderSection(version, date, commits, repoUrl = '') {
  const groups = new Map();
  for (const c of commits) {
    const key = c.breaking ? 'breaking' : c.type;
    const title = SECTIONS.find(([k]) => k === key)?.[1];
    if (!title) continue;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(c);
  }
  const out = [`## [${version}] - ${date}`, ''];
  for (const [, title] of SECTIONS) {
    const list = groups.get(title);
    if (!list) continue;
    groups.delete(title);
    out.push(`### ${title}`, '');
    for (const c of list) {
      const link = c.pr && repoUrl ? ` ([#${c.pr}](${repoUrl}/pull/${c.pr}))` : '';
      out.push(`- ${c.scope ? `**${c.scope}:** ` : ''}${c.text}${link}`);
    }
    out.push('');
  }
  if (out.length === 2) out.push('No user-facing changes.', '');
  return out.join('\n');
}

/** Inserts (or replaces, if the same version already exists) a section under the changelog preamble. */
export function upsertChangelog(existing, version, section) {
  const lines = existing.split('\n');
  const first = lines.findIndex((l) => l.startsWith('## ['));
  const head = (first === -1 ? lines.join('\n').trimEnd() : lines.slice(0, first).join('\n').trimEnd()) + '\n\n';
  let rest = first === -1 ? [] : lines.slice(first);
  const own = rest.findIndex((l) => l.startsWith(`## [${version}]`));
  if (own !== -1) {
    const end = rest.findIndex((l, i) => i > own && l.startsWith('## ['));
    rest = [...rest.slice(0, own), ...(end === -1 ? [] : rest.slice(end))];
  }
  return `${head}${section}\n${rest.join('\n')}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Returns the body of the `## [version]` section (without its heading), or '' when absent. */
export function extractSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start === -1) return '';
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
  return (
    lines
      .slice(start + 1, end === -1 ? undefined : end)
      .join('\n')
      .trim() + '\n'
  );
}
