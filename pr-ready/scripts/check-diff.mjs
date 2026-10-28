#!/usr/bin/env node
// pr-ready diff checker. Dependency-free, works on Windows, macOS and Linux (Node 18+).
//
// Usage:
//   node scripts/check-diff.mjs                 # branch diff vs auto-detected target (origin/main, origin/develop, ...)
//   node scripts/check-diff.mjs --base develop  # branch diff vs a given target branch
//   node scripts/check-diff.mjs --staged        # only what is staged (git add) right now
//   node scripts/check-diff.mjs --max-lines 600 # change the "large diff" warning limit (default 400)
//
// Exit code: 0 = no errors (warnings allowed), 1 = errors found, 2 = could not run.
// To allow one reviewed line, add the marker "pr-ready-ignore" in a comment on that line.
// Binary files are listed, not scanned. Generated/vendored paths (dist/, build/, *.min.js, snapshots...)
// are scanned for secrets only. Whole-file line-ending or whitespace churn is reported as a warning.
// Secret patterns are adapted from gitleaks (https://github.com/gitleaks/gitleaks, MIT).

import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const staged = args.includes('--staged');
const maxLines = Number(opt('--max-lines') ?? 400);

function git(gitArgs, { allowFail = false } = {}) {
  try {
    // quotepath=false: non-ASCII paths come out as-is instead of "caf\303\251.js".
    return execFileSync('git', ['-c', 'core.quotepath=false', ...gitArgs], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (allowFail) return null;
    console.error(`git ${gitArgs.join(' ')} failed:\n${err.stderr || err.message}`);
    process.exit(2);
  }
}

function resolveBase() {
  const given = opt('--base');
  const candidates = given ? [given, `origin/${given}`] : [];
  if (!given) {
    const head = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { allowFail: true });
    if (head) candidates.push(head.trim().replace('refs/remotes/', ''));
    candidates.push('origin/main', 'origin/develop', 'origin/master', 'main', 'develop', 'master');
  }
  for (const ref of candidates) {
    if (git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFail: true })) return ref;
  }
  console.error(given ? `Base "${given}" not found. Run git fetch first.` : 'No target branch found. Pass --base <branch>.');
  process.exit(2);
}

const base = staged ? null : resolveBase();
const range = staged ? ['--cached'] : [`${base}...HEAD`];

// ---- rules ---------------------------------------------------------------
const SECRET_RULES = [
  ['AWS access key id', /\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9a-zA-Z]{36}\b|\bgithub_pat_\w{82}\b/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{10,}/],
  ['Stripe key', /\b(?:sk|rk)_(?:test|live|prod)_[a-zA-Z0-9]{10,99}\b/],
  ['Anthropic API key', /\bsk-ant-(?:api|admin)\d{2}-[a-zA-Z0-9_-]{20,}/],
  ['OpenAI API key', /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/],
  ['Google API key', /\bAIza[\w-]{35}\b/],
  ['Private key', /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----/],
  ['JWT', /\bey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9/\\_-]{17,}\.[a-zA-Z0-9/\\_-]{10,}/],
  ['Credentials in URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"]+:[^\s:/@'"]{3,}@[^\s'"]+/i],
  ['Hardcoded secret assignment',
    /(?:api[_-]?key|secret|token|passw(?:or)?d|client[_-]?secret|access[_-]?key)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i],
];
const PLACEHOLDER = /(?:example|placeholder|changeme|your[_-]|xxxx|<[^>]+>|\$\{|process\.env|os\.environ|getenv)/i;

const DEBUG_RULES = [
  { name: 'console.log/debug', re: /\bconsole\.(?:log|debug|trace|dir)\s*\(/, exts: /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/ },
  { name: 'debugger statement', re: /^\s*debugger\s*;?\s*$/, exts: /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/ },
  { name: 'print()', re: /^\s*print\s*\(/, exts: /\.py$/ },
  { name: 'Python breakpoint', re: /\b(?:breakpoint\s*\(\s*\)|pdb\.set_trace\s*\(|ipdb\.set_trace\s*\()/, exts: /\.py$/ },
  { name: 'var_dump/dd()', re: /\b(?:var_dump|print_r|dd|dump)\s*\(/, exts: /\.php$/ },
  { name: 'fmt.Println debug', re: /\bfmt\.Print(?:ln|f)?\s*\(/, exts: /\.go$/ },
];

const ENV_FILE = /^\.env(?:\..+)?$/i;
const ENV_ALLOWED = /\.(?:example|sample|template|dist)$/i;
const KEY_FILE = /(?:^id_(?:rsa|dsa|ecdsa|ed25519)$|\.(?:pem|key|p12|pfx|jks|keystore)$|^credentials\.json$|service-account.*\.json$)/i;
const TEMP_FILE = /(?:\.(?:orig|rej|bak|tmp|swp|swo)$|~$|^\.DS_Store$|^Thumbs\.db$|^npm-debug\.log|\.log$)/i;
const LOCK_FILE = /(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Pipfile\.lock|composer\.lock|Cargo\.lock|go\.sum)$/;
// Generated/vendored output: still scanned for secrets, but not for debug code, TODOs or diff size.
const GENERATED = /(?:^|\/)(?:dist|build|out|coverage|vendor|node_modules|\.next|__snapshots__|__generated__|generated)\/|\.min\.(?:js|css)$|\.map$|\.snap$|\.(?:pb|g|gen|generated)\.\w+$|_pb2(?:_grpc)?\.py$/;
const TODO = /\b(?:TODO|FIXME|XXX|HACK)\b/;
const TICKET = /(?:[A-Z][A-Z0-9]+-\d+|#\d+|https?:\/\/)/;
const COMMENTED_CODE = /^\s*(?:\/\/|#)\s*(?:(?:const|let|var)\s+\w+\s*=|function\s*\w*\s*\(|return\b.*;\s*$|(?:if|for|while)\s*\(.*\)\s*\{?\s*$|import\s.+\sfrom\s|export\s+(?:const|function|default)\b|await\s+\w+\(|console\.|def\s+\w+\(|class\s+\w+[:({]|print\(|\w+\s*\(.*\)\s*;?\s*$|\w+(?:\.\w+)*\s*=\s*.+;\s*$|\w+\s*=\s*[\w.]+\(.*\)\s*;?\s*$)/;

// ---- collect -------------------------------------------------------------
const errors = [];
const warnings = [];
const info = [];
const redact = (s) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}****${s.slice(-2)}`);

// -z output: NUL-separated, never quoted, safe for spaces, non-ASCII and renames.
const nameStatus = git(['diff', '--name-status', '-z', '-M', ...range]).split('\0').filter(Boolean);
for (let i = 0; i < nameStatus.length; ) {
  const status = nameStatus[i++];
  const isMove = /^[RC]/.test(status);
  const from = isMove ? nameStatus[i++] : null;
  const file = nameStatus[i++];
  const baseName = path.posix.basename(file);
  if (status.startsWith('D')) {
    info.push(`Deleted file: ${file} (is this deletion in the ticket's scope?)`);
    continue;
  }
  if (status.startsWith('R')) info.push(`Renamed: ${from} -> ${file} (is this move in the ticket's scope?)`);
  if (ENV_FILE.test(baseName) && !ENV_ALLOWED.test(baseName)) errors.push(`${file}: .env file is committed. Remove it (git rm --cached) and add it to .gitignore.`);
  if (KEY_FILE.test(baseName)) errors.push(`${file}: looks like a key or credentials file. Do not commit it.`);
  if (TEMP_FILE.test(baseName)) errors.push(`${file}: temp/backup/log file. Delete it.`);
}

// numstat -z: "add\tdel\tpath\0", or "add\tdel\t\0old\0new\0" for a rename. Binary = "-\t-".
function numstat(extra = []) {
  const out = new Map();
  const parts = git(['diff', '--numstat', '-z', '-M', ...extra, ...range]).split('\0');
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    const [add, del, p] = parts[i].split('\t');
    const file = p === '' ? (i += 2, parts[i]) : p;
    out.set(file, add === '-' ? null : Number(add) + Number(del));
  }
  return out;
}
const stats = numstat();
const statsNoCr = numstat(['--ignore-cr-at-eol']);
const statsNoWs = numstat(['-w']);
let totalChanged = 0;
const fileCount = stats.size;
const generated = [];
for (const [file, n] of stats) {
  if (n === null) { info.push(`Binary file: ${file} (not scanned; is it meant to be committed?)`); continue; }
  if (GENERATED.test(file)) { generated.push(file); continue; }
  if (LOCK_FILE.test(file)) continue;
  totalChanged += n;
  // Most of the file "changed" but not once CRLF/whitespace is ignored = editor or formatter noise.
  // (git omits a file from the -w / --ignore-cr-at-eol numstat when nothing else changed, hence ?? 0.)
  if (n >= 10 && (statsNoCr.get(file) ?? 0) * 2 < n) {
    warnings.push(`${file}: ${n} lines changed, mostly line endings (CRLF/LF). Restore them; add a .gitattributes rule if it keeps happening.`);
  } else if (n >= 10 && (statsNoWs.get(file) ?? 0) * 2 < n) {
    warnings.push(`${file}: ${n} lines changed, mostly whitespace/formatting. Revert the reformat unless the ticket needs it.`);
  }
}
if (generated.length) info.push(`Generated/vendored files (secrets scan only, not counted): ${generated.join(', ')}. Should they be committed at all?`);

// Fixed prefixes so user config (diff.noprefix, diff.mnemonicPrefix) can't change the headers we parse.
const diff = git(['diff', '-U0', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '-M', ...range]);
let current = null;
let lineNo = 0;
let inHeader = false; // between "diff --git" and the first "@@"; an added line "++ x" is not a header
for (const rawLine of diff.split('\n')) {
  const raw = rawLine.replace(/\r$/, '');
  if (raw.startsWith('diff --git ')) { inHeader = true; current = null; continue; }
  if (inHeader && raw.startsWith('+++ ')) {
    current = raw === '+++ /dev/null' ? null : raw.replace(/^\+\+\+ b\//, '').replace(/\t$/, '');
    continue;
  }
  const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunk) { inHeader = false; lineNo = Number(hunk[1]); continue; }
  if (inHeader) continue;
  if (!current || !raw.startsWith('+')) continue;
  const text = raw.slice(1);
  const where = `${current}:${lineNo}`;
  lineNo++;
  if (text.includes('pr-ready-ignore')) continue;

  for (const [name, re] of SECRET_RULES) {
    const m = text.match(re);
    if (m && !(name === 'Hardcoded secret assignment' && PLACEHOLDER.test(m[0]))) {
      errors.push(`${where}: possible ${name}: ${redact(m[0])}`);
      break;
    }
  }
  if (GENERATED.test(current)) continue;
  const isTest = /(?:^|\/)(?:tests?|__tests__|spec)\/|\.(?:test|spec)\.\w+$|_test\.\w+$/.test(current);
  for (const rule of DEBUG_RULES) {
    if (rule.exts.test(current) && rule.re.test(text)) {
      (isTest || rule.name === 'fmt.Println debug' ? warnings : errors).push(`${where}: ${rule.name} left in code`);
    }
  }
  if (TODO.test(text) && !TICKET.test(text)) warnings.push(`${where}: TODO/FIXME without a ticket reference`);
  if (COMMENTED_CODE.test(text)) warnings.push(`${where}: looks like commented-out code`);
}

if (totalChanged > maxLines) {
  warnings.push(`Large diff: ${totalChanged} lines changed in ${fileCount} files (limit ${maxLines}, lock files excluded). Consider splitting the PR.`);
}

// ---- report --------------------------------------------------------------
const scope = staged ? 'staged changes' : `${base}...HEAD`;
console.log(`pr-ready check-diff: ${scope} | ${fileCount} files, ${totalChanged} lines changed`);
for (const m of info) console.log(`INFO   ${m}`);
for (const m of warnings) console.log(`WARN   ${m}`);
for (const m of errors) console.log(`ERROR  ${m}`);
console.log(errors.length ? `\nFAIL: ${errors.length} error(s), ${warnings.length} warning(s).` : `\nPASS: 0 errors, ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
