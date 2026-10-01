import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { bumpFor, nextVersion, parseCommit, renderSection, upsertChangelog } from './release-lib.mjs';

const c = (subject, body = '') => parseCommit({ hash: 'h', subject, body });

test('parses conventional commits, scopes, PR numbers and breaking markers', () => {
  assert.deepEqual(c('feat(grid): add export (#12)'), {
    hash: 'h',
    type: 'feat',
    scope: 'grid',
    breaking: false,
    text: 'add export',
    pr: '12',
  });
  assert.equal(c('fix!: drop v0 api').breaking, true);
  assert.equal(c('fix: x', 'BREAKING CHANGE: y').breaking, true);
  assert.equal(c('updated stuff'), null);
  assert.equal(c('chore(release): v1.2.3 [skip ci]'), null);
});

test('bump rules', () => {
  assert.equal(bumpFor([c('docs: a'), c('chore: b')].filter(Boolean)), 'none');
  assert.equal(bumpFor([c('fix: a')]), 'patch');
  assert.equal(bumpFor([c('fix: a'), c('feat: b')]), 'minor');
  assert.equal(bumpFor([c('feat: a'), c('refactor!: b')]), 'major');
  assert.equal(nextVersion('1.4.9', 'patch'), '1.4.10');
  assert.equal(nextVersion('1.4.9', 'minor'), '1.5.0');
  assert.equal(nextVersion('1.4.9', 'major'), '2.0.0');
  assert.throws(() => nextVersion('x', 'patch'));
});

test('renders grouped sections with PR links and upserts idempotently', () => {
  const s = renderSection(
    '1.1.0',
    '2026-10-02',
    [c('feat(ui): a (#3)'), c('fix: b'), c('chore: ignored')].filter(Boolean),
    'https://github.com/o/r',
  );
  assert.match(s, /### Features\n\n- \*\*ui:\*\* a \(\[#3\]\(https:\/\/github.com\/o\/r\/pull\/3\)\)/);
  assert.match(s, /### Bug fixes\n\n- b/);
  const base = '# Changelog\n\nintro\n\n## [1.0.0] - 2026-10-01\n\nold\n';
  const once = upsertChangelog(base, '1.1.0', s);
  assert.ok(once.indexOf('## [1.1.0]') < once.indexOf('## [1.0.0]'));
  assert.equal(upsertChangelog(once, '1.1.0', s), once);
  assert.equal((upsertChangelog(once, '1.0.0', '## [1.0.0] - new\n\nx\n').match(/## \[1\.0\.0\]/g) ?? []).length, 1);
});

test('end-to-end in a scratch git repo: first release, then patch, then no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rel-'));
  const sh = (...a) =>
    execFileSync(a[0], a.slice(1), {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    }).trim();
  cpSync(resolve('tools'), join(dir, 'tools'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0] - 2026-10-01\n\nstatic\n');
  sh('git', 'init', '-q', '-b', 'main');
  sh('git', 'add', '.');
  sh('git', 'commit', '-qm', 'feat: first (#1)');
  const run = (m) => JSON.parse(sh('node', 'tools/release.mjs', m).split('\n')[0]);
  assert.deepEqual([run('plan').release, run('plan').version], ['true', '1.0.0']);
  run('apply');
  assert.ok(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8').includes('static')); // seeded first entry is kept
  assert.match(readFileSync(join(dir, 'RELEASE_NOTES.md'), 'utf8'), /static/);
  sh('git', 'commit', '-qam', 'chore(release): v1.0.0 [skip ci]');
  sh('git', 'tag', 'v1.0.0');
  assert.equal(run('plan').release, 'false');
  writeFileSync(join(dir, 'a.txt'), 'a');
  sh('git', 'add', '.');
  sh('git', 'commit', '-qm', 'fix(api): handle null (#2)');
  const p = run('plan');
  assert.deepEqual([p.release, p.version, p.bump], ['true', '1.0.1', 'patch']);
  run('apply');
  assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, '1.0.1');
  assert.match(readFileSync(join(dir, 'RELEASE_NOTES.md'), 'utf8'), /handle null/);
  assert.match(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), /## \[1\.0\.1\][\s\S]*## \[1\.0\.0\]/);
});

/** Runs the real "Commit and tag" step from release.yml in a scratch repo (regression for the first-release failure). */
function runCommitAndTagStep(dir, version) {
  const wf = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');
  const block = /- name: Commit and tag\n\s+run: \|\n((?:\s{10}.*\n)+)/.exec(wf)?.[1];
  assert.ok(block, 'Commit and tag step not found in release.yml');
  const script = block
    .split('\n')
    .map((l) => l.slice(10))
    .join('\n');
  return execFileSync('bash', ['-e', '-c', script], { cwd: dir, encoding: 'utf8', env: { ...process.env, VERSION: version } });
}

test('release.yml commit-and-tag step: first release (no file changes) tags HEAD, later release commits then tags', () => {
  const dir = mkdtempSync(join(tmpdir(), 'step-'));
  const sh = (...a) =>
    execFileSync(a[0], a.slice(1), {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    }).trim();
  cpSync(resolve('tools'), join(dir, 'tools'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2) + '\n');
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0] - 2026-10-01\n\nseed\n');
  sh('git', 'init', '-q', '-b', 'main');
  sh('git', 'add', '.');
  sh('git', 'commit', '-qm', 'feat: first');
  const head = sh('git', 'rev-parse', 'HEAD');
  sh('node', 'tools/release.mjs', 'apply');
  runCommitAndTagStep(dir, '1.0.0'); // used to exit 1: "nothing to commit"
  assert.equal(sh('git', 'rev-list', '-n1', 'v1.0.0'), head);
  assert.equal(sh('git', 'rev-parse', 'HEAD'), head);
  writeFileSync(join(dir, 'a.txt'), 'a');
  sh('git', 'add', '.');
  sh('git', 'commit', '-qm', 'fix(api): y (#2)');
  sh('node', 'tools/release.mjs', 'apply');
  runCommitAndTagStep(dir, '1.0.1');
  assert.equal(sh('git', 'log', '-1', '--format=%s'), 'chore(release): v1.0.1 [skip ci]');
  assert.equal(sh('git', 'rev-list', '-n1', 'v1.0.1'), sh('git', 'rev-parse', 'HEAD'));
});
