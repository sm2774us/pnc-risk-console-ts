// Installs repo-local git hooks (.githooks) when inside a git checkout. Safe no-op elsewhere (CI, Docker, zip export).
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

if (existsSync('.git') && process.env.CI !== 'true') {
  try {
    execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
    console.log('git hooks installed (.githooks)');
  } catch {
    /* git unavailable: ignore */
  }
}
