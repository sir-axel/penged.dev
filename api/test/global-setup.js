import { execSync } from 'node:child_process';
import fs from 'node:fs';

// Fresh local D1 for tests: apply the real wrangler migrations into .wrangler/test-state.
export default function setup() {
  fs.rmSync('.wrangler/test-state', { recursive: true, force: true });
  execSync('npx wrangler d1 migrations apply penged --local -c wrangler.test.toml --persist-to .wrangler/test-state', { stdio: 'pipe' });
}
