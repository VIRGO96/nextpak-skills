#!/usr/bin/env node
// Agent guard: a PreToolUse hook for Claude Code, Codex and Antigravity (one script for all three).
// Reads the proposed tool call on stdin and blocks the high-risk ones before they run:
// production targets, deploys and publishing, force-push, skipping git hooks, destructive SQL and
// database resets, wide deletes, piping downloads into a shell, reading secret files, dumping env
// vars, and agents editing their own guardrails. Everything else goes to the tool's normal
// permission prompts. This is a guardrail, not a sandbox: git hooks and CI are the final check.
//
// Installed by nextpak-skills (tools/guardrails.mjs). Change the rules there, not in a project.
// Try it: echo '{"tool_name":"Bash","tool_input":{"command":"git push -f"}}' | node .guardrails/agent-guard.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- rules ----------

// "prod" / "production" as its own word part: matches app-prod, prod_db, .env.production;
// not product, produce.
const PROD = '(?<![a-z])prod(uction)?(?![a-z])';

// Secret files: never read or written by an agent. Example/template env files are fine.
const SECRET_FILE = [
  /(^|[\\/])\.env(\.(?![\w.-]*(example|sample|template|dist))[\w.-]+)?$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|[\\/])\.(npmrc|pypirc|netrc|pgpass)$/i,
  /(^|[\\/])\.ssh([\\/]|$)/i,
  /(^|[\\/])\.aws[\\/]credentials$/i,
  /(^|[\\/])\.docker[\\/]config\.json$/i,
  /(service[-_]?account|firebase-adminsdk)[\w.-]*\.json$/i,
  /(^|[\\/])dbhub\.toml$/i,
];

// Guardrail and agent config: agents may read these, but only a person changes them.
const GUARD_FILE = [
  /(^|[\\/])\.guardrails([\\/]|$)/i,
  /(^|[\\/])\.nextpak([\\/]|$)/i,
  /(^|[\\/])\.claude[\\/]settings(\.local)?\.json$/i,
  /(^|[\\/])\.codex[\\/](config\.toml|hooks\.json|rules([\\/]|$))/i,
  /(^|[\\/])\.agents[\\/](hooks\.json|mcp_config\.json)$/i,
  /(^|[\\/])\.mcp\.json$/i,
  /(^|[\\/])\.git[\\/](hooks([\\/]|$)|config$)/i,
];

const R = {
  prod: 'Production is off limits for agents (AGENTS.md "Production and data safety"). Explain what is needed and let the developer run it through the release process.',
  deploy: 'Deploys, publishing, merges and repo settings are done by a person (release-checklist). Tell the developer the exact command instead of running it.',
  force: 'Force-push rewrites shared history. Ask the developer; if it is really needed they run it themselves.',
  noVerify: 'Git hooks run the team\'s secret and lint checks; skipping or changing them is not allowed. Fix what the hook reports instead.',
  sql: 'Destructive database command. Schema and data changes go through a migration file in a PR; never ad-hoc DROP, TRUNCATE or DELETE without WHERE.',
  reset: 'This resets or overwrites a database. Ask the developer; on shared or production databases it is never allowed.',
  rm: 'Deleting a whole directory tree like this is too risky. Delete specific paths, or ask the developer.',
  pipe: 'Piping a download straight into a shell runs unreviewed code. Download it, read it, then run it with the developer\'s OK.',
  secret: 'Secret file. Agents never read, print or commit secrets (AGENTS.md "Secrets stay secret"). Use .env.example for variable names, or ask the developer.',
  env: 'Dumping environment variables would put secrets into the chat. Check one variable instead, e.g. test -n "$VAR" && echo set.',
  guard: 'Agents don\'t change their own guardrails or agent config. Ask the developer; changes to these files are reviewed in a PR.',
};

// Rules on the whole command line (SQL is usually inside quotes: psql -c "...").
const LINE_RULES = [
  { why: R.prod, re: [
    new RegExp(`\\.env\\.${PROD}`, 'i'),
    new RegExp(`\\b(NODE_ENV|APP_ENV|ENV|RAILS_ENV|FLASK_ENV|ENVIRONMENT|STAGE)=["']?${PROD}`, 'i'),
    new RegExp(`--(env|environment|stage|context|profile|project|target)[= ]["']?[\\w.-]*${PROD}`, 'i'),
    new RegExp(`\\b(DATABASE_URL|DB_URL|DB_HOST|MONGO\\w*|POSTGRES\\w*|PG\\w*|MYSQL\\w*|REDIS_URL)=["']?\\S*${PROD}`, 'i'),
    new RegExp(`:\\/\\/[^\\s'"/]*${PROD}[^\\s'"/]*\\.[a-z]`, 'i'),
  ] },
  { why: R.sql, re: [
    /\bdrop\s+(database|schema|table|collection|index|user|role)\b/i,
    /\btruncate\s+(table\s+)?["'`]?\w/i,
    /\bdelete\s+from\s+[\w."`]+\s*(;|["']|$)/i,
    /\balter\s+table\b.*\bdrop\b/i,
    /\.(dropDatabase|dropCollection)\s*\(/,
    /\.(deleteMany|remove)\s*\(\s*\{\s*\}\s*\)/,
    /\b(FLUSHALL|FLUSHDB)\b/,
  ] },
  { why: R.pipe, re: [/\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|iex|Invoke-Expression|python3?|node)\b/i] },
  { why: R.env, re: [/\bGet-ChildItem\s+env:/i, /\b(gci|ls|dir)\s+env:/i, /\$env:\w*(KEY|TOKEN|SECRET|PASSWORD)/i] },
];

// Rules on each simple command (split on ; && || |), with quoted strings blanked out so a
// commit message like "fix -f flag" doesn't count as a flag.
const SEGMENT_RULES = [
  { why: R.deploy, re: [
    /^(npx\s+)?vercel\b.*(--prod\b|\b(promote|rollback|remove|rm)\b|\b(env|domains|dns|certs|alias)\s+(add|rm|remove|pull|set)\b)/i,
    /^(npx\s+)?(firebase|netlify|fly|flyctl|railway|heroku|wrangler)\b.*\bdeploy\b/i,
    /^terraform\s+(apply|destroy|import|state\s+rm)\b/i,
    /^kubectl\b.*\b(delete|drain|cordon)\b/i,
    /^(npm|pnpm|yarn|bun)\s+(publish|npm\s+publish)\b/i,
    /^(twine\s+upload|poetry\s+publish|uv\s+publish)\b/i,
    /^gh\s+(pr\s+merge|release\s+create|repo\s+(delete|edit|archive|rename)|secret\s+(set|delete|remove)|variable\s+(set|delete)|api\b.*-X\s*(DELETE|PUT|PATCH))\b/i,
    /^git\s+push\b.*\s(--delete|--mirror|-d)\b/i,
    /^git\s+push\b.*\s:\S/i,
  ] },
  { why: R.force, test: (s) => /^git\s+push\b/i.test(s) &&
      (/\s--force(-with-lease|-if-includes)?\b/.test(s) || /\s-[a-zA-Z]*f/.test(s) || /\s\+\S/.test(s)) },
  { why: R.noVerify, test: (s) => /^git\b/i.test(s) &&
      (/\s--no-verify\b/.test(s) || (/^git\s+commit\b/i.test(s) && /\s-[a-zA-Z]*n/.test(s))) },
  { why: R.noVerify, re: [/^git\s+config\b.*\b(core\.hooksPath|hooks\.)/i, /^(HUSKY=0|SKIP=\S*)\s/i] },
  { why: R.reset, re: [
    /^(npx\s+)?prisma\s+(migrate\s+reset|db\s+push\b.*--(force-reset|accept-data-loss))/i,
    /^(npx\s+)?supabase\s+db\s+(push|reset\s+--linked)\b/i,
    /^alembic\s+downgrade\b/i,
    /\b(sequelize|knex|typeorm)\b.*\b(db:drop|migrate:undo:all|schema:drop)\b/i,
    /^(npx\s+)?firebase\b.*\bfirestore:delete\b/i,
    /^mongorestore\b.*--drop\b/i,
  ] },
  { why: R.rm, test: (s) => {
      const m = s.match(/^(sudo\s+)?rm\s+((?:-[a-zA-Z-]+\s+)+)(.+)$/);
      if (!m || !/r/i.test(m[2]) || !/f|-force/.test(m[2])) return false;
      return m[3].split(/\s+/).some((t) => /^(\/|\/\*|~\/?|\$HOME\/?|\*|\.\/?|\.\.\/?|\.\/\*|\.git\/?|[A-Za-z]:\\?\*?)$/.test(t));
    } },
  { why: R.rm, re: [/^(Remove-Item|rm|del|rd|rmdir)\b.*(-Recurse|\/s)\b.*\s(\/|~|\.|\.\.|\*|[A-Za-z]:\\?)(\s|$)/i] },
  { why: R.env, re: [/^(printenv|env|set|export\s+-p|export)$/i] },
];

// ---------- checks ----------

const blankQuotes = (c) => c.replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""');
const segments = (c) => blankQuotes(c).split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);
const words = (c) => c.split(/[\s"'`=<>|;&()]+/).filter(Boolean);
const WRITE_CMD = /(^|\s)(>>?|tee|sed\s+-i|perl\s+-\w*i|rm|mv|cp|chmod|truncate|ln|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item)(\s|$)/i;

function checkCommand(cmd) {
  const gitOnly = segments(cmd).every((s) => /^git\s/i.test(s)); // commit messages may say "delete from ..."
  for (const r of LINE_RULES) {
    if (r.why === R.sql && gitOnly) continue;
    if (r.re.some((re) => re.test(cmd))) return r.why;
  }
  for (const seg of segments(cmd)) {
    for (const r of SEGMENT_RULES) {
      if (r.test ? r.test(seg) : r.re.some((re) => re.test(seg))) return r.why;
    }
  }
  if (words(cmd).some((w) => SECRET_FILE.some((re) => re.test(w)))) return R.secret;
  const noFdRedirects = blankQuotes(cmd).replace(/\d?>&\d/g, '');
  if (WRITE_CMD.test(noFdRedirects.replace(/>/g, ' > ')) && words(cmd).some((w) => GUARD_FILE.some((re) => re.test(w)))) return R.guard;
  return null;
}

function checkPath(p, write) {
  if (!p || typeof p !== 'string') return null;
  if (SECRET_FILE.some((re) => re.test(p))) return R.secret;
  if (write && GUARD_FILE.some((re) => re.test(p))) return R.guard;
  return null;
}

// File paths named in a Codex apply_patch body.
const patchPaths = (body) => [...String(body).matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)]
  .map((m) => m[1].trim());

const asText = (v) => (Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : '');

// Normalize the input formats to { format, command, reads, writes }.
function describe(input) {
  if (input.toolCall) { // Antigravity: { toolCall: { name, args } }, answers with { decision }
    // Tool and argument names change between versions (docs: view_file/TargetFile; IDE 2.6:
    // read_file/write_file/edit_file), so check every short one-line string argument as a path.
    const name = String(input.toolCall.name ?? '');
    const args = input.toolCall.args ?? {};
    const command = asText(args.CommandLine ?? args.commandLine ?? args.command ?? args.Command ?? args.cmd);
    if (/command|shell|terminal|exec/i.test(name) || command) {
      return { format: 'antigravity', command: command || Object.values(args).filter((v) => typeof v === 'string').join(' ') };
    }
    const paths = Object.values(args).filter((v) => typeof v === 'string' && v.length < 500 && !v.includes('\n'));
    if (/write|replace|edit|delete|move|create|rename/i.test(name)) return { format: 'antigravity', writes: paths };
    return { format: 'antigravity', reads: paths };
  }
  // Claude Code and Codex: { tool_name, tool_input }, answer with hookSpecificOutput
  const name = String(input.tool_name ?? '');
  const ti = input.tool_input ?? {};
  const text = asText(ti.command ?? ti.cmd);
  if (text.includes('*** Begin Patch')) return { format: 'standard', writes: patchPaths(text) };
  if (/^(Bash|shell|exec_command|local_shell)$/.test(name)) return { format: 'standard', command: text };
  const paths = [ti.file_path, ti.path, ti.notebook_path].filter((p) => typeof p === 'string');
  if (/^(Write|Edit|MultiEdit|NotebookEdit|apply_patch)$/.test(name)) return { format: 'standard', writes: paths };
  if (/^(Read|Grep|Glob|LS)$/.test(name)) return { format: 'standard', reads: paths };
  return { format: 'standard' };
}

export function decide(input) {
  const d = describe(input);
  let why = d.command ? checkCommand(d.command) : null;
  for (const p of d.writes ?? []) why ??= checkPath(p, true);
  for (const p of d.reads ?? []) why ??= checkPath(p, false);
  return { format: d.format, why };
}

export function respond({ format, why }) {
  const reason = why && `Blocked by team guardrails: ${why}`;
  if (format === 'antigravity') return JSON.stringify(why ? { decision: 'deny', reason } : { decision: 'allow' });
  if (!why) return '';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
}

// ---------- main ----------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = {};
  try {
    const raw = fs.readFileSync(0, 'utf8');
    input = JSON.parse(raw || '{}');
  } catch {
    process.stderr.write('agent-guard: could not read the tool call; nothing checked.\n');
  }
  const result = decide(input);
  if (result.why) logBlock(input, result);
  process.stdout.write(respond(result));
}

// Audit trail of blocks in .git/agent-guard.log (never committed). Only the rule and the tool are
// logged, never the command or path, so no secret can end up in the log.
function logBlock(input, { format, why }) {
  try {
    const gitDir = findGitDir([input.workspacePaths?.[0], input.cwd, process.cwd()]);
    if (!gitDir) return;
    const rule = Object.keys(R).find((k) => R[k] === why);
    const tool = input.toolCall?.name ?? input.tool_name ?? '?';
    fs.appendFileSync(path.join(gitDir, 'agent-guard.log'), `${new Date().toISOString()} blocked rule=${rule} tool=${tool} via=${format}\n`);
  } catch { /* logging is best effort */ }
}

// Hooks don't all run from the project root (Antigravity runs them from .agents/), so walk up.
function findGitDir(starts) {
  for (const start of starts.filter(Boolean)) {
    for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
      const git = path.join(dir, '.git');
      if (fs.existsSync(git) && fs.statSync(git).isDirectory()) return git;
      if (path.dirname(dir) === dir) break;
    }
  }
  return null;
}
