#!/usr/bin/env node
// Usage: node tools/release.mjs plan|apply   (run from the repo root, with full git history)
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { bumpFor, extractSection, nextVersion, parseCommit, renderSection, upsertChangelog } from './release-lib.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const mode = process.argv[2];
if (!['plan', 'apply'].includes(mode)) {
  console.error('usage: release.mjs plan|apply');
  process.exit(2);
}

const pkgPath = 'package.json';
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const lastTag = git('tag', '--list', 'v[0-9]*', '--sort=-v:refname').split('\n').filter(Boolean)[0] ?? '';
const range = lastTag ? [`${lastTag}..HEAD`] : ['HEAD'];
const SEP = '\u001e',
  FIELD = '\u001f';
const raw = git('log', ...range, `--format=%H${FIELD}%s${FIELD}%b${SEP}`);
const commits = raw
  .split(SEP)
  .map((r) => r.trim())
  .filter(Boolean)
  .map((r) => {
    const [hash, subject, body] = r.split(FIELD);
    return parseCommit({ hash, subject, body });
  })
  .filter(Boolean);

let version, bump, release;
if (!lastTag) {
  // first release: ship what package.json declares
  version = pkg.version;
  bump = 'initial';
  release = commits.length > 0;
} else {
  bump = bumpFor(commits);
  version = nextVersion(lastTag.slice(1), bump);
  release = bump !== 'none';
}
const repoUrl =
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}` : '';
const date = new Date().toISOString().slice(0, 10);
const section = renderSection(version, date, commits, repoUrl);

const out = { release: String(release), version, bump, count: String(commits.length), lastTag };
console.log(JSON.stringify(out));
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(out)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
  );

if (mode === 'plan') {
  const summary = `### Release plan\n\n- Last tag: \`${lastTag || 'none (first release)'}\`\n- Bump: **${bump}** → **v${version}**\n- Releasable commits: ${commits.length}\n\n${section}`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
} else {
  if (!release) {
    console.error('Nothing to release');
    process.exit(1);
  }
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const seeded = bump === 'initial' ? extractSection(changelog, version) : '';
  if (seeded) {
    // First release: keep the hand-written seed entry for this exact version.
    writeFileSync('RELEASE_NOTES.md', seeded);
  } else {
    writeFileSync('CHANGELOG.md', upsertChangelog(changelog, version, section));
    writeFileSync('RELEASE_NOTES.md', section.split('\n').slice(2).join('\n'));
  }
}
