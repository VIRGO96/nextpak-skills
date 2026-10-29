#!/usr/bin/env node
// Team guardrails: install them into a project.
//
//   node tools/guardrails.mjs install <project> [--tool claude|agents|codex|all, or a list: agents,codex] [--lead <github-user>] [--dry-run]
//
// Always (tool-independent):
//   .guardrails/                 agent-guard.mjs (hook for all tools), check-staged.mjs, git-hooks/pre-commit
//   git config core.hooksPath    .guardrails/git-hooks (this clone; teammates run it once, see output)
//   .github/workflows/ai-guardrails.yml, .github/pull_request_template.md (if missing),
//   .github/CODEOWNERS for agent config (only with --lead), .gitignore secret patterns, AGENTS.md block
// Per tool:
//   claude: .claude/settings.json  permissions (allow/ask/deny) + PreToolUse hook, merged
//   codex:  .codex/rules/nextpak.rules + .codex/hooks.json (trusted projects only)
//   agents: .agents/hooks.json (Antigravity); permissions are per user: guardrails/antigravity.md
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
const SRC = path.join(REPO, 'guardrails');
const GUARD_CMD = /agent-guard\.mjs/;

function fail(msg) { console.error(msg); process.exit(1); }

function parseArgs(argv) {
  const opts = { tool: 'all', dry: false, lead: '' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tool') opts.tool = argv[++i];
    else if (a === '--lead') opts.lead = String(argv[++i] ?? '').replace(/^@/, '');
    else if (a === '--dry-run') opts.dry = true;
    else rest.push(a);
  }
  return { opts, rest };
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { fail(`${file} is not valid JSON; fix it and run again.`); }
}

function makeWriter(dry) {
  return (file, content) => {
    if (dry) { console.log(`  would write ${file}`); return; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`  wrote ${file}`);
  };
}

function managedBlock(text, begin, end, block) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${esc(begin)}[\\s\\S]*?${esc(end)}\\n?`);
  const wrapped = `${begin}\n${block}\n${end}\n`;
  return re.test(text) ? text.replace(re, wrapped) : `${text.replace(/\n*$/, text ? '\n\n' : '')}${wrapped}`;
}

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filesUnder(p) : [p];
  });
}

// Replace our hook entries (identified by agent-guard.mjs in the command), keep everyone else's.
function mergeHookGroups(existing = [], ours = []) {
  const others = existing
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !GUARD_CMD.test(h.command ?? '')) }))
    .filter((g) => g.hooks.length);
  return [...others, ...ours];
}

const AGENTS_BLOCK = `## Guardrails in this project

A hook checks every command and file access before it runs (\`.guardrails/agent-guard.mjs\`), and a
pre-commit hook and CI scan for secrets. They block production targets, deploys and publishing,
force-push, skipping git hooks, destructive SQL and database resets, wide deletes, piping downloads
into a shell, secret files and env dumps, and edits to agent or guardrail config.

- When a guardrail blocks something, stop and tell the developer what you wanted to do and why.
  Never work around it (another command, a script, an encoding, a copy of the file).
- Never use \`--no-verify\`. If the pre-commit hook fails, fix what it reports.
- Changes to \`.guardrails/\`, \`.claude/\`, \`.codex/\`, \`.agents/\`, \`.mcp.json\` are made by a person
  and reviewed in a PR.`;

const GITIGNORE_BLOCK = `.env
.env.*
!.env.example
!.env.*.example
*.pem
*.key
dbhub.toml`;

function install(project, opts) {
  if (!project || !fs.existsSync(project)) fail(`Project directory not found: ${project ?? '<none>'}`);
  const tools = opts.tool === 'all' ? ['claude', 'agents', 'codex'] : String(opts.tool).split(',');
  if (tools.some((t) => !['claude', 'agents', 'codex'].includes(t))) fail('--tool must be claude, agents, codex or all');
  const write = makeWriter(opts.dry);
  const notes = [];
  const isGit = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: project, encoding: 'utf8' }).stdout.trim() === 'true';
  console.log(`Guardrails for: ${tools.join(', ')}`);

  // 1. Files copied as-is (.guardrails/ always replaced; GitHub files only when missing, except our workflow).
  const filesDir = path.join(SRC, 'files');
  for (const src of filesUnder(filesDir)) {
    const rel = path.relative(filesDir, src);
    const dest = path.join(project, rel);
    const relPosix = rel.split(path.sep).join('/');
    if (relPosix.startsWith('.codex/') && !tools.includes('codex')) continue;
    const managed = relPosix.startsWith('.guardrails/') || relPosix.startsWith('.codex/rules/') || relPosix === '.github/workflows/ai-guardrails.yml';
    if (!managed && fs.existsSync(dest)) { console.log(`  kept existing ${dest}`); continue; }
    write(dest, fs.readFileSync(src));
  }
  if (!opts.dry) fs.chmodSync(path.join(project, '.guardrails', 'git-hooks', 'pre-commit'), 0o755);

  // 2. Git hooks for this clone, and the executable bit in git so it works on macOS/Linux too.
  if (isGit) {
    if (opts.dry) console.log('  would run git config core.hooksPath .guardrails/git-hooks');
    else {
      spawnSync('git', ['config', 'core.hooksPath', '.guardrails/git-hooks'], { cwd: project });
      spawnSync('git', ['add', '--chmod=+x', '.guardrails/git-hooks/pre-commit'], { cwd: project });
      console.log('  set git config core.hooksPath .guardrails/git-hooks (and staged pre-commit as executable)');
    }
  } else notes.push('Not a git repo yet: after git init, run  git config core.hooksPath .guardrails/git-hooks');
  notes.push('Every teammate runs once after cloning:  git config core.hooksPath .guardrails/git-hooks\n' +
    '  (Node projects can do it automatically: "prepare": "git config core.hooksPath .guardrails/git-hooks" in package.json)');
  notes.push('Recommended: install gitleaks (winget install gitleaks / brew install gitleaks / scoop install gitleaks) for the full secret scan before each commit.');

  // 3. CODEOWNERS: agent config needs a lead's review (with branch protection "Require review from Code Owners").
  if (opts.lead) {
    const file = path.join(project, '.github', 'CODEOWNERS');
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const owner = `@${opts.lead}`;
    const lines = ['.guardrails/', '.claude/', '.codex/', '.agents/', '.mcp.json', 'AGENTS.md', 'CLAUDE.md', '.github/workflows/']
      .map((p) => `/${p} ${owner}`).join('\n');
    write(file, managedBlock(text, '# BEGIN nextpak-guardrails', '# END nextpak-guardrails', `# Agent and guardrail config: reviewed by a lead\n${lines}`));
  } else notes.push('No --lead given: add one (e.g. --lead your-github-user) to create CODEOWNERS for agent config files.');
  notes.push('GitHub settings (repo admin, once): protect main (require a PR, the "AI guardrails" checks and Code Owner review; block force-push).');

  // 4. .gitignore secret patterns.
  const gi = path.join(project, '.gitignore');
  const giText = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  write(gi, managedBlock(giText, '# BEGIN nextpak-guardrails', '# END nextpak-guardrails', GITIGNORE_BLOCK));
  // LF line endings for the hook scripts, so a commit from Windows still runs on macOS/Linux.
  const ga = path.join(project, '.gitattributes');
  const gaText = fs.existsSync(ga) ? fs.readFileSync(ga, 'utf8') : '';
  write(ga, managedBlock(gaText, '# BEGIN nextpak-guardrails', '# END nextpak-guardrails', '.guardrails/** text eol=lf'));

  // 5. Per tool.
  if (tools.includes('claude')) {
    const ours = readJson(path.join(SRC, 'claude-settings.json'), {});
    const file = path.join(project, '.claude', 'settings.json');
    const s = readJson(file, {});
    s.permissions ??= {};
    for (const k of ['allow', 'ask', 'deny']) s.permissions[k] = [...new Set([...(s.permissions[k] ?? []), ...ours.permissions[k]])];
    s.permissions.disableBypassPermissionsMode = 'disable';
    s.hooks ??= {};
    s.hooks.PreToolUse = mergeHookGroups(s.hooks.PreToolUse, ours.hooks.PreToolUse);
    write(file, JSON.stringify(s, null, 2) + '\n');
  }
  if (tools.includes('codex')) {
    const ours = readJson(path.join(SRC, 'codex-hooks.json'), {});
    const file = path.join(project, '.codex', 'hooks.json');
    const h = readJson(file, {});
    h.description ??= ours.description;
    h.hooks ??= {};
    h.hooks.PreToolUse = mergeHookGroups(h.hooks.PreToolUse, ours.hooks.PreToolUse);
    write(file, JSON.stringify(h, null, 2) + '\n');
    notes.push('Codex: project rules and hooks load only in a trusted project. Run /hooks once in Codex to review and trust the hook.');
  }
  if (tools.includes('agents')) {
    const ours = readJson(path.join(SRC, 'antigravity-hooks.json'), {});
    const file = path.join(project, '.agents', 'hooks.json');
    const h = readJson(file, {});
    write(file, JSON.stringify({ ...h, ...ours }, null, 2) + '\n');
    notes.push('Antigravity: permissions are per user, not per project. Each developer follows guardrails/antigravity.md once (5 minutes).');
  }

  // 6. AGENTS.md block.
  const agentsMd = path.join(project, 'AGENTS.md');
  if (fs.existsSync(agentsMd)) {
    write(agentsMd, managedBlock(fs.readFileSync(agentsMd, 'utf8'), '<!-- BEGIN nextpak-guardrails -->', '<!-- END nextpak-guardrails -->', AGENTS_BLOCK));
  } else notes.push('No AGENTS.md: run tools/install.sh first so agents know the guardrail rules.');

  console.log(`\n${notes.map((n) => `- ${n}`).join('\n')}`);
  console.log('\nCheck it: ask the agent to "print the environment variables". It should be blocked by the team guardrails.');
}

const { opts, rest } = parseArgs(process.argv.slice(2));
const [cmd, project] = rest;
if (cmd === 'install') install(project, opts);
else fail('Usage: node tools/guardrails.mjs install <project> [--tool claude|agents|codex|all] [--lead <github-user>] [--dry-run]');
