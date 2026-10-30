#!/usr/bin/env node
// Pre-commit check: stops a commit that adds secret files or secrets in code. Runs from
// .guardrails/git-hooks/pre-commit for everyone (developers and agents, any tool).
// gitleaks, when installed, runs after this for a much larger rule set; CI runs it on every PR.
//
// False positive? Use a placeholder (CHANGE_ME, <password>, ${VAR}) or an .env.example file.
// Never skip the hook with --no-verify.
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const SECRET_FILE = [
  /(^|\/)\.env(\.(?![\w.-]*(example|sample|template|dist))[\w.-]+)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
  /(^|\/)\.(npmrc|pypirc|netrc|pgpass)$/i,
  /(service[-_]?account|firebase-adminsdk)[\w.-]*\.json$/i,
  /(^|\/)dbhub\.toml$/i,
];

const SECRET_TEXT = [
  ['private key', /-----BEGIN ([A-Z]+ )?PRIVATE KEY-----/],
  ['AWS access key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['Stripe live key', /\b(sk|rk)_live_[A-Za-z0-9]{20,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['OpenAI key', /\bsk-(proj-)?[A-Za-z0-9_-]{40,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{40,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  // user:password@host for a host that isn't local, unless the password is a placeholder or variable
  ['database URL with password', /\b(postgres(ql)?|mysql|mariadb|mongodb(\+srv)?|redis|amqps?):\/\/[^\s:@/'"`]+:(?!\$\{|<|CHANGE_ME|password\b|pass\b|changeme|secret\b|xxx)[^\s@/'"`]+@(?!localhost\b|127\.0\.0\.1\b|0\.0\.0\.0\b|host\.docker\.internal\b|(db|postgres|mysql|mongo|mongodb|redis)[:/'"`\s])/i],
];

const files = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);
const problems = [];

for (const f of files) {
  if (SECRET_FILE.some((re) => re.test(f))) problems.push(`${f}: secret file (keep it out of git; commit an .env.example with names only)`);
}

// Only added lines, so old content doesn't block a new commit.
let file = '';
for (const line of git('diff', '--cached', '-U0', '--no-color', '--diff-filter=ACMR').split('\n')) {
  if (line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ (b\/)?/, ''); continue; }
  if (!line.startsWith('+') || /nextpak-guard: allow/.test(line)) continue;
  for (const [what, re] of SECRET_TEXT) {
    if (re.test(line)) { problems.push(`${file}: looks like ${/^[aeiou]/i.test(what) ? 'an' : 'a'} ${what}`); break; }
  }
}

if (problems.length) {
  console.error('\nCommit blocked by .guardrails/check-staged.mjs:\n');
  for (const p of [...new Set(problems)]) console.error(`  - ${p}`);
  console.error('\nRemove the secret (git restore --staged <file>), move it to your environment, and rotate it if it was ever pushed.');
  console.error('Test fixture that only looks like a secret? Add the comment "nextpak-guard: allow" on that line.\n');
  process.exit(1);
}
